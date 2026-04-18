/**
 * The Holy Ship Engineering Flow.
 *
 * This is the product's opinion on how software gets shipped correctly.
 * Users customize via the pipeline configurator (toggle stages, add approval gates).
 * They do NOT define their own flows — this is baked in.
 *
 * Flow graph:
 *
 *   spec → code → review ←→ fix → docs → merge → done
 *                                          ↕
 *                                         fix (blocked loop)
 *
 * Learning is implicit — every agent gets a "what did you learn?" prompt
 * after signaling done, before container teardown. Updates knowledge.md
 * and ship.log as the last commit in the PR.
 *
 * Terminal states: done, stuck, cancelled, budget_exceeded
 */

import type {
  CreateFlowInput,
  CreateGateInput,
  CreateStateInput,
  CreateTransitionInput,
} from "../repositories/interfaces.js";

// ─── Flow Definition ───

export const ENGINEERING_FLOW: CreateFlowInput = {
  name: "engineering",
  description: "Ship correct code. Spec → Code → Review/Fix → Docs → Merge.",
  discipline: "engineering",
  initialState: "spec",
  maxConcurrent: 4,
  maxConcurrentPerRepo: 2,
  affinityWindowMs: 300_000,
  claimRetryAfterMs: 30_000,
  gateTimeoutMs: 120_000,
  defaultModelTier: "sonnet",
  maxInvocationsPerEntity: 50,
};

// ─── States ───

export const STATES: CreateStateInput[] = [
  {
    name: "spec",
    agentRole: "architect",
    modelTier: "sonnet",
    mode: "active",
    promptTemplate: `You are an architect. Read the codebase, analyze the issue, then POST the spec to the GitHub issue as a comment using the bash tool.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

{{entity.artifacts.issueBody}}

## Repo
{{entity.artifacts.repoFullName}}

## Instructions

1. Read the codebase under \`github/\` thoroughly. Understand existing patterns, conventions, and architecture.
2. Identify which files to create, modify, or delete.
3. Specify function signatures, data structures, and test cases.
4. **POST the spec to the GitHub issue using the bash tool.** Writing the spec as text in your response is not enough — it must be posted as a comment. Write the spec to a temp file, then run \`gh\`:

\`\`\`bash
cat > /tmp/spec.md <<'SPEC'
## Implementation Spec

<your detailed spec here — overview, files to touch, acceptance criteria>
SPEC
cd github && gh issue comment {{entity.artifacts.issueNumber}} --body-file /tmp/spec.md
\`\`\`

5. The first line of the comment MUST be exactly \`## Implementation Spec\` — the pipeline gate checks for that heading.
6. After \`gh\` succeeds, you're done. Do NOT paste the spec text in your response; the posting IS the spec.`,
  },
  {
    name: "code",
    agentRole: "coder",
    modelTier: "sonnet",
    mode: "active",
    promptTemplate: `You are a software engineer. Implement the architect's spec and create a PR.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

{{#if entity.artifacts.gate_failures}}
## Prior Gate Failures — Fix These First
{{#each entity.artifacts.gate_failures}}
- Gate: {{this.gateName}} — {{this.output}}
{{/each}}
{{/if}}

## Instructions
1. Follow the architect's spec closely.
2. Write clean, tested code.
3. Run the project's CI gate locally before pushing (lint, build, test).
4. Create a pull request with a clear description.
5. When the PR is created, you're done. The pipeline will detect the PR and verify CI.`,
  },
  {
    name: "review",
    agentRole: "reviewer",
    modelTier: "sonnet",
    mode: "active",
    promptTemplate: `You are a code reviewer. Check the PR for correctness, security, and quality.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

## Instructions
1. Read the full PR diff.
2. Check every automated review bot comment (CodeRabbit, Sourcery, etc.).
3. Verify CI is green.
4. Check for: bugs, security issues, missing tests, spec violations, dead code.
5. If you find issues, post them as a review comment on the PR requesting changes.
6. If everything looks good, approve the PR.
7. When you're done reviewing, you're done. The pipeline will check the PR review status.`,
  },
  {
    name: "fix",
    agentRole: "fixer",
    modelTier: "sonnet",
    mode: "active",
    promptTemplate: `You are a software engineer. Fix every issue found during review and push the fixes.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

{{#if entity.artifacts.reviewFindings}}
## Review Findings — Fix All of These
{{entity.artifacts.reviewFindings}}
{{/if}}

{{#if entity.artifacts.gate_failures}}
## Gate Failures
{{#each entity.artifacts.gate_failures}}
- {{this.gateName}}: {{this.output}}
{{/each}}
{{/if}}

## Instructions
1. Fix every finding. Do not skip any.
2. Run the CI gate locally (lint, build, test) before pushing.
3. Push to the same branch.
4. When you've pushed, you're done. The pipeline will detect the new commits and re-review.

If a finding fundamentally contradicts the architect's spec and cannot be resolved, explain why — the pipeline will detect this.`,
  },
  {
    name: "docs",
    agentRole: "technical-writer",
    modelTier: "sonnet",
    mode: "active",
    promptTemplate: `You are a technical writer. Update documentation to reflect the changes in this PR.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Architect's Spec
{{entity.artifacts.architectSpec}}

## Instructions
1. Read the PR diff and spec.
2. Update or create documentation (README, docs/, JSDoc, comments).
3. Push doc updates to the same branch. Do NOT create a new PR.
4. When you've pushed, you're done. The pipeline will detect the doc changes.`,
  },
  {
    name: "merge",
    agentRole: "merger",
    modelTier: "haiku",
    mode: "active",
    promptTemplate: `You are a merge agent. Merge the PR via the merge queue.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Instructions
1. Verify the PR is mergeable (no conflicts, CI green, reviews approved).
2. Add the PR to the merge queue or merge directly.
3. When you've queued or merged, you're done. The pipeline will check the PR status.`,
  },
  // Terminal states — no prompt templates, no agents
  {
    name: "done",
    mode: "passive",
  },
  {
    name: "stuck",
    mode: "passive",
  },
  {
    name: "cancelled",
    mode: "passive",
  },
  {
    name: "budget_exceeded",
    mode: "passive",
  },
];

// ─── Gates ───

export const GATES: CreateGateInput[] = [
  {
    name: "spec-posted",
    type: "primitive",
    primitiveOp: "issue_tracker.comment_exists",
    primitiveParams: {
      issueNumber: "{{entity.artifacts.issueNumber}}",
      pattern: "## Implementation Spec",
      artifactKey: "architectSpec",
    },
    timeoutMs: 120_000,
    failurePrompt:
      "The spec gate checked for a comment starting with '## Implementation Spec' on issue #{{entity.artifacts.issueNumber}} and did not find one. Post the spec as a comment on the issue. The comment MUST start with the exact heading '## Implementation Spec'.",
    timeoutPrompt: "The spec gate timed out after 2 minutes. The GitHub API may be slow. Try posting the spec again.",
    outcomes: {
      exists: { proceed: true },
      not_found: { proceed: false },
    },
  },
  {
    name: "ci-green",
    type: "primitive",
    primitiveOp: "vcs.ci_status",
    primitiveParams: {
      ref: "{{entity.artifacts.headSha}}",
    },
    timeoutMs: 600_000, // 10 minutes — CI can be slow
    failurePrompt:
      "CI checks failed on PR #{{entity.artifacts.prNumber}}. Check the failing runs, fix the issues, and push again.",
    timeoutPrompt: "CI checks are still running after 10 minutes. They may be queued or slow. The pipeline will retry.",
    outcomes: {
      passed: { proceed: true },
      pending: { toState: "review" }, // retry — CI still running
      failed: { toState: "fix" },
    },
  },
  {
    name: "pr-mergeable",
    type: "primitive",
    primitiveOp: "vcs.pr_status",
    primitiveParams: {
      pullNumber: "{{entity.artifacts.prNumber}}",
    },
    timeoutMs: 120_000,
    failurePrompt:
      "PR #{{entity.artifacts.prNumber}} is not mergeable. Check for conflicts or failing required checks.",
    outcomes: {
      merged: { proceed: true },
      mergeable: { proceed: true },
      blocked: { toState: "fix" },
      closed: { toState: "stuck" },
    },
  },
  {
    name: "pr-exists",
    type: "primitive",
    primitiveOp: "vcs.pr_for_branch",
    primitiveParams: {
      branchPattern: "agent/{{entity.id}}/",
    },
    timeoutMs: 120_000,
    failurePrompt: "No PR found from a branch matching the entity pattern. Create a PR from your working branch.",
    outcomes: {
      exists: { proceed: true },
      not_found: { proceed: false },
    },
  },
  {
    name: "review-status",
    type: "primitive",
    primitiveOp: "vcs.pr_review_status",
    primitiveParams: {
      pullNumber: "{{entity.artifacts.prNumber}}",
    },
    timeoutMs: 300_000,
    failurePrompt: "Could not determine PR review status for PR #{{entity.artifacts.prNumber}}.",
    outcomes: {
      clean: { proceed: true },
      has_issues: { toState: "fix" },
    },
  },
  {
    name: "pr-updated",
    type: "primitive",
    primitiveOp: "vcs.pr_head_changed",
    primitiveParams: {
      pullNumber: "{{entity.artifacts.prNumber}}",
      lastKnownSha: "{{entity.artifacts.headSha}}",
    },
    timeoutMs: 120_000,
    failurePrompt: "PR head SHA has not changed since last review. Push your fixes to the branch.",
    outcomes: {
      changed: { proceed: true },
      unchanged: { proceed: false },
    },
  },
  {
    name: "docs-committed",
    type: "primitive",
    primitiveOp: "vcs.files_changed_since",
    primitiveParams: {
      pullNumber: "{{entity.artifacts.prNumber}}",
      pathPatterns: "docs/,README*,*.md,CHANGELOG*",
    },
    timeoutMs: 120_000,
    failurePrompt: "No documentation files were changed in the PR. Update docs, README, or add a CHANGELOG entry.",
    outcomes: {
      changed: { proceed: true },
      unchanged: { proceed: false },
    },
  },
];

// ─── Transitions ───

export const TRANSITIONS: CreateTransitionInput[] = [
  // spec → code (gated: spec must be posted)
  { fromState: "spec", toState: "code", trigger: "spec_ready", priority: 0 },

  // code → review (gated: CI must be green)
  { fromState: "code", toState: "review", trigger: "pr_created", priority: 0 },

  // review outcomes
  { fromState: "review", toState: "docs", trigger: "clean", priority: 0 },
  { fromState: "review", toState: "fix", trigger: "issues", priority: 0 },
  { fromState: "review", toState: "fix", trigger: "ci_failed", priority: 0 },

  // fix → review (gated: CI must be green again)
  { fromState: "fix", toState: "review", trigger: "fixes_pushed", priority: 0 },
  { fromState: "fix", toState: "stuck", trigger: "cant_resolve", priority: 0 },

  // docs → merge
  { fromState: "docs", toState: "merge", trigger: "docs_ready", priority: 0 },
  { fromState: "docs", toState: "stuck", trigger: "cant_document", priority: 0 },

  // merge outcomes (gated: PR must be mergeable)
  { fromState: "merge", toState: "done", trigger: "merged", priority: 0 },
  { fromState: "merge", toState: "fix", trigger: "blocked", priority: 0 },
  { fromState: "merge", toState: "stuck", trigger: "closed", priority: 0 },
];

// ─── Gate → Transition Wiring ───

/**
 * Maps gate names to the transitions they guard.
 * Used by provisionEngineeringFlow() to wire gateIds after creation.
 */
export const GATE_WIRING: Record<string, { fromState: string; trigger: string }> = {
  "spec-posted": { fromState: "spec", trigger: "spec_ready" },
  "ci-green": { fromState: "code", trigger: "pr_created" },
  "pr-exists": { fromState: "code", trigger: "pr_created" },
  "review-status": { fromState: "review", trigger: "clean" },
  "pr-updated": { fromState: "fix", trigger: "fixes_pushed" },
  "docs-committed": { fromState: "docs", trigger: "docs_ready" },
  "pr-mergeable": { fromState: "merge", trigger: "merged" },
};
