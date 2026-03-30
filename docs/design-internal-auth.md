# Internal Auth Middleware Design

## Status: DRAFT
## Author: core-extraction team
## Date: 2026-03-30

---

## 1. Problem Statement

Platform-core is being extracted into a standalone server that runs on the private
network. It is **never exposed to the internet**. Only three classes of caller
reach it:

| Caller | Transport | Current auth |
|--------|-----------|--------------|
| Next.js UI servers (SSR) | HTTP over private network | Session cookie (better-auth) |
| Holyship (flow engine) | HTTP over private network | None / ad-hoc |
| Bots via gateway | Gateway proxy (already authed) | Service key (Bearer) |

We need a single internal auth middleware that authenticates callers and carries
tenant/user/product context through to tRPC procedures and Hono route handlers.

---

## 2. Design Decision: New Middleware (Not Extending scopedBearerAuth)

**Decision**: Create a new `internalServiceAuth` middleware, separate from
`scopedBearerAuth`.

**Why not extend scopedBearerAuth?**

- `scopedBearerAuth` is designed for external API tokens with scope hierarchies
  (`read`/`write`/`admin`) and the `wopr_<scope>_<random>` token format. Internal
  service auth has a fundamentally different trust model: the caller is a trusted
  server, not an external API consumer.
- Scoped tokens embed authorization (what can the token do?). Internal service
  tokens embed authentication (who is calling?) — the authorization comes from the
  forwarded user/tenant context.
- Mixing concerns would make both harder to reason about and test.

**What about the gateway's serviceKeyAuth?**

- `serviceKeyAuth` resolves bot service keys to `GatewayTenant` for metering/billing.
  Completely different concern. It stays as-is for the gateway.

---

## 3. Header Contract

### Required Headers

| Header | Format | Description | Validation |
|--------|--------|-------------|------------|
| `Authorization` | `Bearer <token>` | Proves caller is a legitimate internal service | Timing-safe compare against known service tokens |
| `X-Tenant-Id` | UUID string | Tenant this request is scoped to | Non-empty, max 255 chars |
| `X-User-Id` | UUID string | The authenticated end-user making the request | Non-empty, max 255 chars |

### Optional Headers

| Header | Format | Default | Description |
|--------|--------|---------|-------------|
| `X-Product` | `wopr` \| `paperclip` \| `nemoclaw` \| `holyship` | `wopr` | Which product brand is making the request |
| `X-Auth-Method` | `session` \| `api_key` \| `service` | `session` | How the original user authenticated to the UI |
| `X-User-Roles` | Comma-separated list | `user` | Roles from the original session (e.g., `admin,user`) |
| `X-Request-Id` | UUID/string | Auto-generated | Trace ID for request correlation |

### Header Name Rationale

- `X-Tenant-Id` / `X-User-Id` / `X-Product` are already used in the existing
  codebase (`createTRPCContext` already reads `x-tenant-id` from headers at
  `trpc/init.ts:45`).
- No `X-` prefix debate: these are internal-only headers on a private network,
  not public API headers. Consistency with existing usage wins.

---

## 4. Service Token Design

### Token Format

```
core_<service>_<random>
```

Examples:
- `core_wopr-ui_a1b2c3d4e5f6...` — WOPR platform UI server
- `core_paperclip-ui_x9y8z7w6...` — Paperclip UI server
- `core_holyship_m3n4o5p6...` — Holyship flow engine

### Token Properties

- **One token per service**: Each UI server / holyship instance gets its own token.
- **Loaded from environment**: `CORE_SERVICE_TOKEN` on each caller,
  `CORE_ALLOWED_SERVICE_TOKENS` (comma-separated) on the core server.
- **No DB lookup**: Tokens are static config. Zero database round-trips for auth.
  This is deliberate — core server auth should have zero external dependencies.
- **No scope hierarchy**: Internal services are fully trusted. The authorization
  boundary is at the UI layer (session + RBAC), not at the core layer.
- **Rotation**: Rotate by adding the new token to the allowed list, deploying
  callers with the new token, then removing the old token. Standard zero-downtime
  rotation.

### Token Storage on Core Server

```typescript
// Built at startup from CORE_ALLOWED_SERVICE_TOKENS env var
const allowedTokens: Map<string, string> = new Map();
// key = token string, value = service name (parsed from token prefix)
// e.g., "core_wopr-ui_abc123" -> "wopr-ui"
```

---

## 5. Middleware Implementation

### New Types

```typescript
// src/auth/internal-service.ts

import type { Context, Next } from "hono";

/** Valid product brands. */
export type Product = "wopr" | "paperclip" | "nemoclaw" | "holyship";

/** Context set by internalServiceAuth middleware. */
export interface InternalServiceEnv {
  Variables: {
    /** The verified service identity (e.g., "wopr-ui", "holyship"). */
    serviceName: string;
    /** Tenant ID forwarded from the UI's session. */
    tenantId: string;
    /** User ID forwarded from the UI's session. */
    userId: string;
    /** Product brand. */
    product: Product;
    /** How the original user authenticated (forwarded from UI). */
    authMethod: "session" | "api_key" | "service";
    /** User roles forwarded from the UI's session. */
    userRoles: string[];
    /** Optional request trace ID. */
    requestId: string;
    /**
     * AuthUser — set for compatibility with existing middleware that reads
     * c.get("user"). Populated from X-User-Id and X-User-Roles.
     */
    user: import("./index.js").AuthUser;
  };
}

const VALID_PRODUCTS = new Set<string>(["wopr", "paperclip", "nemoclaw", "holyship"]);
const VALID_AUTH_METHODS = new Set<string>(["session", "api_key", "service"]);
```

### Middleware Function

```typescript
import { timingSafeEqual, randomUUID } from "node:crypto";
import { extractBearerToken } from "./index.js";
import type { AuthUser } from "./index.js";

export interface InternalServiceAuthConfig {
  /** Map of token -> service name. Built from CORE_ALLOWED_SERVICE_TOKENS. */
  tokens: Map<string, string>;
}

/**
 * Build the internal service token map from environment.
 *
 * CORE_ALLOWED_SERVICE_TOKENS format:
 *   "core_wopr-ui_abc123,core_paperclip-ui_def456,core_holyship_ghi789"
 *
 * Service name is extracted from the token: core_<service>_<random> -> <service>
 */
export function buildInternalTokenMap(
  env: Record<string, string | undefined> = process.env,
): Map<string, string> {
  const raw = env.CORE_ALLOWED_SERVICE_TOKENS?.trim();
  if (!raw) return new Map();

  const tokens = new Map<string, string>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    // Parse service name from core_<service>_<random>
    const parts = trimmed.split("_");
    if (parts.length >= 3 && parts[0] === "core") {
      tokens.set(trimmed, parts[1]);
    }
  }
  return tokens;
}

/**
 * Timing-safe token lookup. Iterates all allowed tokens to prevent
 * timing side-channel leaks on token validity.
 */
function timingSafeLookup(tokens: Map<string, string>, candidate: string): string | undefined {
  const candidateBuf = Buffer.from(candidate);
  let found: string | undefined;
  for (const [token, serviceName] of tokens) {
    const tokenBuf = Buffer.from(token);
    if (candidateBuf.length === tokenBuf.length && timingSafeEqual(candidateBuf, tokenBuf)) {
      found = serviceName;
    }
  }
  return found;
}

/**
 * Internal service authentication middleware.
 *
 * Validates the service token and extracts tenant/user/product context
 * from headers. Sets InternalServiceEnv variables for downstream handlers.
 *
 * MUST only run on the private network. Never expose routes using this
 * middleware to the public internet.
 */
export function internalServiceAuth(config: InternalServiceAuthConfig) {
  return async (c: Context<InternalServiceEnv>, next: Next) => {
    // 1. Validate service token
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Missing service token" }, 401);
    }

    const serviceName = timingSafeLookup(config.tokens, token);
    if (!serviceName) {
      return c.json({ error: "Invalid service token" }, 401);
    }

    // 2. Extract and validate required headers
    const tenantId = c.req.header("X-Tenant-Id")?.trim();
    const userId = c.req.header("X-User-Id")?.trim();

    if (!tenantId || tenantId.length > 255) {
      return c.json({ error: "Missing or invalid X-Tenant-Id header" }, 400);
    }
    if (!userId || userId.length > 255) {
      return c.json({ error: "Missing or invalid X-User-Id header" }, 400);
    }

    // 3. Extract optional headers with defaults
    const productRaw = c.req.header("X-Product")?.trim()?.toLowerCase() ?? "wopr";
    const product: Product = VALID_PRODUCTS.has(productRaw)
      ? (productRaw as Product)
      : "wopr";

    const authMethodRaw = c.req.header("X-Auth-Method")?.trim() ?? "session";
    const authMethod = VALID_AUTH_METHODS.has(authMethodRaw)
      ? (authMethodRaw as "session" | "api_key" | "service")
      : "session";

    const rolesRaw = c.req.header("X-User-Roles")?.trim();
    const userRoles = rolesRaw
      ? rolesRaw.split(",").map((r) => r.trim()).filter(Boolean)
      : ["user"];

    const requestId = c.req.header("X-Request-Id")?.trim() || randomUUID();

    // 4. Set context variables
    c.set("serviceName", serviceName);
    c.set("tenantId", tenantId);
    c.set("userId", userId);
    c.set("product", product);
    c.set("authMethod", authMethod);
    c.set("userRoles", userRoles);
    c.set("requestId", requestId);

    // 5. Set AuthUser for compatibility with existing middleware
    const user: AuthUser = { id: userId, roles: userRoles };
    c.set("user", user);

    return next();
  };
}
```

---

## 6. tRPC Context Integration

### Updated TRPCContext

```typescript
// In trpc/init.ts — extend the existing TRPCContext

export interface TRPCContext {
  /** Authenticated user, or undefined for unauthenticated requests. */
  user: AuthUser | undefined;
  /** Tenant ID — from session or forwarded by UI server. */
  tenantId: string | undefined;
  /** Product brand (wopr/paperclip/nemoclaw/holyship). */
  product: Product | undefined;
  /** Calling service name (set when request comes via internal service auth). */
  serviceName: string | undefined;
}
```

### New Context Factory for Core Server Mode

```typescript
/**
 * Create TRPCContext from a Hono context that has already passed through
 * internalServiceAuth middleware. No session resolution needed — the UI
 * server already resolved the session and forwarded claims.
 */
export function createTRPCContextFromInternalService(
  c: Context<InternalServiceEnv>,
): TRPCContext {
  return {
    user: c.get("user"),
    tenantId: c.get("tenantId"),
    product: c.get("product"),
    serviceName: c.get("serviceName"),
  };
}
```

### How tRPC Procedures Access Context

Existing procedures already use `ctx.user` and `ctx.tenantId`. They continue
to work unchanged. The new `product` and `serviceName` fields are available
for procedures that need them (e.g., brand-specific email templates):

```typescript
// Example: existing procedure works unchanged
export const getProfile = protectedProcedure.query(async ({ ctx }) => {
  // ctx.user.id  — the end user's ID (forwarded from UI session)
  // ctx.tenantId — the tenant (forwarded from UI session)
  return profileService.getProfile(ctx.user.id, ctx.tenantId);
});

// Example: new procedure that needs product context
export const sendBrandedEmail = protectedProcedure
  .input(z.object({ templateId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // ctx.product — "paperclip" | "wopr" | etc.
    return emailService.send(input.templateId, ctx.tenantId, ctx.product);
  });
```

---

## 7. Better-Auth: Who Runs It?

### Decision: UI servers run better-auth. Core does NOT.

**Rationale:**

- Better-auth manages session cookies, OAuth flows, login/signup pages. All of
  these are browser-facing concerns that belong in the UI layer.
- Core server has no browser clients. Running better-auth on core would mean
  maintaining a second session store, handling CORS for cookies, and duplicating
  the session DB — all for zero benefit.
- The UI servers already resolve sessions today. The extraction just makes
  the forwarding explicit instead of in-process.

**Flow:**

```
Browser ──cookie──> UI Server (Next.js SSR)
                       │
                       │ better-auth resolves session
                       │ extracts user.id, roles, tenantId
                       │
                       ▼
                    Core Server (private network)
                       │
                       │ Authorization: Bearer core_wopr-ui_abc123
                       │ X-Tenant-Id: tenant-uuid
                       │ X-User-Id: user-uuid
                       │ X-Product: wopr
                       │ X-User-Roles: admin,user
                       │
                       ▼
                    internalServiceAuth middleware
                       │ validates token, sets context
                       ▼
                    tRPC / Hono route handlers
```

**What about better-auth's DB tables?**

Core server still owns the database (users, sessions, accounts tables).
The UI server connects to that same database for better-auth session resolution.
This is unchanged from today — the DB is shared. The only change is that HTTP
requests between UI and Core carry forwarded claims instead of cookies.

---

## 8. Coexistence with Gateway Auth (Bot Service Keys)

The gateway's `serviceKeyAuth` and the new `internalServiceAuth` serve
completely different purposes and operate on different route groups:

| Middleware | Routes | Token format | Purpose |
|-----------|--------|--------------|---------|
| `internalServiceAuth` | `/trpc/*`, `/api/*` (core routes) | `core_<service>_<random>` | UI -> Core server-to-server |
| `serviceKeyAuth` | `/v1/*` (gateway routes) | `wopr_<scope>_<random>` | Bot -> Gateway external API |
| `scopedBearerAuth` | `/fleet/*` (fleet management) | `wopr_<scope>_<random>` | External fleet API tokens |
| `sessionAuth` / `dualAuth` | UI-facing routes (current) | Session cookie / API key | Browser -> UI server (stays on UI) |

**In the extracted architecture:**

```
                    ┌─────────────────────────────────┐
  Browser ─cookie─> │  UI Server (wopr/paperclip/etc) │
                    │  - better-auth (session)        │
                    │  - CSRF protection              │
                    │  - dualAuth middleware           │
                    └──────────┬──────────────────────┘
                               │ internalServiceAuth
                               ▼
                    ┌─────────────────────────────────┐
  Bot ─svc key────> │  Core Server (private network)  │
  (via gateway)     │  - internalServiceAuth (/trpc)  │
                    │  - serviceKeyAuth (/v1 gateway) │
                    │  - scopedBearerAuth (/fleet)    │
                    └─────────────────────────────────┘
```

**Note**: The gateway (`/v1/*` routes) may stay on the core server or be
extracted separately. Either way, `serviceKeyAuth` and `internalServiceAuth`
mount on disjoint route prefixes and never conflict.

---

## 9. Security Considerations

### 9.1 Timing-Safe Token Comparison

The middleware uses `timingSafeEqual` via the `timingSafeLookup` function
(same pattern as existing `timingSafeMapLookup` in `auth/index.ts`). This
prevents timing side-channel attacks on token guessing.

### 9.2 Network-Level Isolation

- Core server binds to the private network interface only (e.g., `10.0.0.0/8`
  or Docker network).
- No public DNS record points to core server.
- Firewall rules: only UI server IPs and holyship can reach core server's port.
- Defense in depth: even if network isolation fails, the service token is still
  required. An attacker without a valid token gets 401.

### 9.3 No CSRF on Core

- CSRF attacks exploit browser cookie auto-send. Core has no cookies.
- All requests require an explicit `Authorization` header that browsers cannot
  auto-attach.
- The existing `csrfProtection` middleware stays on the UI servers where cookies
  exist.

### 9.4 Header Forgery Prevention

- The service token proves the caller is a legitimate internal server.
  Only trusted servers have the token.
- An attacker who compromises a UI server can forge headers, but at that point
  the attacker already has session cookie access — header forgery is not an
  escalation.
- Rate limiting on the core server is optional but recommended for defense in
  depth (e.g., 10k req/s per service token).

### 9.5 Token Rotation

- Zero-downtime rotation: add new token to `CORE_ALLOWED_SERVICE_TOKENS`,
  deploy core. Deploy callers with new token. Remove old token from core.
- Tokens should be rotated on a regular schedule (e.g., quarterly) and
  immediately if a UI server is compromised.

### 9.6 No Tenant Validation on Core

- Core trusts the `X-Tenant-Id` and `X-User-Id` headers because the UI
  server already validated them against the session.
- The tRPC `isAuthedWithTenant` middleware's org-membership check is
  **skipped** for internal service requests (the user ID starts with
  nothing special — but the `serviceName` being set signals internal origin).
- **Decision**: Add a check in the `isAuthed` middleware: if `serviceName` is
  set on context, skip the org-member validation (the UI already did it).
  This replaces the current `BEARER_TOKEN_ID_PREFIX` check with a cleaner
  signal.

### 9.7 Audit Trail

The `serviceName` and `requestId` context values enable correlation:

```
[2026-03-30T12:00:00Z] service=wopr-ui request=abc-123 tenant=t-456 user=u-789 product=wopr action=getProfile
```

---

## 10. Environment Configuration

### Core Server

```bash
# Comma-separated list of allowed service tokens
CORE_ALLOWED_SERVICE_TOKENS=core_wopr-ui_abc123,core_paperclip-ui_def456,core_holyship_ghi789

# Bind to private network only
CORE_HOST=10.132.0.2
CORE_PORT=3001
```

### UI Server (e.g., WOPR)

```bash
# Token this UI server uses to authenticate to core
CORE_SERVICE_TOKEN=core_wopr-ui_abc123

# Core server URL (private network)
CORE_URL=http://10.132.0.2:3001
```

### Docker Compose (Development)

```yaml
services:
  core:
    environment:
      CORE_ALLOWED_SERVICE_TOKENS: "core_dev_localtoken123"
    networks:
      - internal
    # No ports exposed to host — only accessible via internal network

  wopr-ui:
    environment:
      CORE_SERVICE_TOKEN: "core_dev_localtoken123"
      CORE_URL: "http://core:3001"
    networks:
      - internal
      - public
    ports:
      - "3000:3000"  # Public-facing

networks:
  internal:
    internal: true  # Not accessible from host
  public:
```

---

## 11. Migration Path

### Phase 1: Add middleware (no behavioral change)

1. Create `src/auth/internal-service.ts` with the middleware implementation.
2. Add `Product` type and `InternalServiceEnv` interface.
3. Add `createTRPCContextFromInternalService` context factory.
4. Export from `src/auth/index.ts`.
5. Unit tests for token parsing, timing-safe lookup, header validation.

### Phase 2: Mount on core server

1. In `mountRoutes` / `bootPlatformServer`, mount `internalServiceAuth`
   on the tRPC and API route groups.
2. Add `CORE_ALLOWED_SERVICE_TOKENS` to core server config.
3. The `createTRPCContext` function gains a branch: if `serviceName` is on
   the Hono context, use `createTRPCContextFromInternalService`; otherwise
   fall back to the existing session-based resolution.

### Phase 3: UI servers become clients

1. Each UI server gets a `CORE_SERVICE_TOKEN` and `CORE_URL`.
2. UI servers create a tRPC client (or HTTP client) that:
   - Sets `Authorization: Bearer <CORE_SERVICE_TOKEN>`
   - Forwards `X-Tenant-Id`, `X-User-Id`, `X-Product`, `X-User-Roles` from
     the resolved session.
3. Existing in-process calls to platform-core functions are replaced with
   HTTP calls to core server.

### Phase 4: Remove better-auth from core server

1. Once all UI servers are forwarding claims, core server no longer needs
   `resolveSessionUser`, `sessionAuth`, or `dualAuth`.
2. Remove better-auth dependency from core server's runtime (it still
   owns the DB tables — the UI servers connect to the shared DB).
3. `createTRPCContext` simplifies to only handle internal service context.

---

## 12. File Layout

```
core/platform-core/src/auth/
├── index.ts                    # Re-exports (add internal-service exports)
├── internal-service.ts         # NEW — internalServiceAuth middleware
├── internal-service.test.ts    # NEW — unit tests
├── middleware.ts                # Existing — sessionAuth, dualAuth (stays for UI servers)
├── better-auth.ts              # Existing — better-auth factory (stays for UI servers)
├── api-key-repository.ts       # Existing
├── login-history-repository.ts # Existing
├── user-creator.ts             # Existing
└── user-role-repository.ts     # Existing
```

---

## 13. Open Questions

1. **Should holyship use the same token format?** Holyship is a server, not a UI.
   It doesn't have user sessions to forward. For holyship-initiated requests
   (e.g., flow engine callbacks), we may want a `service` auth method where
   `X-User-Id` is a system actor ID. **Proposed**: Yes, same format. Holyship
   sets `X-User-Id: system:holyship` and `X-Auth-Method: service`.

2. **Should we validate X-Tenant-Id format?** Currently proposed as "non-empty,
   max 255 chars". Could be stricter (UUID format). **Proposed**: Keep loose for
   now — tenant IDs are UUIDs in practice but we don't want to break if a product
   uses a different format.

3. **Rate limiting per service token?** Not in v1. Add if abuse is observed.
   Network isolation is the primary defense.
