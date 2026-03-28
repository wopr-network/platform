#!/usr/bin/env node
/**
 * Upstream sync for NemoClaw subtree in the platform monorepo.
 *
 * Pulls latest from NVIDIA/NemoClaw into sidecars/nemoclaw/ using git subtree,
 * resolves conflicts via Claude agent, verifies build, and creates a PR.
 */

import { execSync } from "node:child_process";
import { existsSync, appendFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_PUSH = process.argv.includes("--push");
const CREATE_PR = process.argv.includes("--pr");
const SUBTREE_PREFIX = "sidecars/nemoclaw";
const UPSTREAM_REMOTE = "nemoclaw-upstream";
const UPSTREAM_BRANCH = "main";

// Agent event log
const AGENT_LOG_TMP = join("/tmp", `agent-events-${Date.now()}.log`);
const AGENT_LOG_PATH = join(CWD, "agent-events.log");
writeFileSync(AGENT_LOG_TMP, `=== upstream-sync-nemoclaw agent log — ${new Date().toISOString()} ===\n`);

function log(msg) { console.log(`[upstream-sync] ${msg}`); }
function die(msg) { log(`FATAL: ${msg}`); flushLog(); process.exit(1); }
function logEvent(phase, data) {
  const line = JSON.stringify({ ts: new Date().toISOString(), phase, ...data }) + "\n";
  appendFileSync(AGENT_LOG_TMP, line);
}
function flushLog() {
  try {
    if (existsSync(AGENT_LOG_TMP)) copyFileSync(AGENT_LOG_TMP, AGENT_LOG_PATH);
  } catch { /* best effort */ }
}

function run(cmd) {
  return execSync(cmd, { cwd: CWD, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function tryRun(cmd) {
  try {
    return { ok: true, output: run(cmd) };
  } catch (e) {
    return { ok: false, output: e.stderr?.toString() ?? e.message };
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
  const candidates = [
    "@anthropic-ai/claude-agent-sdk",
    `${globalRoot}/@anthropic-ai/claude-agent-sdk/sdk.mjs`,
  ];
  for (const candidate of candidates) {
    try {
      const sdk = await import(candidate);
      _query = sdk.query;
      return;
    } catch { /* try next */ }
  }
  die("@anthropic-ai/claude-agent-sdk not installed.");
}

async function runAgent(prompt, opts = {}) {
  await loadSdk();
  const phase = opts.phase ?? "unknown";
  const tools = opts.tools ?? ["Read", "Edit", "Write", "Bash", "Glob", "Grep"];
  let result = "";
  let turnCount = 0;

  log(`Agent [${phase}] starting (model: ${opts.model ?? "claude-haiku-4-5-20251001"}, maxTurns: ${opts.maxTurns ?? 60})`);
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

  // Check if there are new commits
  const upstreamHead = run(`git rev-parse ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`);
  log(`Upstream HEAD: ${upstreamHead}`);

  // Try subtree merge
  const mergeResult = tryRun(
    `git subtree pull --prefix=${SUBTREE_PREFIX} ${UPSTREAM_REMOTE} ${UPSTREAM_BRANCH} --squash -m "chore: sync nemoclaw upstream ${new Date().toISOString().slice(0, 10)}"`,
  );

  if (mergeResult.ok) {
    // Check if anything actually changed
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
      `The git subtree pull from NVIDIA/NemoClaw into ${SUBTREE_PREFIX}/ has conflicts.

Conflicting files:
\`\`\`
${conflictFiles}
\`\`\`

Resolve ALL conflicts. Preserve any WOPR-specific customizations (files in wopr/ directory, sidecar references).
For upstream-only files, accept the upstream version.
After resolving, run: git add <resolved files>

IMPORTANT: Do NOT use git merge --abort. Resolve all conflicts.`,
      { model: "claude-haiku-4-5-20251001", phase: "merge-conflicts" },
    );

    // Complete the merge
    const addResult = tryRun("git add -A");
    if (!addResult.ok) die("Failed to stage resolved files.");

    const commitResult = tryRun(
      `git commit --no-edit -m "chore: sync nemoclaw upstream ${new Date().toISOString().slice(0, 10)} (conflicts resolved)"`,
    );
    if (!commitResult.ok) {
      // Check if conflicts remain
      const status = tryRun("git diff --name-only --diff-filter=U");
      if (status.ok && status.output.trim()) {
        die("Merge conflicts remain after agent intervention. Manual resolution needed.");
      }
    }

    return { merged: true, behind: 1 };
  }

  // Subtree pull failed for non-conflict reason
  log(`Subtree pull failed: ${mergeResult.output}`);
  return { merged: false, behind: 0 };
}

// --- Build check ---
async function buildCheck() {
  log("Running build check...");

  // Check sidecar syntax if it exists
  const sidecarPath = `${SUBTREE_PREFIX}/wopr/sidecar.js`;
  if (existsSync(sidecarPath)) {
    const sidecarCheck = tryRun(`node --check ${sidecarPath}`);
    if (!sidecarCheck.ok) {
      log("Sidecar syntax check failed. Invoking agent to fix...");
      await runAgent(
        `The WOPR sidecar has a syntax error after upstream sync:
\`\`\`
${sidecarCheck.output.slice(0, 2000)}
\`\`\`
Fix the syntax error in ${sidecarPath}. Preserve all WOPR functionality.`,
        { model: "claude-haiku-4-5-20251001", phase: "sidecar-fix" },
      );
      const recheck = tryRun(`node --check ${sidecarPath}`);
      if (!recheck.ok) return false;
      run("git add -A && git commit -m 'fix: repair sidecar after upstream sync'");
    }
  }

  // Check Dockerfile integrity
  const dockerfile = `${SUBTREE_PREFIX}/Dockerfile`;
  if (existsSync(dockerfile)) {
    const content = run(`cat ${dockerfile}`);
    if (!content.includes("sidecar")) {
      log("WARNING: Dockerfile may be missing sidecar setup.");
    }
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
    const branch = `sync/nemoclaw-upstream-${datestamp}`;
    tryRun(`git branch -D ${branch}`);
    tryRun(`git push origin --delete ${branch}`);
    run(`git checkout -b ${branch}`);
    gitPush(`push -u origin ${branch} --force`);

    const prBody = [
      "## Automated upstream sync — NemoClaw",
      "",
      "Synced `sidecars/nemoclaw/` with latest from NVIDIA/NemoClaw upstream.",
      "",
      "### What this does",
      "- Pulls in latest upstream changes (security fixes, features, CI improvements)",
      "- Resolves any merge conflicts (preserving wopr/ sidecar)",
      "- Verifies sidecar + Dockerfile integrity",
      "",
      "### Verify",
      "- [ ] Build passes",
      "- [ ] wopr/sidecar.js intact",
      "- [ ] Dockerfile includes sidecar setup",
    ].join("\n");

    const pr = tryRun(
      `gh pr create --repo wopr-network/platform --title "sync: nemoclaw upstream (${datestamp})" --body "${prBody.replace(/"/g, '\\"')}" --base main`,
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
  log("Starting nemoclaw upstream sync...");
  logEvent("main", { type: "start", mode: DRY_RUN ? "dry-run" : AUTO_PUSH ? "push" : "pr" });

  // Ensure upstream remote exists
  const remoteCheck = tryRun(`git remote get-url ${UPSTREAM_REMOTE}`);
  if (!remoteCheck.ok) {
    run(`git remote add ${UPSTREAM_REMOTE} https://github.com/NVIDIA/NemoClaw.git`);
  }

  const { merged, behind } = await mergeUpstream();

  if (!merged && behind === 0) {
    log("Up to date. Nothing to do.");
    flushLog();
    return;
  }

  const buildOk = await buildCheck();
  if (!buildOk) {
    die("Build failed. Not pushing.");
  }

  pushOrPr();
  flushLog();
  log("Done.");
}

main().catch((err) => {
  log(`Unhandled error: ${err.message}`);
  logEvent("main", { type: "error", message: err.message });
  flushLog();
  process.exit(1);
});
