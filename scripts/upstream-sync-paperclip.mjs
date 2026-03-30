#!/usr/bin/env node
/**
 * upstream-sync-paperclip.mjs
 *
 * Keeps sidecars/paperclip/ synced with paperclipai/paperclip upstream via subtree.
 * After sync, scans for new UI elements that leak infra without hostedMode guards
 * and fixes them via Claude agent.
 *
 * Usage:
 *   node scripts/upstream-sync-paperclip.mjs [options]
 *
 * Options:
 *   --dry-run    Report gaps but don't fix or push
 *   --push       Push directly to main after sync
 *   --pr         Create a PR instead of pushing
 *   --scan-only  Just scan for hostedMode gaps, no subtree pull
 */

import { execSync } from "node:child_process";
import { existsSync, appendFileSync, writeFileSync, copyFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_PUSH = process.argv.includes("--push");
const CREATE_PR = process.argv.includes("--pr");
const SCAN_ONLY = process.argv.includes("--scan-only");
const SUBTREE_PREFIX = "sidecars/paperclip";
const UPSTREAM_REMOTE = "paperclip-upstream";
const UPSTREAM_BRANCH = "master";
const UI_DIR = `${SUBTREE_PREFIX}/ui/src`;

// Agent event log
const AGENT_LOG_TMP = join("/tmp", `agent-events-${Date.now()}.log`);
const AGENT_LOG_PATH = join(CWD, "agent-events.log");
writeFileSync(AGENT_LOG_TMP, `=== upstream-sync-paperclip agent log — ${new Date().toISOString()} ===\n`);

function log(msg) {
  console.log(`[upstream-sync] ${msg}`);
}
function die(msg) {
  log(`FATAL: ${msg}`);
  flushLog();
  process.exit(1);
}
function logEvent(phase, data) {
  const line = JSON.stringify({ ts: new Date().toISOString(), phase, ...data }) + "\n";
  appendFileSync(AGENT_LOG_TMP, line);
}
function flushLog() {
  try {
    if (existsSync(AGENT_LOG_TMP)) copyFileSync(AGENT_LOG_TMP, AGENT_LOG_PATH);
  } catch {
    /* best effort */
  }
}

function run(cmd) {
  return execSync(cmd, { cwd: CWD, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function tryRun(cmd) {
  try {
    return { ok: true, output: run(cmd) };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.message || "").trim() };
  }
}

function gitPush(cmd) {
  const token = process.env.GH_TOKEN;
  if (token) {
    const url = run("git remote get-url origin");
    const authed = url.replace("https://", `https://x-access-token:${token}@`);
    run(`git remote set-url origin ${authed}`);
  }
  run(`git ${cmd}`);
}

// --- Agent SDK ---
let _query;
async function loadSdk() {
  if (_query) return;
  const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
  const candidates = ["@anthropic-ai/claude-agent-sdk", `${globalRoot}/@anthropic-ai/claude-agent-sdk/sdk.mjs`];
  for (const candidate of candidates) {
    try {
      const sdk = await import(candidate);
      _query = sdk.query;
      return;
    } catch {
      /* try next */
    }
  }
  die("@anthropic-ai/claude-agent-sdk not installed.");
}

async function runAgent(prompt, opts = {}) {
  await loadSdk();
  const phase = opts.phase ?? "unknown";
  const tools = opts.tools ?? ["Read", "Edit", "Write", "Bash", "Glob", "Grep"];
  let result = "";
  let turnCount = 0;

  log(
    `Agent [${phase}] starting (model: ${opts.model ?? "claude-haiku-4-5-20251001"}, maxTurns: ${opts.maxTurns ?? 60})`,
  );
  logEvent(phase, { type: "agent_start", model: opts.model, maxTurns: opts.maxTurns ?? 60 });

  for await (const event of _query({
    prompt,
    options: {
      model: opts.model ?? "claude-haiku-4-5-20251001",
      maxTurns: opts.maxTurns ?? 60,
      allowedTools: tools,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") result += block.text + "\n";
      }
      turnCount++;
    }
    if (event.type === "result") {
      logEvent(phase, { type: "agent_done", turns: turnCount });
      break;
    }
  }
  log(`Agent [${phase}] done in ${turnCount} turns.`);
  return result;
}

// --- Subtree merge ---
async function mergeUpstream() {
  log("Fetching upstream...");
  run(`git fetch ${UPSTREAM_REMOTE}`);

  const upstreamHead = run(`git rev-parse ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  log(`Upstream HEAD: ${upstreamHead}`);

  const mergeResult = tryRun(
    `git subtree pull --prefix=${SUBTREE_PREFIX} ${UPSTREAM_REMOTE} ${UPSTREAM_BRANCH} --squash -m "chore: sync paperclip upstream ${new Date().toISOString().slice(0, 10)}"`,
  );

  if (mergeResult.ok) {
    const diff = tryRun(`git diff HEAD~1 --stat -- ${SUBTREE_PREFIX}`);
    if (diff.ok && diff.output.trim()) {
      log("Subtree merge succeeded with changes.");
      return { merged: true, behind: 1 };
    }
    log("Subtree pull succeeded but no changes.");
    return { merged: false, behind: 0 };
  }

  // Check for conflicts
  const conflicting = tryRun("git diff --name-only --diff-filter=U");
  if (conflicting.ok && conflicting.output.trim()) {
    const conflictFiles = conflicting.output;
    log(`Merge has conflicts in:\n${conflictFiles}`);
    logEvent("merge", { type: "conflicts", files: conflictFiles });

    await runAgent(
      `The git subtree pull from paperclipai/paperclip into ${SUBTREE_PREFIX}/ has conflicts.

Conflicting files:
\`\`\`
${conflictFiles}
\`\`\`

Resolve ALL conflicts. Key rules:
- Preserve hostedMode guards (any code checking isHosted or hostedMode)
- For upstream-only changes to unguarded files, accept upstream version
- For files with our hostedMode patches, merge carefully — keep our guards

IMPORTANT: Do NOT use git merge --abort. Resolve all conflicts.`,
      { model: "claude-haiku-4-5-20251001", phase: "merge-conflicts" },
    );

    const addResult = tryRun("git add -A");
    if (!addResult.ok) die("Failed to stage resolved files.");

    const commitResult = tryRun(
      `git commit --no-edit -m "chore: sync paperclip upstream ${new Date().toISOString().slice(0, 10)} (conflicts resolved)"`,
    );
    if (!commitResult.ok) {
      const status = tryRun("git diff --name-only --diff-filter=U");
      if (status.ok && status.output.trim()) {
        die("Merge conflicts remain after agent intervention. Manual resolution needed.");
      }
    }

    return { merged: true, behind: 1 };
  }

  log(`Subtree pull failed: ${mergeResult.output}`);
  return { merged: false, behind: 0 };
}

// --- hostedMode scan ---
function scanForHostedModeGaps() {
  log("Scanning for hostedMode gaps...");
  const gaps = [];

  const componentsDir = `${UI_DIR}/components`;
  const pagesDir = `${UI_DIR}/pages`;

  for (const dir of [componentsDir, pagesDir]) {
    if (!existsSync(dir)) continue;

    // Find .tsx files that reference infra concepts but lack hostedMode guards
    const infraPatterns = [
      "adapter",
      "model.*select",
      "provider.*config",
      "inference.*url",
      "api.*key.*input",
      "endpoint.*config",
      "instance.*settings",
    ];

    const grepPattern = infraPatterns.join("\\|");
    const filesWithInfra = tryRun(`grep -rli '${grepPattern}' ${dir} --include='*.tsx' 2>/dev/null`);

    if (!filesWithInfra.ok || !filesWithInfra.output.trim()) continue;

    for (const file of filesWithInfra.output.split("\n").filter(Boolean)) {
      // Check if file has hostedMode guard
      const hasGuard = tryRun(`grep -l 'hostedMode\\|isHosted' ${file}`);
      if (!hasGuard.ok) {
        gaps.push(file);
      }
    }
  }

  log(`Found ${gaps.length} files with potential hostedMode gaps.`);
  logEvent("scan", { type: "gaps_found", count: gaps.length, files: gaps });
  return gaps;
}

async function fixHostedModeGaps(gaps) {
  if (gaps.length === 0) return;

  const fileList = gaps.join("\n");
  log(`Fixing hostedMode gaps in ${gaps.length} files...`);

  await runAgent(
    `The following React components/pages in ${SUBTREE_PREFIX}/ui/src/ expose infrastructure
details (adapter pickers, model selectors, settings, API key inputs) that should be
hidden when the app runs in hosted mode.

Files missing hostedMode guards:
\`\`\`
${fileList}
\`\`\`

The hostedMode pattern used in this codebase:
\`\`\`tsx
import { useHostedMode } from "../hooks/useHostedMode";
// ...
const { isHosted } = useHostedMode();
// Then conditionally render:
{!isHosted && <InfraComponent />}
// Or for entire pages:
if (isHosted) return <Navigate to="/" replace />;
\`\`\`

For each file:
1. Read the file
2. Identify which elements expose infra to the user (adapter pickers, model selectors, settings controls, "new agent" buttons, etc.)
3. Add the hostedMode guard following the exact pattern shown above
4. If the file is a page that should be entirely hidden in hosted mode, add a redirect
5. If the file has buttons/links that let users create agents manually, hide them in hosted mode
6. If the file is a component that only renders inside an already-guarded parent, note it and SKIP

After fixing, run: git add -A && git commit -m "fix: add hostedMode guards for new upstream UI"`,
    { model: "claude-haiku-4-5-20251001", phase: "hostedmode-fix", maxTurns: 90 },
  );
}

// --- Build check ---
async function buildCheck() {
  log("Running build check...");

  const uiDir = `${SUBTREE_PREFIX}/ui`;
  const hasTsconfig = existsSync(`${uiDir}/tsconfig.json`);

  if (hasTsconfig) {
    log("Installing UI dependencies...");
    const install = tryRun(`cd ${uiDir} && npm install --ignore-scripts 2>&1`);
    if (!install.ok) {
      log(`Warning: npm install failed: ${install.output.slice(0, 500)}`);
    }

    log("Running TypeScript check...");
    const tsc = tryRun(`cd ${uiDir} && npx tsc --noEmit 2>&1`);
    if (!tsc.ok) {
      log("TypeScript build failed. Invoking agent to fix...");
      await runAgent(
        `The TypeScript build is failing after an upstream sync + hostedMode guard additions.

Build output:
\`\`\`
${tsc.output.slice(0, 3000)}
\`\`\`

Fix the TypeScript errors. Common issues:
- Missing imports for useHostedMode or Navigate
- Type errors from incorrect conditional rendering
- Import path issues

Do NOT remove hostedMode guards to fix the build. Fix the guards instead.
After fixing, run: git add -A && git commit -m "fix: resolve build errors after upstream sync"`,
        { model: "claude-haiku-4-5-20251001", phase: "build-fix" },
      );

      const recheck = tryRun(`cd ${uiDir} && npx tsc --noEmit 2>&1`);
      if (!recheck.ok) {
        log(`Build still failing: ${recheck.output.slice(0, 1000)}`);
        return false;
      }
    }
    log("Build passed.");
  }

  return true;
}

// --- Push or PR ---
function pushOrPr() {
  if (DRY_RUN) {
    log("Dry run — skipping push.");
    return;
  }

  if (AUTO_PUSH) {
    log("Pushing to origin/main...");
    gitPush("push origin main");
    log("Pushed successfully.");
  } else if (CREATE_PR) {
    const datestamp = new Date().toISOString().slice(0, 10);
    const branch = `sync/paperclip-upstream-${datestamp}`;
    tryRun(`git branch -D ${branch}`);
    tryRun(`git push origin --delete ${branch}`);
    run(`git checkout -b ${branch}`);
    gitPush(`push -u origin ${branch} --force`);

    const prBody = [
      "## Automated upstream sync — Paperclip",
      "",
      "Synced `sidecars/paperclip/` with latest from paperclipai/paperclip upstream.",
      "",
      "### What this does",
      "- Pulls in latest upstream changes (features, bug fixes, refactors)",
      "- Resolves any merge conflicts (preserving hostedMode guards)",
      "- Scans for new UI elements that leak infra without hostedMode guards",
      "- Fixes any gaps found",
      "",
      "### Verify",
      "- [ ] Build passes",
      "- [ ] hostedMode still hides all infra UI",
      "- [ ] No adapter/model selection visible in hosted mode",
    ].join("\n");

    const pr = tryRun(
      `gh pr create --repo wopr-network/platform --title "sync: paperclip upstream (${datestamp})" --body "${prBody.replace(/"/g, '\\"')}" --base main`,
    );
    if (pr.ok) {
      log(`PR created: ${pr.output}`);
    } else {
      log(`PR creation failed: ${pr.output}`);
    }
  }
}

// --- Main ---
async function main() {
  log("Starting paperclip upstream sync...");
  logEvent("main", { type: "start", mode: DRY_RUN ? "dry-run" : AUTO_PUSH ? "push" : SCAN_ONLY ? "scan-only" : "pr" });

  // Ensure upstream remote exists
  const remoteCheck = tryRun(`git remote get-url ${UPSTREAM_REMOTE}`);
  if (!remoteCheck.ok) {
    run(`git remote add ${UPSTREAM_REMOTE} https://github.com/paperclipai/paperclip.git`);
  }

  if (!SCAN_ONLY) {
    const { merged, behind } = await mergeUpstream();

    if (!merged && behind === 0) {
      log("Up to date with upstream.");
      // Still run hostedMode scan in case gaps exist from previous syncs
    }
  }

  // Scan for hostedMode gaps
  const gaps = scanForHostedModeGaps();

  if (gaps.length > 0) {
    if (DRY_RUN) {
      log("Dry run — listing gaps only:");
      for (const g of gaps) log(`  - ${g}`);
    } else {
      await fixHostedModeGaps(gaps);
    }
  }

  if (!DRY_RUN) {
    const buildOk = await buildCheck();
    if (!buildOk) {
      die("Build failed. Not pushing.");
    }

    pushOrPr();
  }

  flushLog();
  log("Done.");
}

main().catch((err) => {
  log(`Unhandled error: ${err.message}`);
  logEvent("main", { type: "error", message: err.message });
  flushLog();
  process.exit(1);
});
