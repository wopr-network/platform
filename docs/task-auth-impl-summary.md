# Internal Auth Middleware — Implementation Summary

## Files Created

### `core/platform-core/src/auth/internal-service-auth.ts`

Implementation of `internalServiceAuth` middleware per the design doc. Key decisions:

- **Self-contained module**: Does NOT import from `./index.js` to avoid pulling in the `better-auth` dependency tree. Inlines `extractBearerToken` and a local `AuthUser` interface (structurally identical to the canonical one in `index.ts`).
- **Token parsing at construction time**: `parseAllowedTokens()` builds the `Map<string, string>` once when the middleware is created, not per-request.
- **Timing-safe comparison**: `timingSafeLookup()` iterates ALL tokens using `crypto.timingSafeEqual`, matching the existing `timingSafeMapLookup` pattern in `auth/index.ts`.
- **Header validation**: X-Tenant-Id and X-User-Id are required (non-empty, max 255 chars). X-Product validates against known slugs and defaults to "wopr". X-User-Roles splits on comma. X-Request-Id auto-generates via `crypto.randomUUID()`.
- **AuthUser compatibility**: Sets `c.set("user", { id, roles })` for downstream middleware that reads `c.get("user")`.

### `core/platform-core/src/auth/internal-service-auth.test.ts`

25 tests covering:
- Token authentication (valid, missing, invalid, non-Bearer scheme)
- Required header validation (missing/oversized X-Tenant-Id, X-User-Id)
- Optional header defaults and parsing (X-Product, X-User-Roles, X-Request-Id, X-Auth-Method)
- Multiple token acceptance
- Timing-safe functional verification
- AuthUser downstream compatibility

### `core/platform-core/src/auth/index.ts` (modified)

Added re-exports:
```ts
export type { InternalServiceAuthConfig, InternalServiceAuthEnv, Product } from "./internal-service-auth.js";
export { internalServiceAuth, parseAllowedTokens } from "./internal-service-auth.js";
```

## Exported API

| Export | Type | Description |
|--------|------|-------------|
| `internalServiceAuth(config)` | function | Hono middleware factory |
| `parseAllowedTokens(csv)` | function | Parses comma-separated tokens into Map |
| `InternalServiceAuthConfig` | interface | `{ allowedTokens: string }` |
| `InternalServiceAuthEnv` | interface | Hono env with Variables for all context fields |
| `Product` | type | `"wopr" \| "paperclip" \| "nemoclaw" \| "holyship"` |

## Test Results

All 25 tests pass (`npx vitest run core/platform-core/src/auth/internal-service-auth.test.ts`).

## Note on tsc

Pre-existing type errors exist in `profile.ts` and `settings.ts` (missing `@trpc/server`, `zod` deps in this worktree). The new `internal-service-auth.ts` file introduces no new type errors.
