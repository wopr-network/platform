---
name: wopr-burndown
description: Use when the user wants to regenerate, refresh, or update the WOPR burndown chart or progress charts in the .github repo.
---

# WOPR Burndown Chart

Trigger the burndown chart regeneration workflow in `wopr-network/.github`, then confirm it started.

```bash
gh workflow run burndown.yml --repo wopr-network/.github
gh run list --repo wopr-network/.github --workflow=burndown.yml --limit=1
```

Report the run status and URL. The workflow takes ~20s and commits updated charts to `profile/README.md`.
