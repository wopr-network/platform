#!/usr/bin/env node
// WOPR NemoClaw sidecar — exposes /internal/health and /internal/provision
// so nemoclaw-platform can use the same provision contract as paperclip-platform.
//
// STARTUP CONTRACT (set up by wopr/entrypoint.sh which is the Docker ENTRYPOINT):
//   1. Our wrapper starts this sidecar in the background BEFORE
//      nemoclaw-start.sh runs (so before config hash verification and
//      chattr +i symlink hardening).
//   2. Platform-core POSTs /internal/provision with tenant config.
//   3. This sidecar rewrites /sandbox/.openclaw/openclaw.json,
//      regenerates /sandbox/.openclaw/.config-hash, and touches
//      /tmp/.wopr-provisioned to signal the wrapper to proceed.
//   4. The wrapper kills us and execs nemoclaw-start.sh, which verifies
//      the (now updated) hash, applies symlink hardening, and starts the
//      openclaw gateway as the 'gateway' user — all upstream invariants
//      preserved, just against OUR provisioned config instead of the
//      baked default.
//
// Env vars:
//   WOPR_PROVISION_SECRET  — shared secret for auth (required)
//   WOPR_GATEWAY_URL       — WOPR inference gateway base URL (e.g. https://gateway.wopr.bot/v1)
//   PORT                   — sidecar port (default: 3100)
//   OPENCLAW_CONFIG_PATH   — explicit config path (default: /sandbox/.openclaw/openclaw.json)
//   OPENCLAW_CONFIG_HASH   — explicit hash file path (default: /sandbox/.openclaw/.config-hash)
//   WOPR_PROVISION_MARKER  — marker file the wrapper polls (default: /tmp/.wopr-provisioned)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SECRET = process.env.WOPR_PROVISION_SECRET ?? "";
const GATEWAY_URL = process.env.WOPR_GATEWAY_URL ?? "";
const PORT = parseInt(process.env.PORT ?? process.env.WOPR_SIDECAR_PORT ?? "3100", 10);
// Explicit paths — do NOT derive from os.homedir() because upstream removed
// `ENV HOME=/data` from the Dockerfile and the ENTRYPOINT runs as root.
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH ?? "/sandbox/.openclaw/openclaw.json";
const OPENCLAW_HASH_PATH = process.env.OPENCLAW_CONFIG_HASH ?? "/sandbox/.openclaw/.config-hash";
const WOPR_PROVISION_MARKER = process.env.WOPR_PROVISION_MARKER ?? "/tmp/.wopr-provisioned";
// Upper bound on the POST body we'll accept. Provision payloads are tiny
// (a few hundred bytes of JSON); anything beyond this is either malicious
// or a bug in the caller. Refuse early to prevent memory exhaustion.
const MAX_BODY_BYTES = 16 * 1024;
// Minimum secret length. Anything shorter is effectively no auth at all.
const MIN_SECRET_LENGTH = 16;

// SECURITY: Hard startup guard. An empty or trivially-short secret is a
// privilege-escalation vector — `assertSecret` would accept an empty bearer
// token and any peer on :3100 could rewrite openclaw.json + forge the
// integrity hash, defeating every downstream invariant applied by
// upstream's nemoclaw-start.sh.
if (SECRET.length < MIN_SECRET_LENGTH) {
  console.error(
    `[wopr-sidecar] FATAL: WOPR_PROVISION_SECRET must be set to a value of at least ${MIN_SECRET_LENGTH} characters. ` +
      "Refusing to start — an empty or trivial secret would allow unauthenticated provisioning.",
  );
  process.exit(1);
}

// Pre-compute the secret as a Buffer so we can do a timing-safe compare
// without allocating on every request.
const SECRET_BUFFER = Buffer.from(SECRET, "utf8");

function assertSecret(req) {
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const provided = auth.slice("Bearer ".length).trim();
  if (provided.length === 0) return false;
  const providedBuffer = Buffer.from(provided, "utf8");
  // timingSafeEqual requires equal-length buffers; bail early if they
  // differ so we don't short-circuit on attacker-chosen prefix lengths.
  if (providedBuffer.length !== SECRET_BUFFER.length) return false;
  return crypto.timingSafeEqual(providedBuffer, SECRET_BUFFER);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // The baked config is chmod 444 + chown root. We are root (the wrapper
  // entrypoint runs us before upstream's nemoclaw-start.sh drops privs), so
  // DAC does not prevent the write, but fs.writeFileSync refuses to open a
  // read-only file for truncation. Chmod up before writing, chmod back after.
  let previousMode = null;
  try {
    previousMode = fs.statSync(filePath).mode & 0o777;
    fs.chmodSync(filePath, 0o644);
  } catch {
    /* first write — file doesn't exist yet, no need to chmod */
  }
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
  fs.chmodSync(filePath, previousMode ?? 0o444);
}

/**
 * Regenerate the SHA-256 hash file that upstream's nemoclaw-start.sh
 * verifies at startup. Must match the exact format produced by
 * `sha256sum /sandbox/.openclaw/openclaw.json` (a line of the form
 * `<hex>  /sandbox/.openclaw/openclaw.json\n`). nemoclaw-start.sh runs
 * `sha256sum -c` from the .openclaw directory, so the filename stored
 * in the hash file is the absolute path.
 */
function regenerateConfigHash(configPath, hashPath) {
  const contents = fs.readFileSync(configPath);
  const hex = crypto.createHash("sha256").update(contents).digest("hex");
  // sha256sum -c expects either "<hex>  <filename>" or "<hex> *<filename>".
  // Use two spaces (text mode) for the plain-text variant.
  const line = `${hex}  ${configPath}\n`;
  let previousMode = null;
  try {
    previousMode = fs.statSync(hashPath).mode & 0o777;
    fs.chmodSync(hashPath, 0o644);
  } catch {
    /* first write */
  }
  fs.writeFileSync(hashPath, line);
  fs.chmodSync(hashPath, previousMode ?? 0o444);
}

function writeProvisionMarker() {
  fs.mkdirSync(path.dirname(WOPR_PROVISION_MARKER), { recursive: true });
  fs.writeFileSync(WOPR_PROVISION_MARKER, `${new Date().toISOString()}\n`, { mode: 0o644 });
}

/**
 * Returns true once provisioning has completed — the hand-off to
 * nemoclaw-start.sh will happen immediately after, so from
 * platform-core's perspective "provisioned" == "gateway about to start".
 */
function isProvisioned() {
  return fs.existsSync(WOPR_PROVISION_MARKER);
}

function provision(body) {
  const { tenantId, tenantName, gatewayUrl, apiKey, budgetCents } = body;

  if (!tenantId || !tenantName) {
    throw new Error("Missing required fields: tenantId, tenantName");
  }

  const effectiveGateway = gatewayUrl || GATEWAY_URL;
  if (!effectiveGateway) {
    throw new Error("No gateway URL provided and WOPR_GATEWAY_URL not set");
  }

  // Point NemoClaw at WOPR's inference gateway instead of NVIDIA's
  const cfg = readJson(OPENCLAW_CONFIG_PATH);

  cfg.agents ??= {};
  cfg.agents.defaults ??= {};
  cfg.agents.defaults.model ??= {};
  cfg.agents.defaults.model.primary = "nvidia/nemotron-3-super-120b-a12b";

  cfg.models ??= {};
  cfg.models.mode = "merge";
  cfg.models.providers ??= {};
  cfg.models.providers["wopr-gateway"] = {
    baseUrl: effectiveGateway,
    apiKey: apiKey ?? "wopr-managed",
    api: "openai-completions",
    models: [
      {
        id: "nvidia/nemotron-3-super-120b-a12b",
        name: "Nemotron 3 Super 120B (via WOPR)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 4096,
      },
    ],
  };

  // Set WOPR gateway as the active provider
  cfg.agents.defaults.model.primary = "nvidia/nemotron-3-super-120b-a12b";
  cfg.gateway ??= {};
  cfg.gateway.inferenceProvider = "wopr-gateway";

  // Store tenant metadata for reference
  cfg._wopr = { tenantId, tenantName, budgetCents: budgetCents ?? 0, provisionedAt: new Date().toISOString() };

  writeJson(OPENCLAW_CONFIG_PATH, cfg);
  // Upstream's nemoclaw-start.sh runs `sha256sum -c .config-hash --status`
  // at startup (verify_config_integrity). Regenerate the hash so our new
  // config passes the integrity check. The script then applies chattr +i
  // hardening on OUR config, preserving every security invariant.
  regenerateConfigHash(OPENCLAW_CONFIG_PATH, OPENCLAW_HASH_PATH);
  // Signal the wrapper entrypoint that provision is done and it can exec
  // nemoclaw-start.sh.
  writeProvisionMarker();

  // Derive a stable tenantEntityId and slug from tenantId
  const tenantSlug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 32);
  const tenantEntityId = `e:${tenantId}`;

  return { tenantEntityId, tenantSlug };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check — no auth required (provision-client checks /internal/provision/health).
  // The sidecar is alive as soon as it starts (before provision), so we return
  // 200 "ready for provision" when not yet provisioned, and 200 "provisioned"
  // once the marker is written. Platform-core's provision-client uses this to
  // know when to POST /internal/provision.
  if (req.method === "GET" && (url.pathname === "/internal/health" || url.pathname === "/internal/provision/health")) {
    const provisioned = isProvisioned();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        provisioning: !provisioned,
        provisioned,
        state: provisioned ? "provisioned" : "awaiting_provision",
      }),
    );
    return;
  }

  // Provision — auth required
  if (req.method === "POST" && url.pathname === "/internal/provision") {
    if (!assertSecret(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Idempotency: once provision has completed, refuse subsequent rewrites.
    // Allowing re-provision is dangerous — the wrapper entrypoint may have
    // already exec'd nemoclaw-start.sh (which runs verify_config_integrity
    // at startup and then applies chattr +i). A second POST would either
    // (a) race with chattr and land on an immutable file (EPERM),
    // (b) succeed before chattr and force the already-started gateway to
    //     read an inconsistent config on its next reload, or
    // (c) cause verify_config_integrity to see a mismatched hash mid-cycle.
    // The provision contract is one-shot. Callers that need to re-provision
    // must tear down the container and start a fresh one.
    if (isProvisioned()) {
      res.writeHead(409, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Already provisioned",
          detail: "Provision is one-shot. Destroy and recreate the container to re-provision.",
        }),
      );
      return;
    }

    // Reject oversized requests early via Content-Length if present, so we
    // never buffer huge payloads that would OOM the container.
    const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Payload too large (max ${MAX_BODY_BYTES} bytes)` }));
      return;
    }

    let received = 0;
    const chunks = [];
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      received += chunk.length;
      // Streaming size check — defends against clients that omit or lie about
      // Content-Length (chunked transfer, HTTP/1.0, etc.).
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `Payload too large (max ${MAX_BODY_BYTES} bytes)` }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const result = provision(parsed);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[wopr-sidecar] listening on :${PORT}`);
});
