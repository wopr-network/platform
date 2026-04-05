#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Paperclip managed image entrypoint — privilege separation for agents.
#
# Two users:
#   paperclip — runs the Paperclip API server (NODE_ENV=production)
#   sandbox   — runs agent code via OpenCode (dev-friendly, no NODE_ENV)
#
# Both users share the `agents` supplementary group so prep work (skills,
# XDG config) written by the server is readable by agent processes.
#
# Modeled after NemoClaw's nemoclaw-start.sh. The server process cannot be
# killed or tampered with by agent workloads because they run under a
# different UID.
# ---------------------------------------------------------------------------

set -euo pipefail

# Harden: limit fork bombs
if ! ulimit -Hu 1024 2>/dev/null; then
  echo "[security] Could not set hard nproc limit" >&2
fi

# Lock PATH to prevent binary injection from agent workspaces
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Drop unnecessary capabilities from the bounding set.
# Keep: cap_chown, cap_setuid, cap_setgid, cap_fowner, cap_kill (needed for gosu).
if [ "${PAPERCLIP_CAPS_DROPPED:-}" != "1" ] && command -v capsh >/dev/null 2>&1; then
  if capsh --has-p=cap_setpcap 2>/dev/null; then
    export PAPERCLIP_CAPS_DROPPED=1
    exec capsh \
      --drop=cap_net_raw,cap_dac_override,cap_sys_chroot,cap_fsetid,cap_setfcap,cap_mknod,cap_audit_write,cap_net_bind_service \
      -- -c 'exec /usr/local/bin/managed-entrypoint "$@"' -- "$@"
  fi
fi

# ── Permissions ─────────────────────────────────────────────────
# Agent workspaces live under /paperclip/instances/*/workspaces.
# The sandbox user needs write access to create files, install deps, etc.
# The paperclip server needs write access to the same dirs for prep work
# (skills injection, git init, XDG config).
#
# Strategy:
#   - Workspace dirs are owned by sandbox:agents (sandbox writes, server reads)
#   - /tmp is world-writable (XDG temp dirs created here by server, read by sandbox)
#   - Server runs with umask 0002 so files are group-readable by `agents` group
setup_permissions() {
  # Instance shared workspace — default working directory for all agents.
  # Created at startup so it exists before any heartbeat runs.
  local instance_root="/paperclip/instances/${PAPERCLIP_INSTANCE_ID:-default}"
  local shared_workspace="$instance_root/workspace"
  mkdir -p "$shared_workspace"
  chown sandbox:agents "$shared_workspace"
  chmod g+rwx "$shared_workspace"

  # Per-project workspace directories — owned by sandbox, group agents
  if [ -d "$instance_root/workspaces" ]; then
    find "$instance_root/workspaces" -type d -name workspaces -exec chown -R sandbox:agents {} + 2>/dev/null || true
    find "$instance_root/workspaces" -maxdepth 1 -mindepth 1 -type d -exec chown -R sandbox:agents {} + 2>/dev/null || true
    chmod -R g+rwX "$instance_root/workspaces" 2>/dev/null || true
  fi

  # /data is the agent HOME for spawned processes
  chown -R sandbox:agents /data 2>/dev/null || true
  chmod -R g+rwX /data 2>/dev/null || true

  # /sandbox is the sandbox user's home
  chown -R sandbox:agents /sandbox 2>/dev/null || true

  # Git identity is configured dynamically per-run by the adapter using the
  # company owner's connected GitHub account (OAuth). Not set here.

  # Materialized skills — written by server, read by agents via symlinks.
  # Path: /paperclip/instances/<id>/skills/<companyId>/__runtime__/<skill>/
  # Must be traversable + readable by sandbox user.
  if [ -d "$instance_root/skills" ]; then
    chgrp -R agents "$instance_root/skills" 2>/dev/null || true
    chmod -R g+rX "$instance_root/skills" 2>/dev/null || true
  fi

  # /paperclip directory tree must be traversable by both users.
  # paperclip needs it for server data, sandbox needs it to follow
  # skill symlinks and reach workspace dirs.
  chmod g+rwx /paperclip 2>/dev/null || true
  if [ -d /paperclip/instances ]; then
    chmod g+rwx /paperclip/instances 2>/dev/null || true
    find /paperclip/instances -maxdepth 1 -type d -exec chmod g+rwx {} + 2>/dev/null || true
  fi
}

# ── Main ─────────────────────────────────────────────────────────

case "${1:-server}" in
  server)
    echo "[paperclip] Starting server (paperclip user, NODE_ENV=production)"
    setup_permissions

    # umask 0002: files created by server are group-writable.
    # This ensures skills, XDG config, and other prep work written by
    # the paperclip user are accessible to the sandbox user via the
    # shared `agents` group.
    umask 0002

    exec gosu paperclip env \
      NODE_ENV=production \
      node --import /app/node_modules/tsx/dist/loader.mjs \
      sidecars/paperclip/server/dist/index.js
    ;;

  sandbox)
    # Run a command as the sandbox user (dev environment, no NODE_ENV).
    # Used by the adapter via `gosu sandbox` in runChildProcess.
    shift
    exec gosu sandbox "$@"
    ;;

  *)
    # Pass-through for debugging (e.g., bash, sh)
    exec "$@"
    ;;
esac
