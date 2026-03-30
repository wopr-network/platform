# UI tRPC Client Setup Analysis

## Current Architecture

### Entry Points
The platform-ui-core has **two tRPC client instances**:

1. **`trpc` (React hooks)** — Line 12 in `trpc.tsx`
   - Created via `createTRPCReact<AppRouter>()`
   - Used with `trpc.useQuery()`, `trpc.useMutation()` in React components
   - Configured inside `TRPCProvider` component (lines 81–94)

2. **`trpcVanilla` (vanilla/imperative)** — Lines 31–42 in `trpc.tsx`
   - Created via `createTRPCClient<AppRouter>()`
   - Used for non-React calls: `admin-api.ts`, `tenant-context.tsx`, `changeset-api.ts`
   - No React hooks required

### URL Configuration
- **Base URL**: `PLATFORM_BASE_URL` from `src/lib/api-config.ts`
- **tRPC endpoint**: `${PLATFORM_BASE_URL}/trpc`
- **Resolution logic** (in `api-config.ts`, lines 17–46):
  1. `NEXT_PUBLIC_API_URL` env var (local dev override)
  2. Client-side: derive from `window.location.hostname`
     - `localhost` → `http://localhost:3001`
     - `staging.X.com` → `https://staging.api.X.com`
     - `X.com` → `https://api.X.com`
  3. Server-side: derive from brand config domain
  4. Fallback: `http://localhost:3001`

### HTTP Link Configuration
Both clients use **`httpBatchLink`** with custom fetch function:

**File:** `src/lib/trpc.tsx`

```typescript
// Lines 14–25: Custom fetch wrapper with auth cookies
async function trpcFetchWithAuth(url: RequestInfo | URL, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include" });
  if (res.status === 401) {
    const onLoginPage = typeof window !== "undefined" && window.location.pathname.startsWith("/login");
    if (!onLoginPage) {
      handleUnauthorized();  // Redirects to /login
    }
  }
  return res;
}

// Both clients use this fetch + httpBatchLink:
httpBatchLink({
  url: `${PLATFORM_BASE_URL}/trpc`,
  fetch: trpcFetchWithAuth,
  headers() {
    const tenantId = getActiveTenantId();
    return tenantId ? { "x-tenant-id": tenantId } : {};
  },
})
```

### Header Injection Current State
**Current headers set:**
- `x-tenant-id` — from `getActiveTenantId()` (lines 36–39, 87–90)

**Auth mechanism:**
- Session cookie is sent automatically via `credentials: "include"` in fetch options (line 15)
- No explicit `Authorization` header
- 401 handling redirects to `/login?reason=expired&callbackUrl=...`

### Tenant ID Resolution
**File:** `src/lib/tenant-context.tsx`

- Module-level variable `_activeTenantId` (line 12)
- Set by `TenantProvider` component on mount with `initialTenantId` (line 75)
- Read by `getActiveTenantId()` function (lines 28–30)
- Falls back to `user.id` (personal tenant) if no org is selected (lines 116–122)
- Persisted via HttpOnly cookie in `/api/tenant` route (lines 33–44)

### Session/User Resolution
**File:** `src/lib/auth-client.ts`

- Uses `better-auth` for authentication
- `useSession()` hook returns `{ data: session, isPending: boolean }`
- Session object contains `user: { id, name, image, ... }`
- No explicit user ID in headers currently

## Files That Need Modification

### 1. **`src/lib/trpc.tsx`** (Primary change)
Current header function (lines 36–39, 87–90):
```typescript
headers() {
  const tenantId = getActiveTenantId();
  return tenantId ? { "x-tenant-id": tenantId } : {};
}
```

**What needs to change:**
- Add `CORE_SERVICE_TOKEN` to headers (service-to-service auth)
- Add `X-User-Id` header (from session)
- Keep existing `x-tenant-id` header

**Challenge:** The `headers()` function runs in both browser and server contexts:
- **Browser context**: Can't directly access session (need to use `useSession()` hook)
- **Server context**: Need to extract user ID from server session

**Solution approach:**
- For `trpc` (React): Wrap in a component that can use `useSession()` hook
- For `trpcVanilla` (vanilla): Create server-side function to resolve user ID from session (via middleware context or explicit session lookup)

### 2. **`src/lib/api-config.ts`** (New)
**Add:**
```typescript
export const CORE_SERVICE_TOKEN = process.env.CORE_SERVICE_TOKEN ?? ""; // Will be set in deployment
```

### 3. **`src/lib/tenant-context.tsx`** (Potentially)
**Consider:** If user ID needs to be available without React hooks, add module-level variable similar to `_activeTenantId`:
```typescript
let _activeUserId = "";

export function getActiveUserId(): string {
  return _activeUserId;
}
```

Set in `TenantProvider.useEffect` when session loads (after line 96).

### 4. **`src/app/layout.tsx` or middleware** (Integration point)
Ensure `CORE_SERVICE_TOKEN` is set in environment before TRPCProvider renders.

## Design Decisions

### Option A: Separate Server-Side tRPC Client (RECOMMENDED)
Create a **second tRPC client for server-side calls** that:
- Uses `httpBatchLink` with explicit service token in `Authorization` header
- Resolves user ID from server session context
- Is imported only by server components and server utilities

**Pros:**
- Clean separation of concerns
- Server calls always have service token + user context
- Easier to test and maintain

**Cons:**
- Two client instances to manage

### Option B: Dynamic Headers Based on Context
Make the `headers()` function smart enough to:
- Detect if running on server or client
- On server: extract user ID from middleware context
- On client: skip user ID if session not yet loaded
- Always include service token if available

**Pros:**
- Single client instance
- Works for both contexts

**Cons:**
- Headers function becomes complex
- Risk of undefined user ID on initial render

## Implementation Order

1. **Add `CORE_SERVICE_TOKEN` to `api-config.ts`**
2. **Add module-level `_activeUserId` to `tenant-context.tsx`**
3. **Update `TenantProvider` to set `_activeUserId` when session loads**
4. **Update `trpc.tsx` headers to include service token + user ID**
5. **Test with core service integration**

## Testing Points

- Verify service token is sent on all tRPC calls
- Verify user ID is included in headers
- Verify tenant ID still works correctly
- Verify 401 handling still redirects to login
- Verify browser and server contexts both work
- Verify headers are only sent to core service endpoints (not third-party APIs)

## Integration Notes

**Where core service token comes from:**
- Injected via environment variable `CORE_SERVICE_TOKEN`
- Must be set in deployment (e.g., Docker env, GitHub secret, etc.)

**Core service expects headers:**
- `Authorization: Bearer <CORE_SERVICE_TOKEN>` (or custom header name TBD)
- `X-Tenant-Id: <tenant-id>`
- `X-User-Id: <user-id>`

**Backward compatibility:**
- Existing `x-tenant-id` header stays as-is
- Session cookie auth remains (for legacy endpoints)
- Service token is additive (doesn't break existing calls)
