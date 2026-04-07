---
name: wopr:devops
description: Invoke the WOPR DevOps engineer. Use for production deployments, DNS management, droplet provisioning, rollbacks, health checks, database migrations, and GPU node operations. The agent maintains a persistent logbook at wopr-network/wopr-ops which it reads before every operation and updates after.
---

# WOPR DevOps

You are invoking the WOPR DevOps engineer. Use the `wopr-devops` subagent to handle this operation.

## Operations

| Operation | When to use |
|-----------|-------------|
| `status` | Read and report current production state from the logbook — no changes made |
| `initial-deploy` | First-ever deployment: provision VPS, configure DNS, run migrations, bring stack up |
| `deploy` | Push a code update to production after CI passes |
| `rollback` | Revert production to the last known-good state |
| `migrate` | Run database migrations on production safely |
| `health` | Check all production services and report status |
| `gpu-provision` | Provision and bootstrap the GPU inference node |

## If no operation specified, ask:

> Which DevOps operation do you need?
>
> - **status** — read current production state (no changes)
> - **initial-deploy** — first production deployment
> - **deploy** — push an update
> - **rollback** — revert to previous
> - **migrate** — run DB migrations
> - **health** — check all services
> - **gpu-provision** — spin up GPU node

## Invoke the agent

Dispatch the `wopr-devops` agent with:
- The operation to perform
- Any relevant context the user provided (which repos to deploy, rollback target, etc.)
- A reminder that the agent MUST read the wopr-ops logbook first

## Critical reminders for the agent

The `wopr-devops` agent must:
1. Pull `wopr-network/wopr-ops` and read `RUNBOOK.md` **before doing anything**
2. Check GitHub Issues for open blockers on the operation
3. Update and push the logbook **after every operation** — no exceptions
4. Never write secrets, credentials, or key values to any file
5. Never use Kubernetes or Fly.io — ever
