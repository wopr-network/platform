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
// Baseline file: tracks the last upstream SHA we synced from. Required for
// graft-based 3-way merge when the original `git subtree --squash` metadata
// was lost (which silently no-op'd this script for 17 days through 2026-04-25
// and let CVE-2026-41679 sit in our fork unpatched).
const BASELINE_FILE = `${SUBTREE_PREFIX}/.upstream-baseline`;
const FORK_TRUNK_BRANCH = "paperclip-fork-trunk-sync";

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

// --- Subtree merge (graft-based, since the squash metadata is gone) ---
//
// The original implementation used `git subtree pull --squash`, which silently
// no-op'd when it couldn't find a squash-base in the merge-commit history.
// That's how we missed v2026.416.0 (the CVE-2026-41679 patch) for 9 days.
//
// New approach: maintain a baseline-SHA file (`sidecars/paperclip/.upstream-baseline`)
// recording the last successfully-synced upstream commit. Each run:
//   1. Read baseline. If missing or unreachable from upstream/master, FAIL LOUD.
//   2. If upstream HEAD == baseline, truly nothing to do.
//   3. Otherwise: subtree-split into a synthetic linear branch, graft the
//      baseline as the root's parent so 3-way merge has the correct base,
//      merge upstream/master, resolve conflicts via agent (preserving fork
//      patches), then archive-extract the merged tree back into the prefix.
//   4. Write the new baseline SHA. Commit.
async function mergeUpstream() {
  log("Fetching upstream...");
  run(`git fetch ${UPSTREAM_REMOTE}`);

  const upstreamHead = run(`git rev-parse ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  log(`Upstream HEAD: ${upstreamHead}`);

  // CANARY 1: baseline file must exist
  if (!existsSync(BASELINE_FILE)) {
    die(
      `${BASELINE_FILE} is missing. Cannot determine merge base. ` +
        `Manual sync required. After resolving the next sync by hand, write the ` +
        `merged upstream SHA to ${BASELINE_FILE} and commit it. ` +
        `This file gates every future sync — its absence means future runs will not silently no-op.`,
    );
  }
  const baseline = readFileSync(BASELINE_FILE, "utf-8").trim();
  if (!/^[0-9a-f]{40}$/.test(baseline)) {
    die(`${BASELINE_FILE} contents are not a 40-char SHA: ${JSON.stringify(baseline)}`);
  }
  log(`Baseline (last synced upstream SHA): ${baseline}`);

  // CANARY 2: baseline must be reachable from current upstream/master.
  // If not, upstream rewrote history or our baseline is wrong.
  const reachable = tryRun(`git merge-base --is-ancestor ${baseline} ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  if (!reachable.ok) {
    die(
      `Baseline ${baseline} is NOT reachable from ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}. ` +
        `Upstream may have rewritten history, or the baseline file is wrong. ` +
        `Manual investigation required — do NOT run this script again until resolved.`,
    );
  }

  // Truly up-to-date check
  if (baseline === upstreamHead) {
    log(`Up to date with upstream (${baseline.slice(0, 8)}). No sync needed.`);
    return { merged: false, behind: 0, upstreamHead };
  }
  const deltaCount = run(`git rev-list --count ${baseline}..${upstreamHead}`);
  log(`Upstream is ${deltaCount} commits ahead of baseline. Syncing.`);
  logEvent("sync", { type: "delta", baseline, upstreamHead, deltaCount: parseInt(deltaCount, 10) });

  // Step 1: split subtree into synthetic linear history
  log("Splitting subtree into synthetic fork-trunk...");
  tryRun(`git branch -D ${FORK_TRUNK_BRANCH}`); // clean any stale leftover
  run(`git subtree split --prefix=${SUBTREE_PREFIX} --branch=${FORK_TRUNK_BRANCH}`);

  // Step 2: set up graft so 3-way merge has the right base
  const forkTrunkRoot = run(`git rev-list --max-parents=0 ${FORK_TRUNK_BRANCH}`);
  log(`Fork-trunk root: ${forkTrunkRoot}, grafting baseline ${baseline} as parent`);
  tryRun(`git replace -d ${forkTrunkRoot}`); // clean any prior graft for this root
  run(`git replace --graft ${forkTrunkRoot} ${baseline}`);

  // Verify graft worked
  const mergeBase = tryRun(`git merge-base ${FORK_TRUNK_BRANCH} ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  if (!mergeBase.ok || !mergeBase.output.trim()) {
    die(`Graft did not produce a usable merge-base. Aborting.`);
  }
  log(`Merge-base after graft: ${mergeBase.output.trim()}`);

  // Step 3: merge on the synthetic branch
  const monorepoBranch = run("git rev-parse --abbrev-ref HEAD");
  run(`git checkout ${FORK_TRUNK_BRANCH}`);
  const datestamp = new Date().toISOString().slice(0, 10);
  const mergeResult = tryRun(
    `git merge ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} --no-edit -m "merge upstream master ${datestamp}"`,
  );

  if (!mergeResult.ok) {
    // Conflicts expected; invoke agent to resolve
    const conflicting = run(`git diff --name-only --diff-filter=U`);
    if (!conflicting.trim()) {
      run(`git checkout ${monorepoBranch}`);
      die(`Merge failed but no conflicts found. Output:\n${mergeResult.output}`);
    }
    const conflictFiles = conflicting;
    log(`Merge has conflicts in ${conflictFiles.split("\n").filter(Boolean).length} files. Invoking agent...`);
    logEvent("merge", { type: "conflicts", count: conflictFiles.split("\n").filter(Boolean).length });

    await runAgent(
      `Merge conflicts in a fork of paperclipai/paperclip. You're on the synthetic
\`${FORK_TRUNK_BRANCH}\` branch (subtree-split linear history of our fork). The merge
of \`${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}\` left ${conflictFiles.split("\n").filter(Boolean).length}
files with conflict markers.

Resolution rules:
- Preserve every fork patch testing isHosted, hostedMode, useHostedMode, showProjects,
  modeKnown, hosted_proxy. KEEP these guards.
- Preserve fork-only files: Dockerfile.managed, managed-entrypoint.sh,
  docker-compose.{quickstart,untrusted-review}.yml, provision routes, EmbeddedBridge,
  useHostedMode hook, test-harness/, agent-sandbox spec.
- Preserve UI QoL patches per AGENTS.md: stderr_group/tool_group accordions in
  RunTranscriptView, LatestRunCard markdown excerpt, deleteLabel mutation in
  IssueProperties, Feedback Sharing in CompanySettings.
- Self-hosted runner CI changes — KEEP.
- For files where we have no fork mods (compare HEAD vs merge-base), take theirs.
- For all other conflicts: read both sides, take upstream's structural changes,
  keep our guards.
- Do NOT git merge --abort.

After resolving, run: git add -A && git commit --no-edit -m "merge upstream master ${datestamp} (conflicts resolved)"`,
      { model: "claude-haiku-4-5-20251001", phase: "merge-conflicts", maxTurns: 200 },
    );

    const remaining = tryRun("git diff --name-only --diff-filter=U");
    if (remaining.ok && remaining.output.trim()) {
      run(`git checkout ${monorepoBranch}`);
      die(`Conflicts remain after agent: ${remaining.output}`);
    }

    // Agent may have already committed; if not, commit
    const stillStaged = tryRun("git diff --cached --name-only");
    if (stillStaged.ok && stillStaged.output.trim()) {
      run(`git commit --no-edit -m "merge upstream master ${datestamp} (conflicts resolved)"`);
    }
  }

  const forkTrunkMerged = run("git rev-parse HEAD");
  log(`Fork-trunk merge complete at ${forkTrunkMerged}`);

  // Step 4: fold back into the monorepo branch via tree replacement
  log(`Folding fork-trunk merge back into ${monorepoBranch}...`);
  run(`git checkout ${monorepoBranch}`);
  run(`rm -rf ${SUBTREE_PREFIX}`);
  run(`mkdir -p ${SUBTREE_PREFIX}`);
  run(`git archive ${forkTrunkMerged} | tar -x -C ${SUBTREE_PREFIX}`);

  // Step 5: update baseline file
  writeFileSync(BASELINE_FILE, upstreamHead + "\n");
  log(`Updated ${BASELINE_FILE} -> ${upstreamHead}`);

  run(`git add -A ${SUBTREE_PREFIX}`);
  const commitMsg =
    `chore(paperclip): sync upstream master ${datestamp}\n\n` +
    `Synced sidecars/paperclip with paperclipai/paperclip@${upstreamHead.slice(0, 8)}, ` +
    `${deltaCount} commits ahead of prior baseline ${baseline.slice(0, 8)}.\n\n` +
    `Upstream-Baseline-Sha: ${upstreamHead}`;
  run(`git commit -m ${JSON.stringify(commitMsg)}`);

  return { merged: true, behind: parseInt(deltaCount, 10), upstreamHead };
}

// --- hostedMode scan ---
function scanForHostedModeGaps() {
  log("Scanning for hostedMode gaps...");
  const gaps = [];

  const componentsDir = `${UI_DIR}/components`;
  const pagesDir = `${UI_DIR}/pages`;

  for (const dir of [componentsDir, pagesDir]) {
    if (!existsSync(dir)) continue;

    // Find all .tsx files, excluding test files
    let allFiles = [];
    try {
      const files = readdirSync(dir, { recursive: true });
      allFiles = files
        .filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && !f.includes(".render."))
        .map((f) => `${dir}/${f}`);
    } catch {
      /* skip */
    }

    for (const file of allFiles) {
      // Skip if already has hostedMode guard
      const hasGuard = tryRun(`grep -l 'useHostedMode\\|isHosted\\|hostedMode' ${file}`);
      if (hasGuard.ok) continue;

      // Look for actual UI infra exposure patterns (not just imports/types):
      // - listUIAdapters() calls (adapter selection UI)
      // - getUIAdapter( calls (adapter config form rendering)
      // - Model selection UI elements
      // - Provider/endpoint configuration forms
      // - API key input fields
      // - showProjects/modeKnown conditionals (fork-specific)
      const infraUIPatterns = [
        "listUIAdapters",         // Adapter picker UI
        "getUIAdapter",           // Adapter config rendering
        "AdapterConfigForm",      // Adapter form component
        "model.*Picker",          // Model selection
        "EndpointConfig",         // Endpoint UI
        "ApiKeyInput",            // Credentials
        "showProjects",           // Fork-specific visibility
        "modeKnown",              // Fork-specific checks
        "hosted_proxy",           // Infra reference
      ];

      let hasInfraUI = false;
      for (const pattern of infraUIPatterns) {
        const matches = tryRun(`grep '${pattern}' ${file}`);
        if (matches.ok && matches.output.trim()) {
          hasInfraUI = true;
          break;
        }
      }

      if (hasInfraUI) {
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

hostedMode context:
- In hosted mode (isHosted=true): users cannot configure adapters, plugins, instance settings,
  or any infrastructure details. They run pre-configured agents against Anthropic's infrastructure.
- In self-hosted mode (isHosted=false): full admin/developer UX for configuration is visible.

The hostedMode guard pattern used in this codebase:
\`\`\`tsx
import { Navigate } from "@/lib/router";
import { useHostedMode } from "../hooks/useHostedMode";

export function SomeInfraPage() {
  const { isHosted, modeKnown } = useHostedMode();

  // If mode isn't yet known, return null (loading state)
  if (!modeKnown) return null;

  // If hosted, redirect to home (infrastructure pages don't exist in hosted mode)
  if (isHosted) return <Navigate to="/" replace />;

  // Rest of component only renders in self-hosted mode
  return <div>Infrastructure UI here...</div>;
}
\`\`\`

For components that render WITHIN a page (not whole pages):
\`\`\`tsx
const { isHosted } = useHostedMode();
return (
  <div>
    {!isHosted && <AdapterPicker />}  {/* Only show adapter UI in self-hosted mode */}
    <CommonUI />
  </div>
);
\`\`\`

Files that need guards:
- Pages that let users configure adapters, models, endpoints, API keys, instance settings
- Components that render adapter/model picker UIs
- Components with showProjects or modeKnown or hosted_proxy conditionals
- Components calling listUIAdapters() or getUIAdapter()
- Components rendering AdapterConfigForm

For each file:
1. Read the file and identify if it's a page or component
2. Check if it renders UI for: adapter selection, model selection, API key input, endpoint config, instance settings, plugin management
3. If it's a page: add full-page guard (check isHosted at top, return Navigate if hosted)
4. If it's a component: add conditional rendering {!isHosted && <UI />}
5. If file only contains helpers/types with no UI, SKIP it
6. Ensure Navigate import is present for page redirects

Common exclusions (SKIP these):
- Pure type/utility files
- Components that are children of already-guarded parents (e.g., form fields inside AdapterConfigForm)
- Test files
- Files that reference adapters only in import statements or type annotations

After fixing all files, run: git add -A && git commit -m "fix: add hostedMode guards for infrastructure UI"`,
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
