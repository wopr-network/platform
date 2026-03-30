# Audit: NemoClaw Chat Routes for Core Extraction

**Date:** 2026-03-30
**Status:** Complete
**Scope:** Chat routes, provision webhook, and comparative analysis across platforms

---

## Executive Summary

NemoClaw's chat implementation is **tightly coupled to managed fleet operations** (instance resolution, profile store, gateway keys). WOPR's chat is **abstracted via a pluggable backend interface** (IChatBackend). Both are functionally similar at the HTTP layer but differ fundamentally in architecture and product specificity.

**Recommendation:** Move **core SSE streaming infrastructure** to platform-core, but keep **chat backend logic product-specific**.

---

## File Analysis

### 1. NemoClaw: `routes/chat.ts` (304 lines)

#### What it does:
- **SSE stream endpoint** (`GET /chat/stream`) — long-lived connection per session
- **Send message endpoint** (`POST /chat`) — user message → load history → call metered gateway → stream response → persist to DB
- **History endpoint** (`GET /chat/history`) — fetch persisted messages

#### Dependencies:
```typescript
pool: pg.Pool                    // Direct DB access
profileStore: IProfileStore      // Resolve container URLs + gateway keys
productConfig: ProductConfig     // Fleet config (containerPort, defaults)
logger                           // from platform-core
```

#### Product-Specific vs Generic:

| Aspect | Code | Product-Specific? |
|--------|------|-------------------|
| SSE streaming | Lines 52-176 | ✅ **Generic** — standard HTTP/SSE |
| Session registry | Map<sessionId, SessionWriter> | ✅ **Generic** — can extract |
| Auth (BetterAuth) | Lines 57-66 | ⚠️ **Mixed** — auth method is generic, resolveUser pattern is product-specific |
| Instance resolution | Lines 71-87 | ❌ **Product-specific** — uses profileStore + containerPort + fleet config |
| Message persistence | Lines 92-118 | ❌ **Product-specific** — stores to `chat_messages` table; schema is NemoClaw-only |
| Gateway inference call | Lines 226-289 | ❌ **Product-specific** — calls metered gateway at `http://localhost:${port}/v1/chat/completions`; hardcoded DeepSeek model |
| Inference response relay | Lines 256-289 | ✅ **Generic** — standard OpenAI SSE chunk parsing |

#### How Hard to Move?
- **Streaming + session registry:** Easy, extract to core (reusable)
- **Instance resolution:** Medium, needs abstraction (inject `resolveChatTarget()` function)
- **Message persistence:** Hard, schema differs per product (keep product-specific)
- **Inference call:** Medium, hardcoded model + gateway URL (inject ChatBackend interface)

---

### 2. NemoClaw: `routes/provision-webhook.ts` (305 lines)

#### What it does:
- **POST /create** — provision managed container (Docker, node placement, proxy route, gateway key)
- **POST /destroy** — tear down container (deprovision, revoke key, remove proxy route)
- **PUT /budget** — update container spending limit

#### Dependencies:
```typescript
creditLedger: ILedger | null     // Credit gate for provisioning
profileStore: IProfileStore      // Container tracking
productConfig: ProductConfig     // Fleet limits, container port, image
nodeRegistry: NodeRegistry       // Multi-node Docker host management
placementStrategy: PlacementStrategy  // Container placement algorithm
serviceKeyRepo: IServiceKeyRepository  // Gateway service keys
provision-client                 // @wopr-network/provision-client (external)
```

#### Product-Specific vs Generic:

| Aspect | Code | Product-Specific? |
|--------|------|-------------------|
| Timing-safe secret validation | Lines 54-61 | ✅ **Generic** |
| Credit gate | Lines 96-102 | ❌ **Product-specific** — only NemoClaw has billing |
| Instance limit gate | Lines 105-110 | ❌ **Product-specific** — configurable per product |
| Node selection + placement | Lines 113-119 | ✅ **Generic** — reusable algorithm |
| Container lifecycle (Docker) | Lines 122-164 | ✅ **Generic** — reusable via FleetManager |
| Proxy route registration | Lines 143-146 | ✅ **Generic** — reusable pattern |
| Health check wait loop | Lines 298-304 | ✅ **Generic** — standard backoff pattern |
| Provision-client call | Lines 168-180 | ⚠️ **Mixed** — interface is generic, but parameters (tenantId, agents, budgetCents) are product-specific |
| Deprovision call | Line 229 | ⚠️ **Mixed** — same as above |

#### How Hard to Move?
- **Node selection, Docker lifecycle, health checks:** Easy, already abstracted
- **Credit + instance limit gates:** Medium, wrap in optional feature flags
- **Provision-client integration:** Hard, depends on instance schema and product features

---

### 3. WOPR: `api/routes/chat.ts` (240 lines)

#### What it does:
- **GET /stream?sessionId** — SSE stream, registers session ownership atomically
- **POST /** — send message to backend, returns streamId immediately (fire-and-forget)
- **No history endpoint** — backend responsibility

#### Dependencies:
```typescript
IChatBackend                     // Pluggable interface: process(sessionId, message, emit)
ChatStreamRegistry               // Session + stream ownership + multi-writer dispatch
```

#### Product-Specific vs Generic:

| Aspect | Code | Product-Specific? |
|--------|------|-------------------|
| SSE streaming | Lines 53-119 | ✅ **Generic** — TransformStream-based, cleaner than NemoClaw |
| Session ownership | Lines 64-67, 146-149 | ✅ **Generic** — atomic claim/verify pattern |
| Fire-and-forget dispatch | Lines 170-174 | ✅ **Generic** — background processing |
| ChatBackend abstraction | Lines 45, 170 | ✅ **Generic** — pluggable via DI |
| Auth check | Lines 54-56, 127-130 | ✅ **Generic** — simple `getUser()` resolver |

#### How Hard to Move?
- **All of it:** Already generic by design. Just extract to platform-core.

---

## Comparative Table

| Feature | NemoClaw | WOPR | Direction |
|---------|----------|------|-----------|
| **Stream implementation** | Hono `streamSSE()` | TransformStream | WOPR cleaner, consider migrating |
| **Session registry** | Map<sessionId, SessionWriter> | ChatStreamRegistry class | WOPR better (encapsulated) |
| **Chat backend** | Direct gateway call, hardcoded model | Pluggable IChatBackend | WOPR pattern is reusable |
| **Message persistence** | Direct DB insert in route | Backend responsibility | WOPR cleaner separation |
| **Auth pattern** | resolveUser() helper | getUser() helper | Both similar, platform-core ready |
| **Fire-and-forget** | Synchronous relay loop | True background task | WOPR better UX |
| **Error handling** | Try/catch per operation | Unified emit() error | WOPR more robust |

---

## Extraction Plan

### Phase 1: Core SSE Infrastructure (Low Risk, High Reuse)

**Move to `@wopr-network/platform-core/chat/`:**

1. `ChatStreamRegistry` — session ownership + multi-writer dispatch
   - Generic, no product dependencies
   - Replace NemoClaw's `sessions` Map with this

2. `StreamSSE` utility — wrapper around TransformStream or Hono streamSSE
   - Handles heartbeat, connection cleanup, error propagation
   - Use in both platforms

3. `SSEWriter` interface — write(event, data) + close()
   - Already in WOPR, standardize signature

**Files to create:**
- `platform-core/src/chat/stream-registry.ts`
- `platform-core/src/chat/sse-writer.ts`
- `platform-core/src/chat/types.ts` (ChatEvent, ChatStreamRegistry)

**Cost:** ~200 lines, zero product dependencies

---

### Phase 2: Chat Backend Abstraction (Medium Risk, High Flexibility)

**Move to `@wopr-network/platform-core/chat/`:**

1. `IChatBackend` interface — `process(sessionId, message, emit)`
   - Already in WOPR, generalize for platform-core
   - Allow product implementations to override

2. `createChatRoutes(deps: { backend: IChatBackend })` — returns Hono router
   - Same as WOPR's pattern
   - Product-specific backends (GatewayInferenceChatBackend, LocalModelChatBackend, etc.)

**Product-specific implementations remain in:**
- `nemoclaw-platform/src/chat/gateway-inference-backend.ts` (call metered gateway + persist)
- `wopr-platform/src/chat/wopr-chat-backend.ts` (existing logic)

**Files to create:**
- `platform-core/src/chat/backend.ts` (IChatBackend interface)
- `platform-core/src/chat/routes.ts` (createChatRoutes)

**Cost:** ~100 lines in core, ~80 lines per product backend

---

### Phase 3: Provision Webhook Abstraction (Higher Risk, Lower Reuse)

**Decision:** Keep in products for now.

**Rationale:**
- Heavily coupled to fleet-specific features (nodeRegistry, placementStrategy)
- Credit gating is NemoClaw-only (others may not have billing)
- provision-client parameters vary by product instance schema
- Only NemoClaw uses it currently; no other platform has an equivalent

**Future consideration:** If WOPR or Paperclip add managed instances, extract common infrastructure (Docker lifecycle, health checks, proxy routing) into core `FleetManager` interface.

---

## Dependencies to Wire

### platform-core additions:

```typescript
// src/chat/types.ts
export interface ChatEvent {
  type: 'connected' | 'text' | 'done' | 'error' | 'thinking'
  data?: string
  delta?: string
  message?: string
}

// src/chat/stream-registry.ts
export class ChatStreamRegistry {
  register(sessionId: string, writer: SSEWriter): string // streamId
  get(streamId: string): SSEWriter | undefined
  listBySession(sessionId: string): string[]
  claimOrVerifyOwner(sessionId: string, userId: string): boolean
  clearOwner(sessionId: string): void
  remove(streamId: string): void
}

// src/chat/backend.ts
export interface IChatBackend {
  process(
    sessionId: string,
    message: string,
    emit: (event: ChatEvent) => void
  ): Promise<void>
}

// src/chat/routes.ts
export function createChatRoutes(deps: {
  backend: IChatBackend
}): Hono { ... }
```

### NemoClaw changes:

```typescript
// New: src/chat/gateway-backend.ts
export class GatewayInferenceChatBackend implements IChatBackend {
  constructor(
    private pool: pg.Pool,
    private profileStore: IProfileStore,
    private productConfig: ProductConfig,
    private gatewayUrl: string,
    private model: string
  ) {}

  async process(sessionId: string, message: string, emit: ChatEvent => void): Promise<void> {
    // Current POST /chat logic, refactored
    const instanceId = sessionId // or derived from context
    const history = await this.loadHistory(instanceId)
    const res = await fetch(this.gatewayUrl, { /* ... */ })
    // ... relay response via emit()
    await this.saveMessage(instanceId, /* ... */)
  }
}

// Updated: src/index.ts
import { createChatRoutes } from "@wopr-network/platform-core/chat/routes"
const chatBackend = new GatewayInferenceChatBackend(
  container.pool,
  container.fleet.profileStore,
  container.productConfig,
  `http://localhost:${port}/v1/chat/completions`,
  "deepseek/deepseek-v3.2"
)
platform.app.route("/api/chat", createChatRoutes({ backend: chatBackend }))
```

---

## Gotchas & Risks

1. **SSE connection cleanup:** NemoClaw's heartbeat interval can leak if request aborts — WOPR's AbortSignal pattern is safer. Ensure cleanup happens even on errors.

2. **Message persistence schema:** NemoClaw's `chat_messages` table (instance_id, tenant_id, user_id, role, content) is product-specific. GatewayInferenceChatBackend must handle persistence, not core routes.

3. **Session ID format:** NemoClaw generates UUID if missing, WOPR requires it. Standardize or make optional in core.

4. **Concurrent message ordering:** Current NemoClaw implementation doesn't handle concurrent POST / calls to the same sessionId — messages might interleave. WOPR's fire-and-forget + queue pattern is better.

5. **Auth context forwarding:** WOPR's `INTERNAL_USER_ID_HEADER` pattern is clever but adds complexity. NemoClaw's simpler `resolveUser()` from context works if deployed in same app. Consider both patterns in core.

---

## Files to Read for Details

- **NemoClaw chat:** `/platforms/nemoclaw-platform/src/routes/chat.ts` (304 lines)
- **NemoClaw provision:** `/platforms/nemoclaw-platform/src/routes/provision-webhook.ts` (305 lines)
- **NemoClaw boot:** `/platforms/nemoclaw-platform/src/index.ts` (258 lines)
- **WOPR chat:** `/platforms/wopr-platform/src/api/routes/chat.ts` (240 lines)
- **WOPR chat backend:** `/platforms/wopr-platform/src/chat/chat-backend.ts` (TBD)
- **WOPR chat stream registry:** `/platforms/wopr-platform/src/chat/chat-stream-registry.ts` (TBD)

---

## Recommendation

**Extract in two phases:**

1. **Immediate (Phase 1 + 2):** Move SSE streaming infrastructure + chat backend interface to platform-core. Low risk, high reuse. Enables both platforms to use unified core logic.

2. **Defer (Phase 3):** Keep provision webhook in products. Revisit if WOPR adds managed instances.

**Priority order:**
1. ✅ Extract `ChatStreamRegistry` + `SSEWriter` interface
2. ✅ Extract `IChatBackend` + `createChatRoutes()`
3. ✅ Create `GatewayInferenceChatBackend` in NemoClaw
4. ❌ **Don't** move provision webhook (product-specific)
5. ⏰ **Later:** Consider WOPR backend implementation if needed

