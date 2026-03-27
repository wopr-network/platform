# Disciplines

How agentic pipelines are organized around types of minds, not types of tasks.

---

## What a Discipline Is

A discipline is a category of work that requires a consistent type of mind. Not a task. Not a state. A mind.

Engineering work requires a mind that can read a codebase, write code, review diffs, and fix findings. DevOps work requires a mind that understands infrastructure, deployment, and incident response. QA work requires a mind that thinks adversarially about correctness and coverage. Security work requires a mind that thinks adversarially about attack surface.

These are fundamentally different orientations. A worker declares which orientation they have. The pipeline routes work to them accordingly.

---

## Discipline vs Task

The discipline model inverts the traditional "assign task to specialist" pattern.

Traditional model: the pipeline defines who does each step. An architect writes the spec. A coder implements it. A reviewer reviews it. A merger merges it. Each is a separate role with a separate worker.

Discipline model: the pipeline defines what discipline each flow requires. An engineering worker does all of it — architecturing, coding, reviewing, fixing, merging. They own the entity from start to finish via sequential `report` calls. The state changes. The worker doesn't.

```
Traditional:
  backlog → [architect] → [coder] → [reviewer] → [fixer] → [merger] → done
  (5 different workers, 5 handoffs, 5 context reloads)

Discipline model:
  backlog → [engineering worker] → done
  (1 worker, 0 handoffs, context accumulated across all states)
```

This is not a simplification. It is correct modeling. An engineer IS an architect, coder, reviewer, fixer, and merger. These are not separate professions — they are tasks within one profession. Separating them into distinct roles creates artificial handoffs that destroy context and waste tokens.

---

## The Four Canonical Disciplines

### Engineering

**Handles:** Building software — specifying, implementing, reviewing, fixing, merging.

**Flow shape:** Pull-based. Entities accumulate in a backlog from the issue tracker. Engineering workers call `claim` to pull the highest-priority available entity.

**Initial state:** `backlog` — entities sit here until claimed.

**Triggered by:** Human decisions — someone creates an issue, files a bug, requests a feature.

### DevOps

**Handles:** Running software — deploying, monitoring, responding to incidents, managing infrastructure.

**Flow shape:** Push-based. Entities are created by external events. A release tag is cut, a production alert fires, a deploy is requested.

**Initial state:** Named after the triggering event — `release_cut`, `triggered`, `deploy_requested`.

**Triggered by:** External systems — CI completes, monitoring alerts, release automation fires.

### QA

**Handles:** Verifying software — authoring tests, executing test suites, analyzing regressions, closing coverage gaps.

**Flow shape:** Push-based. Entities are created when coverage gaps are detected or test targets are identified.

**Initial state:** `test_target`, `coverage_gap`.

**Triggered by:** Coverage analysis, audit findings, post-deploy verification failures.

### Security

**Handles:** Protecting software — auditing code, remediating vulnerabilities, assessing attack surface, triaging CVEs.

**Flow shape:** Push-based. Entities are created by security scanners, CVE databases, or audit reports.

**Initial state:** `finding`, `cve_triaged`.

**Triggered by:** Dependency audits, scheduled security scans, CVE database updates.

---

## How Discipline Routing Works

Flows declare their discipline. Workers declare their discipline. DEFCON matches them.

```
Flow definition:
  { "name": "wopr-changeset", "discipline": "engineering", ... }

Worker claim:
  flow.claim({ workerId: "wkr_abc123", role: "engineering" })

DEFCON:
  find all flows where discipline = "engineering"
  find highest-priority claimable entity across those flows
  return it
```

The worker never specifies which flow or which entity. DEFCON picks. This is not just a convenience — it is the mechanism that prevents workers from gaming priority. A worker that could choose its own entity could choose easy work, skip difficult entities, or pick things out of priority order.

States do not have roles. The flow has a discipline. Every entity in an engineering flow is claimable by any engineering worker.

---

## Flow Shapes by Discipline

```
Engineering (pull-based):

  [Linear issue created]
       |
       v
    backlog  <-- engineering workers pull from here
       |
  architecting
       |
    coding
       |
   reviewing
       |
   fixing (if issues)
       |
   merging
       |
     done


DevOps (push-based):

  [GitHub tag created]
       |
       v
  release_cut  <-- entity created by webhook
       |
  staging_deploy
       |
  smoke_test
       |
  production_deploy
       |
  health_check
       |
     done


Security (push-based):

  [CVE detected in dependency]
       |
       v
    finding  <-- entity created by audit runner
       |
   assessing
       |
  remediating
       |
   verifying
       |
     done
```

---

## Cross-Discipline Flows

Some workflows span disciplines — build the thing, then deploy it. The recommended pattern is **split flows**: engineering flow ends at `merging`, a devops flow starts when the merge event triggers.

```
Engineering flow ends:  ...→ merging → done
                                          |
                                     [merge event]
                                          |
DevOps flow starts:               deploy_triggered → ...
```

This keeps each flow single-discipline, clean, and independently manageable. Engineering workers never get devops prompts. DevOps workers never see the coding backlog.

---

## Adding New Disciplines

Disciplines are extensible. A flow author can define any discipline by declaring it on the flow:

```json
{ "name": "ml-training", "discipline": "ml-engineering" }
```

Workers calling `flow.claim(role: "ml-engineering")` will receive entities from that flow. The four canonical disciplines are defaults, not constraints.

---

See [worker-protocol.md](worker-protocol.md) for how `flow.claim` uses discipline to route work.

See [lifecycle.md](lifecycle.md) for where disciplines fit in the full agentic engineering cycle.

See [event-ingestion.md](event-ingestion.md) for how push-triggered discipline flows receive entities from external events.

See [WOPR implementation](../../wopr/pipeline/disciplines.md).
