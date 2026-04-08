#!/usr/bin/env bash
# WOPR NemoClaw wrapper entrypoint.
#
# Starts the provision sidecar, waits for platform-core to POST /internal/provision
# (which writes a per-tenant openclaw.json and regenerates .config-hash), then execs
# upstream's nemoclaw-start.sh which verifies the new hash and applies runtime
# hardening (chattr +i, gateway user separation, etc.).
#
# If provision never arrives (standalone use, misconfigured platform-core, etc.),
# we fall through after a timeout and start with the baked-in default config.
#
# Why this works: upstream hardens AT RUNTIME inside nemoclaw-start.sh. At image
# build time the config is just chmod 444 / chown root — which root can overwrite
# (DAC doesn't restrict root). We insert the WOPR provision BETWEEN image build
# and nemoclaw-start, so the hash verification, symlink chattr, and gateway user
# drop all apply to OUR provisioned config, preserving upstream's invariants.

set -euo pipefail

readonly WOPR_PROVISION_MARKER="/tmp/.wopr-provisioned"
readonly WOPR_TIMEOUT_SECONDS="${WOPR_PROVISION_TIMEOUT:-300}"
readonly NEMOCLAW_START="/usr/local/bin/nemoclaw-start"

# If the sidecar isn't present (dev images, quick tests) OR the container is
# being launched for a one-shot openclaw command (CMD != default), skip the
# provision wait entirely and go straight to upstream's entrypoint.
if [ ! -x /opt/wopr/sidecar.js ]; then
  echo "[wopr-entrypoint] no sidecar at /opt/wopr/sidecar.js — delegating to ${NEMOCLAW_START}" >&2
  exec "${NEMOCLAW_START}" "$@"
fi

# Skip provision for one-shot sandbox commands (openclaw agent ..., bash, etc.).
# The default CMD is /bin/bash which is non-empty. Only wait for provision when
# we're starting the full gateway (no args passed).
if [ "$#" -gt 0 ] && [ "${1:-}" != "/bin/bash" ] && [ "${1:-}" != "bash" ]; then
  echo "[wopr-entrypoint] one-shot command — delegating to ${NEMOCLAW_START}" >&2
  exec "${NEMOCLAW_START}" "$@"
fi

# If provision already completed in a previous run (persistent volume reuse),
# skip the wait and go straight through.
if [ -f "${WOPR_PROVISION_MARKER}" ]; then
  echo "[wopr-entrypoint] provision marker present, skipping sidecar wait" >&2
  exec "${NEMOCLAW_START}" "$@"
fi

# Start the sidecar in the background, redirecting logs to stderr so the
# container sees them interleaved with nemoclaw-start's output.
echo "[wopr-entrypoint] starting provision sidecar" >&2
node /opt/wopr/sidecar.js >&2 &
SIDECAR_PID=$!

# Ensure the sidecar is cleaned up if we exit for any reason.
cleanup_sidecar() {
  if kill -0 "${SIDECAR_PID}" 2>/dev/null; then
    kill "${SIDECAR_PID}" 2>/dev/null || true
    wait "${SIDECAR_PID}" 2>/dev/null || true
  fi
}
trap cleanup_sidecar EXIT

# Wait for /internal/provision to complete (marker file appears) OR the
# sidecar to die OR the timeout to elapse. The sidecar writes the marker
# AFTER it has rewritten /sandbox/.openclaw/openclaw.json and regenerated
# /sandbox/.openclaw/.config-hash.
echo "[wopr-entrypoint] waiting up to ${WOPR_TIMEOUT_SECONDS}s for /internal/provision" >&2
elapsed=0
while [ "${elapsed}" -lt "${WOPR_TIMEOUT_SECONDS}" ]; do
  if [ -f "${WOPR_PROVISION_MARKER}" ]; then
    echo "[wopr-entrypoint] provision complete after ${elapsed}s" >&2
    break
  fi
  if ! kill -0 "${SIDECAR_PID}" 2>/dev/null; then
    echo "[wopr-entrypoint] sidecar exited before provision completed — falling through with baked config" >&2
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

if [ ! -f "${WOPR_PROVISION_MARKER}" ]; then
  echo "[wopr-entrypoint] provision not received after ${WOPR_TIMEOUT_SECONDS}s — starting with baked config" >&2
fi

# Stop the sidecar now. nemoclaw-start takes over as PID 1 of the gateway
# lifecycle and we don't want two processes fighting for PID 1 semantics.
cleanup_sidecar
trap - EXIT

# Hand off to upstream's entrypoint, which will verify the (now updated)
# config hash, validate symlinks, apply chattr +i hardening, and start the
# gateway as the dedicated 'gateway' user.
echo "[wopr-entrypoint] exec ${NEMOCLAW_START}" >&2
exec "${NEMOCLAW_START}" "$@"
