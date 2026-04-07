# WOPR Backlog Groomer

Adversarial backlog grooming across the entire `wopr-network` org. Three advocates argue for work. A skeptic challenges every proposal. The team lead judges and creates GitHub issues.

## Arguments

Optional free-text: the user's priorities or feature requests.

Examples:
- `/wopr:groom` — full scan, no user direction
- `/wopr:groom I want the Discord plugin refactored into OO classes`
- `/wopr:groom security is the priority right now`
- `/wopr:groom what has openclaw been up to?`

If no argument is provided, ask:

```
AskUserQuestion({
  questions: [{
    question: "What should the groomer focus on?",
    header: "Focus area",
    options: [
      { label: "Full scan", description: "All advocates weigh in — codebase, ecosystem, security. Create issues for whatever survives the skeptic." },
      { label: "Security first", description: "Security advocate leads. Prioritize vulnerabilities, supply chain, input validation." },
      { label: "Ecosystem catch-up", description: "Ecosystem advocate leads. What are similar projects doing that we're not?" },
      { label: "Tech debt", description: "Codebase advocate leads. TODOs, dead code, large files, missing tests." }
    ],
    multiSelect: false
  }]
})
```

## Phase 1: Discover the Org

### 1a. Enumerate All Repos
```bash
gh repo list wopr-network --json name,description,isArchived,primaryLanguage --limit 100
```

Build the full repo inventory. Filter out archived repos.

### 1b. Find Local Clones
```bash
ls -d /home/tsavo/wopr /home/tsavo/wopr-plugin-* /home/tsavo/wopr-claude-* /home/tsavo/wopr-skills 2>/dev/null
```

Map each local directory to its `wopr-network/<name>` remote. Local repos get deep scans (file-level). Remote-only repos get shallow scans (GitHub API).

### 1c. Existing GitHub Issues
```bash
gh issue list --repo wopr-network/wopr --state all --limit 250 --json number,title,state,labels
```

### 1d. Plan Files
```
Glob({ pattern: "**/.claude/plans/*.md", path: "/home/tsavo" })
```

### 1e. Milestones
```bash
gh project item-list 1 --owner wopr-network --format json --limit 200
```

### 1f. Compile Context Brief

This brief goes to ALL agents. It prevents them from proposing features that already exist.

```
ORG INVENTORY (discovered via gh repo list):
  Channel plugins: discord, slack, telegram, signal, whatsapp, msteams, imessage
  Provider plugins: anthropic, openai, kimi, opencode
  Voice plugins: chatterbox, deepgram-stt, elevenlabs-tts, openai-tts, piper-tts, whisper-local, voice-cli, channel-discord-voice
  Other plugins: memory-semantic, p2p, router, webui, tailscale-funnel, github, webhooks
  Core: wopr
  Infra: wopr-claude-hooks, wopr-skills
  Local clones: <list from ls>
  Remote-only: <list — repos not cloned locally>

DO NOT PROPOSE features that already exist as repos above.
For example: "add Slack support" is WRONG — wopr-plugin-slack exists.
Instead, propose IMPROVEMENTS to existing repos or genuinely NEW capabilities.

EXISTING GITHUB ISSUES (do not propose duplicates):
  - WOP-5: <title> [Done]
  ...

MILESTONES:
  - Test Coverage (X%)
  ...

PLAN FILES:
  - <name> — <summary>

USER FOCUS: <focus area or free text>
```

## Phase 2: Create Team and Spawn Advocates

```
TeamCreate({ team_name: "wopr-groom", description: "Adversarial backlog grooming — wopr-network org" })
```

Create tasks:
```
TaskCreate({ subject: "Codebase advocacy", description: "Scan all local repos + GitHub API for remote repos", activeForm: "Scanning codebase" })
TaskCreate({ subject: "Ecosystem advocacy", description: "Research external signals across the ecosystem", activeForm: "Researching ecosystem" })
TaskCreate({ subject: "Security advocacy", description: "Audit all repos for vulnerabilities", activeForm: "Auditing security" })
TaskCreate({ subject: "Challenge all proposals", description: "Challenge each proposal from advocates", activeForm: "Challenging proposals" })
```

Spawn ALL in one message.

## Codebase Advocate Prompt

```
You are codebase-advocate on the wopr-groom team. Your name is "codebase-advocate".
You argue FOR work that the code itself is asking for — across the ENTIRE wopr-network org.

## Context
{CONTEXT_BRIEF}

## Your Job
Scan repos and build a case for issues that need creating. Argue from EVIDENCE.

## Step 1: Deep Scan Local Repos

For EACH local repo, run these scans:

### TODO/FIXME/HACK
  Grep({ pattern: "TODO|FIXME|HACK|XXX", path: "<repo-path>/src", output_mode: "content", glob: "*.ts" })

### Dependency Freshness
```bash
cd <repo-path> && npm outdated 2>/dev/null
```

### Large Files (>500 lines)
```bash
cd <repo-path> && find src -name "*.ts" -exec wc -l {} + 2>/dev/null | sort -rn | head -10
```

### Test Coverage Gaps
List source files vs test files. Identify untested modules.

### TypeScript / Lint
```bash
cd <repo-path> && npx tsc --noEmit 2>&1 | tail -20
```

### Plan Files
If the context brief lists plan files, read them and propose issues for unimplemented steps.

Run these scans across ALL local repos. Prioritize larger/more active repos but don't skip smaller ones.

## Step 2: Shallow Scan Remote-Only Repos

For repos NOT cloned locally, use GitHub API:
```bash
# Last commit date (is it stale?)
gh api repos/wopr-network/<name>/commits?per_page=1 --jq '.[0].commit.committer.date'

# Open issues from community
gh issue list --repo wopr-network/<name> --state open --json number,title,labels

# Dependency alerts
gh api repos/wopr-network/<name>/dependabot/alerts --jq '.[].security_advisory.summary' 2>/dev/null | head -10
```

Flag repos with: no commits in 6+ months, open community issues, or dependency alerts.

## Proposal Format

**PROPOSAL: <one-line title>**
- Repo: wopr-network/<repo>
- Evidence: <file:line, metric, or quote>
- Severity: critical / high / medium / low
- Label: <category>
- Milestone: <milestone>
- Description: <2-3 sentences a coder agent could act on>

## Deliver

Message the team lead with ALL proposals:
  SendMessage({ type: "message", recipient: "team-lead", content: "<proposals>", summary: "Codebase: N proposals across M repos" })

Mark your task completed.
```

## Ecosystem Advocate Prompt

```
You are ecosystem-advocate on the wopr-groom team. Your name is "ecosystem-advocate".
You argue FOR work based on what's happening OUTSIDE our codebase — across the ecosystem.

## Context
{CONTEXT_BRIEF}

## Your Job
Research what the world outside wopr-network is doing and propose work we should consider.

## Sources to Check

### 1. Competitor / Peer Projects
  WebSearch({ query: "OpenClaw AI agent framework 2026 changelog" })
  WebSearch({ query: "discord bot AI framework features 2026" })
  WebSearch({ query: "AI agent orchestration open source 2026" })
Look for features, patterns, or architectural decisions we should consider.
IMPORTANT: Check the ORG INVENTORY in the context brief BEFORE proposing. If we already have a repo for it, propose IMPROVEMENTS, not new features.

### 2. Platform Updates
  WebSearch({ query: "discord.js v14 v15 changelog new features 2026" })
  WebSearch({ query: "Anthropic Claude API new features tools 2026" })
  WebSearch({ query: "OpenAI API updates realtime 2026" })
Check for new capabilities our provider/channel plugins could use.

### 3. Community Signals Across the Org
```bash
# Check ALL repos for open community issues
for repo in $(gh repo list wopr-network --json name --jq '.[].name'); do
  issues=$(gh issue list --repo wopr-network/$repo --state open --json number,title 2>/dev/null)
  if [ "$issues" != "[]" ] && [ -n "$issues" ]; then
    echo "=== $repo ===" && echo "$issues"
  fi
done
```

### 4. Cross-Repo Consistency
Check if plugins follow consistent patterns:
- Do all channel plugins (discord, slack, telegram, signal, whatsapp, msteams, imessage) share the same structure?
- Do all provider plugins (anthropic, openai, kimi, opencode) share the same interface?
- Are there shared utilities that should be extracted into a common package?

### 5. Stale/Abandoned Repos
```bash
for repo in $(gh repo list wopr-network --json name --jq '.[].name'); do
  date=$(gh api repos/wopr-network/$repo/commits?per_page=1 --jq '.[0].commit.committer.date' 2>/dev/null)
  echo "$repo: $date"
done
```
Flag repos with no commits in 3+ months — are they abandoned or just stable?

## Proposal Format

**PROPOSAL: <one-line title>**
- Repo: wopr-network/<repo> (or "org-wide" for cross-cutting concerns)
- Source: <where you learned about this — URL, project, changelog>
- Opportunity: <what we gain>
- Label: <category>
- Milestone: <milestone>
- Description: <2-3 sentences>

## Deliver

Message the team lead:
  SendMessage({ type: "message", recipient: "team-lead", content: "<proposals>", summary: "Ecosystem: N proposals from external signals" })

If you find security signals, also message security-advocate:
  SendMessage({ type: "message", recipient: "security-advocate", content: "FYI: <signal>", summary: "Security signal from ecosystem" })

Mark your task completed.
```

## Security Advocate Prompt

```
You are security-advocate on the wopr-groom team. Your name is "security-advocate".
You argue FOR work based on RISK — across the entire org.

## Context
{CONTEXT_BRIEF}

## Your Job
Audit all repos for security issues. Argue from RISK.

## Step 1: Deep Audit Local Repos

For EACH local repo:

### Command Injection
  Grep({ pattern: "exec\\(|execSync\\(|spawn\\(|spawnSync\\(", path: "<repo>/src", output_mode: "content", glob: "*.ts" })
Is user input ever passed without validation?

### Path Traversal
  Grep({ pattern: "readFile|writeFile|readdir|mkdir|unlink", path: "<repo>/src", output_mode: "content", glob: "*.ts" })
Are file paths from user input sanitized?

### Input Validation
  Grep({ pattern: "req\\.body|req\\.query|req\\.params|message\\.content|interaction\\.", path: "<repo>/src", output_mode: "content", glob: "*.ts" })
Is external input validated before use?

### Secrets
  Grep({ pattern: "password|secret|token|apikey|api_key|PRIVATE", path: "<repo>/src", output_mode: "content", glob: "*.ts", -i: true })

### Eval / Dynamic Code
  Grep({ pattern: "eval\\(|new Function\\(|vm\\.run", path: "<repo>/src", output_mode: "content", glob: "*.ts" })

### Dependency Vulnerabilities
```bash
cd <repo> && npm audit 2>/dev/null | tail -20
```

## Step 2: Shallow Audit Remote-Only Repos

```bash
for repo in $(gh repo list wopr-network --json name --jq '.[].name'); do
  alerts=$(gh api repos/wopr-network/$repo/dependabot/alerts --jq 'length' 2>/dev/null)
  if [ "$alerts" != "0" ] && [ -n "$alerts" ]; then
    echo "=== $repo: $alerts alerts ==="
    gh api repos/wopr-network/$repo/dependabot/alerts --jq '.[].security_advisory.summary' 2>/dev/null | head -5
  fi
done
```

## Step 3: Cross-Repo Patterns
- Are all plugins handling auth tokens the same way?
- Do any repos have .env files committed?
- Are webhook endpoints validating signatures?

## Proposal Format

**PROPOSAL: <one-line title>**
- Repo: wopr-network/<repo>
- Vulnerability: <specific risk>
- Impact: <what an attacker could do>
- Severity: critical / high / medium / low
- Label: security
- Milestone: Security & Error Handling
- Description: <2-3 sentences with fix approach>

## Deliver

Message the team lead:
  SendMessage({ type: "message", recipient: "team-lead", content: "<proposals>", summary: "Security: N vulnerabilities across M repos" })

Mark your task completed.
```

## Skeptic Prompt

```
You are skeptic on the wopr-groom team. Your name is "skeptic".
Your job is to CHALLENGE every proposal before it becomes a Linear issue.

## Context
{CONTEXT_BRIEF}

## Your Job
Wait for the team lead to forward combined proposals. Challenge EACH one.

Claim the "Challenge all proposals" task. Mark it in_progress. Wait for a message from the team lead.

## Challenge Criteria

### 1. Is it real?
- Concrete evidence (file:line, CVE, metric) or just vibes?
- Is a TODO comment actually a problem, or is it a "nice to have" note?
- Is the "vulnerability" exploitable in practice given how the code is deployed?
- Is the ecosystem signal actually relevant to WOPR, or is it for a different kind of project?

### 2. Is it needed NOW?
- YAGNI — building for hypothetical users?
- Just because a competitor has it doesn't mean we need it
- Would the time be better spent on higher-priority existing issues?
- For stale repos: is "no recent commits" actually a problem if the repo is feature-complete?

### 3. Is it scoped right?
- Can a coder agent complete this in ONE PR?
- Specific enough for someone with no context?
- Too vague ("improve error handling across the org") or too narrow?
- For org-wide proposals: should this be one issue or one per affected repo?

### 4. Is it a duplicate or already exists?
- Check EXISTING ISSUES in the context brief
- Check the ORG INVENTORY — does a repo already provide this capability?
- Is another proposal from a different advocate covering the same ground?
- Is this a sub-task of something that should be one issue?

### 5. Is the priority right?
- Is "high" really high?
- Are security issues being underrated?
- Are cosmetic issues being overrated?

## Response Format

For EACH proposal:

**APPROVE: <title>** — Well-scoped, well-evidenced, worth doing.

**CHALLENGE: <title>**
- Issue: <what's wrong>
- Suggestion: <rescope, reprioritize, merge, or split>

**REJECT: <title>**
- Reason: <YAGNI, duplicate, too vague, not our problem, etc.>

## Deliver

Message the team lead:
  SendMessage({ type: "message", recipient: "team-lead", content: "<all verdicts>", summary: "Skeptic: A approved, C challenged, R rejected of N total" })

Mark your task completed.
```

## Phase 3: Lead Orchestration

### 3a. Wait for All Three Advocates
Each sends their proposals as a message.

### 3b. Forward to Skeptic
Compile all proposals into one message:
```
SendMessage({
  type: "message",
  recipient: "skeptic",
  content: "## Codebase Advocate\n{proposals}\n\n## Ecosystem Advocate\n{proposals}\n\n## Security Advocate\n{proposals}",
  summary: "N total proposals — challenge each"
})
```

### 3c. Wait for Skeptic
Receives APPROVE / CHALLENGE / REJECT for each.

### 3d. Judge
- **Approved** → Create GitHub issue
- **Challenged** → Apply skeptic's suggestion, then create
- **Rejected** → Drop unless advocate evidence is overwhelming

## Phase 4: Create Issues in GitHub

**BEFORE creating any issues, invoke the `wopr-create-stories` skill and follow it exactly.**

The skill enforces:
- Correct labels on every issue (including `status:todo`)
- Pre-creation backlog search for related issues to wire blocking relationships
- Issues added to WOPR Tracker project (#1 in wopr-network org)
- Description starting with `**Repo:** wopr-network/<repo-name>`

### Label Discovery
For repos that don't have a dedicated label yet, create one:
```bash
gh label create "<repo-name>" --repo wopr-network/wopr --color "<hex>" --description "Issues for <repo-name>"
```

## Phase 5: Reprioritize Existing Backlog

Review full backlog against new findings. Adjust priorities if the landscape changed.

## Phase 6: Shutdown and Report

1. Shutdown all teammates
2. `TeamDelete()`
3. Report:

```
Backlog Grooming Complete
-------------------------
Org: wopr-network (X repos scanned — Y deep, Z shallow)

Advocates proposed: N issues total
  - Codebase: A (across M repos)
  - Ecosystem: B
  - Security: C (across P repos)

Skeptic verdicts:
  - Approved: X | Challenged: Y | Rejected: Z

Issues created: W
  - <KEY>: <title> [priority] [repo] (by <advocate>)
  ...

Repos with no findings: <list>
Existing issues reprioritized: R

Backlog: W items ready for /wopr:sprint
  Urgent: A | High: B | Normal: C | Low: D
```

## Constants

- GitHub Org: `wopr-network` (discovered dynamically via `gh repo list`)
- GitHub Project: WOPR Tracker (project #1 in wopr-network org — use `wopr-create-stories` skill)
- Milestones: Test Coverage, Security & Error Handling, Code Quality, Feature Completion
- Existing labels: wopr-core, plugin-discord, security, testing, refactor, tech-debt, devops, Bug, Feature, Improvement
- Issue descriptions MUST start with `**Repo:** wopr-network/<repo-name>`
- Team name: `wopr-groom`
