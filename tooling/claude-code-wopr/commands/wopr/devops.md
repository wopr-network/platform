# WOPR DevOps

Spawn the `wopr-devops` agent to handle this operation.

## Step 1: Identify the operation

If the user hasn't specified one, ask:

> Which DevOps operation?
> - **status** — read current production state (no changes)
> - **initial-deploy** — first production deployment
> - **deploy** — push an update to production
> - **rollback** — revert to last known-good state
> - **migrate** — run DB migrations safely
> - **health** — check all production services
> - **gpu-provision** — provision the GPU inference node

## Step 2: Spawn the agent

Use the Agent tool with `subagent_type: "wopr-devops"`. Pass a prompt that includes:
- The operation to perform
- Any context the user provided (repos, targets, etc.)

Example prompt for `status`:
```
Read the wopr-ops logbook and report current production state.

Operation: status

Pull the logbook first:
git -C /tmp/wopr-ops pull 2>/dev/null || git clone https://github.com/wopr-network/wopr-ops /tmp/wopr-ops

Then read RUNBOOK.md and report what you find.
```

Always include the operation name and any user-provided context in the agent prompt.
