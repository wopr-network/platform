# Ops Repo Structure

An ops repo is a version-controlled repository dedicated to operational state. It is separate from application code. Its purpose is to answer, at any moment: "What is the current state of production, and how did it get here?"

## What an Ops Repo Is

An ops repo is the single source of truth for infrastructure and operational knowledge. It stores living documentation, not static snapshots. Every deploy, incident, migration, and infrastructure decision is recorded here.

It is append-only where history matters (deployment logs, incident records) and overwritten where currency matters (current runbook, topology diagram).

## What Belongs in an Ops Repo

### Runbook

The current production state document. Answers: "What is running, where, and how?" Includes:

- Current system health state (e.g., PRODUCTION / DEGRADED / DOWN)
- Service inventory with ports and hosts
- Node inventory with connection details
- Secrets inventory (names only, never values)
- Known quirks and gotchas
- Rollback procedure

Every operational task begins by reading the runbook.

### Deployment Log

Append-only record of every deploy, rollback, and restart. Each entry includes: timestamp, version transition, triggering cause, outcome, and health check results.

### Migration Log

Record of every schema or data migration. Each entry flags whether the operation was destructive and whether it is reversible. Requires explicit human approval before irreversible operations run in production.

### Incident Log

Record of every production incident. Each entry includes: severity, start/end timestamps, detection method, root cause, resolution steps, and follow-up actions. The incident log is how the system learns from failures.

### Decision Log

Record of significant infrastructure decisions with rationale, alternatives considered, and consequences. Answers the question: "Why is the system built this way?"

### Node Inventory

Per-node documents for each piece of infrastructure. Each node document records: connection details, hardware or VM specs, software versions, and a brief change history.

### Topology

A diagram of the production architecture showing how services connect, how traffic flows, and what the hard constraints are. Updated when the production topology changes.

### Compose / Infrastructure Config

The actual configuration files used to run the system. Kept here so the runbook and the configuration are always in sync.

## Organization

```
ops-repo/
+-- RUNBOOK.md              # Current production state (overwrite)
+-- DEPLOYMENTS.md          # Deployment history (append-only)
+-- MIGRATIONS.md           # Migration history (append-only)
+-- INCIDENTS.md            # Incident history (append-only)
+-- DECISIONS.md            # Infrastructure decision log
+-- TOPOLOGY.md             # Architecture diagram
+-- <infra-config-files>    # Compose files, proxy configs, etc.
+-- nodes/
    +-- <node-name>.md      # One file per infrastructure node
```

Supporting concerns (local development setup, CI/CD integration, GPU or specialized nodes) are added as additional files at the top level or under purpose-specific subdirectories.

## Principles

- **One repo, one purpose.** The ops repo holds operational knowledge only. Application code lives elsewhere.
- **Append history, overwrite state.** Logs grow forever. The runbook reflects now.
- **Human-readable.** Every file is plain text. The audience includes both humans responding to incidents and automated agents performing routine operations.
- **No secrets in the repo.** Record that a secret exists, not its value.
- **Linked, not duplicated.** Cross-reference between documents. Do not copy content.

---

See [WOPR implementation](../../wopr/devops/wopr-ops-structure.md)
