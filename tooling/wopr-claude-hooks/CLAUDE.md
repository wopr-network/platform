# wopr-claude-hooks

Claude Code hooks configuration for the WOPR project — automates formatting, linting, and coordination on file save and session events.

## Structure

```
hooks.json     # Claude Code hooks configuration
```

## Key Details

- `hooks.json` is the Claude Code hooks config — defines what runs on pre-edit, post-edit, session-start, etc.
- Hooks automate: Biome format/lint on file save, session state persistence, swarm coordination
- Changes here affect ALL Claude Code agents working in WOPR repos
- **Gotcha**: A broken hook script will silently fail or block operations. Test hook scripts before committing.

## Session Memory

At the start of every WOPR session, **read `~/.wopr-memory.md` if it exists.** It contains recent session context: which repos were active, what branches are in flight, and how many uncommitted changes exist. Use it to orient quickly without re-investigating.

The `Stop` hook writes to this file automatically at session end. Only non-main branches are recorded — if everything is on `main`, nothing is written for that repo.

## Issue Tracking

All issues in **Linear** (team: WOPR). Issue descriptions start with `**Repo:** wopr-network/wopr-claude-hooks`.

## Version Control: Prefer jj

Use `jj` (Jujutsu) for all VCS operations instead of `git`:
- `jj status`, `jj diff`, `jj log` for inspection
- `jj new` to start a change, `jj describe` to set the message
- `jj commit` to commit, `jj push` to push
- `jj squash`, `jj rebase`, `jj edit` for history manipulation

Fall back to `git` only for operations not yet supported by `jj`.

