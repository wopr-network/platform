# wopr-skills

Claude Code skills for the WOPR project — custom slash commands available to agents working in WOPR repos.

## Structure

```
skills/
  meta-wopr/    # Meta skills about WOPR itself
  wopr/         # Core WOPR development skills
  wopr-p2p/     # P2P-specific development skills
  wopr-security/ # Security audit and review skills
```

## Key Details

- Skills here are available to Claude Code agents when this repo is in the workspace
- These are the skills that power `/wopr:sprint`, `/wopr:groom`, `/wopr:auto`, etc.
- To add a new skill: create a `.md` file in the appropriate subdirectory following the existing format
- Skills use YAML frontmatter (`name`, `description`) followed by the skill instructions

## Issue Tracking

All issues in **Linear** (team: WOPR). Issue descriptions start with `**Repo:** wopr-network/wopr-skills`.

## Session Memory

At the start of every WOPR session, **read `~/.wopr-memory.md` if it exists.** It contains recent session context: which repos were active, what branches are in flight, and how many uncommitted changes exist. Use it to orient quickly without re-investigating.

The `Stop` hook writes to this file automatically at session end. Only non-main branches are recorded — if everything is on `main`, nothing is written for that repo.
## Version Control: Prefer jj

Use `jj` (Jujutsu) for all VCS operations instead of `git`:
- `jj status`, `jj diff`, `jj log` for inspection
- `jj new` to start a change, `jj describe` to set the message
- `jj commit` to commit, `jj push` to push
- `jj squash`, `jj rebase`, `jj edit` for history manipulation

Fall back to `git` only for operations not yet supported by `jj`.

