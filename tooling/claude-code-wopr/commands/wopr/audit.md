---
name: wopr-audit
description: Use when auditing a WOPR plugin or platform repo for quality gaps — correctness, completeness, best practices, and test coverage.
---

# WOPR Repo Audit

Audit a WOPR repo with five parallel specialist agents. Produces a consolidated gap report with an option to discuss findings and file GitHub issues.

## Arguments

Required: repo name or path.

Examples:
- `/wopr:audit wopr-plugin-discord`
- `/wopr:audit wopr-platform`
- `/wopr:audit /home/tsavo/wopr-plugin-telegram`

If no argument, ask:
```
AskUserQuestion({
  questions: [{
    question: "Which repo do you want to audit?",
    header: "Repo",
    options: [
      { label: "wopr-plugin-discord", description: "Discord channel plugin" },
      { label: "wopr-platform", description: "Platform backend" },
      { label: "wopr-platform-ui", description: "Dashboard UI" },
      { label: "Other", description: "Enter repo name" }
    ]
  }]
})
```

## Phase 1: Setup

Resolve the repo:
```bash
# If given a short name like "wopr-plugin-discord":
REPO_NAME=<arg>
REPO_PATH=/home/tsavo/$REPO_NAME
REPO_FULL=wopr-network/$REPO_NAME

# Clone if not local
[ ! -d "$REPO_PATH" ] && gh repo clone $REPO_FULL $REPO_PATH
```

Read the repo's CLAUDE.md if it exists — it contains architectural patterns the agents must respect.

Create the team:
```
TeamCreate({ team_name: "wopr-audit", description: "Audit $REPO_NAME" })
```

## Phase 2: Spawn Four Auditors in Parallel

Spawn ALL four in a single message with `run_in_background: true`.

### Agent names
`correctness-auditor`, `completeness-auditor`, `practices-auditor`, `test-auditor`, `security-auditor`

### Model: all use `opus`

---

### Correctness Auditor Prompt

```
Your name is "correctness-auditor" on the wopr-audit team.

## Assignment
Repo: {REPO_FULL}
Local path: {REPO_PATH}

Audit for CORRECTNESS — bugs, logic errors, unsafe patterns, runtime failures.

## What to check

### Type safety
- TypeScript errors: `cd {REPO_PATH} && npx tsc --noEmit 2>&1`
- `any` casts hiding real type errors
- Unsafe non-null assertions (`!`) on values that could be null

### Error handling
- Unhandled promise rejections (async functions without try/catch)
- Missing error propagation (errors swallowed silently)
- Grep: `\.catch\(\)` or empty catch blocks

### Logic
- Race conditions in async code
- Off-by-one errors, incorrect comparisons
- Missing null/undefined guards on external data

### Runtime safety
- `eval()`, `new Function()`, unvalidated `exec()`/`spawn()` with user input
- Path traversal: unsanitized file paths from external input

## Output format

For each finding:
**[CORRECTNESS] Title**
- File: `src/path/to/file.ts:LINE`
- Severity: critical / high / medium / low
- Issue: what's wrong
- Fix: how to fix it

Send your findings to the team lead:
SendMessage({ type: "message", recipient: "team-lead", content: "<findings>", summary: "Correctness: N findings" })
```

---

### Completeness Auditor Prompt

```
Your name is "completeness-auditor" on the wopr-audit team.

## Assignment
Repo: {REPO_FULL}
Local path: {REPO_PATH}

Audit for COMPLETENESS — missing features, stub implementations, TODOs, partial work.

## What to check

### Unfinished code
- TODOs/FIXMEs/HACKs: `grep -rn "TODO\|FIXME\|HACK\|XXX\|stub\|not implemented" {REPO_PATH}/src`
- Functions that throw "not implemented" or return empty/null unconditionally
- Empty event handlers or lifecycle hooks

### Missing manifest fields
- Does `manifest` have all required fields? (name, version, description, capabilities, category, tags, icon, requires, provides, lifecycle, configSchema)
- Are all declared capabilities actually implemented?

### Missing config handling
- Each field in `configSchema` — is it read and used somewhere in the code?
- Are required config fields validated on init?

### Lifecycle completeness
- Does `init()` register everything declared in the manifest?
- Does `shutdown()` clean up everything `init()` registered?
- Are cleanup arrays (`cleanups`) used consistently?

### Feature gaps vs manifest claims
- manifest says it provides X — does the code actually provide X?

## Output format

**[COMPLETENESS] Title**
- File: `src/path/to/file.ts:LINE`
- Severity: high / medium / low
- Issue: what's missing
- Fix: what needs to be added

SendMessage({ type: "message", recipient: "team-lead", content: "<findings>", summary: "Completeness: N findings" })
```

---

### Best Practices Auditor Prompt

```
Your name is "practices-auditor" on the wopr-audit team.

## Assignment
Repo: {REPO_FULL}
Local path: {REPO_PATH}

Audit for PLUGIN BEST PRACTICES — architecture, conventions, and the WOPR plugin contract.

## Plugin contract rules (non-negotiable)

1. **Import only from `@wopr-network/plugin-types`** — never relative imports into wopr core
   - `grep -rn "from.*wopr/src\|from.*wopr-platform" {REPO_PATH}/src`

2. **No bundled dependencies that should be peerDeps**
   - Check package.json: platform packages should be peerDependencies

3. **registerProvider / registerChannel / etc. — use typed API**
   - No raw object registration without the typed registration methods

4. **Cleanup on shutdown**
   - Every `register*()` call must have a matching `unregister*()` in shutdown

5. **Logger: use `ctx.log`, not `console.log`**
   - `grep -rn "console\." {REPO_PATH}/src`

6. **No hardcoded secrets or URLs**
   - `grep -rn "http://\|https://\|api\.key\|apiKey" {REPO_PATH}/src` — flag hardcoded values

7. **ConfigSchema completeness**
   - All user-configurable values must be in configSchema, not hardcoded

8. **biome.json present** — check for linter config at repo root

9. **CLAUDE.md present** — check for agent instructions at repo root

10. **Plugin manifest structure**
    - `capabilities`, `category`, `provides.capabilities[].type` must use standard types
    - `lifecycle.shutdownBehavior` must be "graceful" or "immediate"

## Output format

**[PRACTICES] Title**
- File: `src/path/to/file.ts:LINE` (or `package.json`, `manifest`)
- Rule: which rule above was violated
- Severity: high / medium / low
- Issue: what's wrong
- Fix: how to align with the contract

SendMessage({ type: "message", recipient: "team-lead", content: "<findings>", summary: "Practices: N findings" })
```

---

### Test Auditor Prompt

```
Your name is "test-auditor" on the wopr-audit team.

## Assignment
Repo: {REPO_FULL}
Local path: {REPO_PATH}

Audit for TEST CORRECTNESS AND COVERAGE — missing tests, weak assertions, wrong test structure.

## What to check

### Coverage gaps
- List all source files in `src/`
- List all test files
- Identify source files with NO corresponding test file
- For files that DO have tests, are the happy path, error path, and edge cases covered?

### Test correctness
- Tests that always pass (no real assertion, just `expect(true).toBe(true)`)
- Tests that test implementation details instead of behavior
- Missing `afterEach` cleanup (PGlite pools not closed, mocks not restored)
- Tests with hardcoded dates/times that will break
- Async tests missing `await` (silent false positives)

### Test structure
- Is vitest configured? Check for `vitest.config.ts`
- Are tests in the right place? (`tests/` or colocated `*.test.ts`)
- Do tests import from the right places (not reaching into internals)?

### Critical paths with no tests
- Plugin init/shutdown lifecycle
- Config validation
- Error handling branches
- Any security-relevant logic

## Output format

**[TESTING] Title**
- File: `tests/path/to/file.test.ts` or `src/path/to/file.ts` (missing test)
- Severity: high / medium / low
- Issue: what's wrong or missing
- Fix: what test to write

SendMessage({ type: "message", recipient: "team-lead", content: "<findings>", summary: "Testing: N findings" })
```

---

### Security Auditor Prompt

```
Your name is "security-auditor" on the wopr-audit team.

## Assignment
Repo: {REPO_FULL}
Local path: {REPO_PATH}

Audit for SECURITY — vulnerabilities that could be exploited by users, third parties, or malicious plugins.

## What to check

### Secrets and sensitive data exposure
- Hardcoded secrets, API keys, tokens in source:
  `grep -rn "sk-\|api_key\|apiKey\|secret\|password\|token" {REPO_PATH}/src --include="*.ts" --include="*.tsx"`
- `NEXT_PUBLIC_*` env vars that expose secrets to the browser — check `.env.example` and usages
- Sensitive data stored in localStorage/sessionStorage (user tokens, PII)

### Authentication bypass
- Are all routes inside `(dashboard)/` protected by `src/middleware.ts`?
- Any `/api/` route handlers that skip auth checks (no session validation before returning data)?
- Verify `auth.api.getSession()` is called and checked — not just assumed truthy

### Authorization / IDOR
- API calls that include user/bot/instance IDs from URL params or query strings — is ownership verified server-side?
- Can a user fetch another user's billing data, bot config, or fleet by changing an ID?
- Multi-tenant isolation — does any query fetch ALL records without filtering by authenticated user?

### XSS
- `dangerouslySetInnerHTML` usage: `grep -rn "dangerouslySetInnerHTML" {REPO_PATH}/src`
- User-generated content rendered without sanitization (plugin names, bot names, channel descriptions)
- Markdown rendering without sanitization

### CSRF
- State-mutating `/api/` routes (POST/PUT/DELETE) — do they verify the request origin or use CSRF tokens?
- `better-auth` CSRF protection — is it enabled and applied to all mutation endpoints?

### Open redirects
- Auth callback URLs (`?redirect=`, `?next=`, `?returnTo=`) — are they validated to only allow same-origin redirects?
- `grep -rn "redirect\|returnTo\|next=" {REPO_PATH}/src --include="*.ts" --include="*.tsx"`

### Dependency risks
- Check `package.json` for packages with known CVEs (note any that look outdated or abandoned)
- Client bundle bloat from server-only packages accidentally imported in client components

### Content Security Policy
- Is a CSP header set? Check `next.config.*` for `headers()` config
- Missing CSP allows inline scripts / arbitrary external resources

## Output format

**[SECURITY] Title**
- File: `src/path/to/file.tsx:LINE`
- Severity: critical / high / medium / low
- OWASP: relevant category (e.g., A01 Broken Access Control)
- Issue: what the vulnerability is
- Fix: how to remediate

SendMessage({ type: "message", recipient: "team-lead", content: "<findings>", summary: "Security: N findings" })
```

---

## Phase 3: Synthesize Report

Wait for all five agents. Shutdown all:
```
SendMessage({ type: "shutdown_request", recipient: "correctness-auditor", ... })
// repeat for all five
```

Compile findings into a single report grouped by severity:

```
# Audit Report: {REPO_NAME}
Generated: {date}

## Summary
| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Correctness | N | N | N | N | N |
| Completeness | N | N | N | N | N |
| Best Practices | N | N | N | N | N |
| Testing | N | N | N | N | N |
| Security | N | N | N | N | N |
| **TOTAL** | **N** | **N** | **N** | **N** | **N** |

## Critical Findings
[all critical findings here]

## High Severity
[all high findings here]

## Medium Severity
[all medium findings here]

## Low / Informational
[all low findings here]
```

Present the report to the user.

## Phase 4: Discuss and File

After presenting the report, ask:

```
AskUserQuestion({
  questions: [{
    question: "What would you like to do with these findings?",
    header: "Next step",
    options: [
      { label: "File all critical + high as Linear issues", description: "Creates stories for severity critical and high" },
      { label: "File all findings as Linear issues", description: "Creates stories for everything" },
      { label: "Discuss first", description: "Talk through findings before deciding" },
      { label: "Done", description: "No action needed" }
    ]
  }]
})
```

### If filing Linear issues

**REQUIRED: Invoke `wopr-create-stories` skill before creating any issues.**

Map each finding to a story:
- `title`: `fix(<category>): <finding title> (<REPO_NAME>)`
- `description`: starts with `**Repo:** wopr-network/{REPO_NAME}` then the full finding detail
- `labels`: map category → label (`security` for correctness/practices, `testing` for test findings, `tech-debt` for completeness)
- `priority`: critical→1, high→2, medium→3, low→4
- `state`: always "Todo"

Group related findings into a single story if they share the same file/fix.

## Phase 5: Cleanup

```
TeamDelete()
```

Report:
```
Audit complete: {REPO_NAME}
{N} findings across {4} dimensions
{M} Linear issues filed
```

## Constants

- GitHub Org: `wopr-network`
- GitHub Project: WOPR Tracker (project #1 in wopr-network org)
- Local clones: `/home/tsavo/<repo-name>`
- Team name: `wopr-audit`
- All agents: `sonnet` model
- **REQUIRED: invoke `wopr-create-stories` skill before filing any GitHub issues**
