# Task 6: Wire tRPC + Internal Auth into mountRoutes/bootPlatformServer

## What was done

Wired the core tRPC router and internal service auth middleware into `mountRoutes()` / `bootPlatformServer()` so that passing `standalone` and/or `auth` config produces a complete standalone server with no additional product-side wiring needed.

## Files changed

### `core/platform-core/src/server/boot-config.ts`
- Added `standalone?: { allowedServiceTokens: string }` to `BootConfig`
- Added `auth?: { secret: string; socialProviders?: { github?, google? } }` to `BootConfig`

### `core/platform-core/src/server/mount-routes.ts`
- Added optional `bootConfig` parameter (5th arg) carrying `standalone`, `auth`, and `slug`
- **Standalone mode** (step 2c): When `standalone` is set:
  - Mounts `internalServiceAuth` middleware on `/trpc/*` and `/api/*` (NOT `/v1/*`)
  - Wires `setTrpcOrgMemberRepo` from container
  - Builds `CoreRouterDeps` from container (billing, settings, profile, page-context, org, fleet)
  - Mounts tRPC endpoint at `/trpc/*` using `createInternalTRPCContext`
  - Mounts `GET /api/products/:slug` endpoint returning `toBrandConfig()`
- **Auth mode** (step 2d): When `auth` is set:
  - Calls `initBetterAuth()` with pool, db, secret, domain config, social providers
  - Runs auth migrations
  - Mounts auth routes at `/api/auth/*`
  - Wires `onUserCreated` callback (signup credits + personal org)

### `core/platform-core/src/server/index.ts`
- Updated `mountRoutes()` call to pass `bootConfig` when `standalone` or `auth` is present

### `core/platform-core/src/trpc/internal-context.ts` (NEW)
- `createInternalTRPCContext(c)` — reads user/tenant from Hono context (set by `internalServiceAuth`) instead of BetterAuth session cookies

### `core/platform-core/src/trpc/index.ts`
- Added re-export of `createInternalTRPCContext`

## Backwards compatibility

- Existing product boot path is unchanged — when `standalone` and `auth` are both omitted, `mountRoutes()` behaves identically to before
- No platform index.ts files were modified
- The 5th argument to `mountRoutes()` is optional with no default behavior change

## Usage

```ts
// Standalone core server — complete, no additional wiring needed
const { app, start, stop } = await bootPlatformServer({
  slug: "core",
  databaseUrl: process.env.DATABASE_URL!,
  secrets,
  features: { fleet: true, crypto: true, stripe: true, gateway: true, hotPool: false },
  standalone: {
    allowedServiceTokens: process.env.CORE_ALLOWED_SERVICE_TOKENS!,
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET!,
    socialProviders: {
      github: { clientId: "...", clientSecret: "..." },
    },
  },
});
await start(3001);
```

## Type check

All errors in changed files are pre-existing (missing `@types/node`, `pg`, `@trpc/server` type declarations in the worktree). Zero new type errors introduced.
