# DB-as-Channel Architecture — Handoff

**Status:** Design complete, not yet implemented.
**Authors:** tsavo + Claude (session 2026-04-08)
**Baseline commit:** `54ad2f3` (composite IFleet refactor landed)

---

## TL;DR

Replace `NodeCommandBus` (in-memory `pending` Map + WebSockets) and all leader-only-vs-any-replica routing with **one Postgres-backed operation queue**. The DB table is the channel. Workers are symmetric: every worker (the core's own handler loop, every node agent) connects to Postgres, `LISTEN`s for work, claims rows with `SELECT … FOR UPDATE SKIP LOCKED`, executes, writes the result. Core replicas stop being "leader" and "non-leader" — they're just request acceptors AND queue workers, and Postgres handles the concurrency.

**Promises and `async/await` are the user-facing abstraction.** `fleet.create(profile)` stays `async`, still returns `Promise<Instance>`, still throws on failure. The fact that its Promise is resolved by a LISTEN handler reacting to a NOTIFY from some other process is an **implementation detail**. Callers never see a queue. There is no polling, no 202 Accepted, no operation ID API. Just functions that `await` other functions, same as today.

**Every feature we have today is preserved.** The architecture change is entirely internal:
- `NodeCommandBus` deleted
- `NodeConnectionManager` deleted (the WebSocket route too)
- `fleet-resolver`, `tenant-proxy` subdomain code — already deleted (prior session)
- Leader election stops being load-bearing for correctness (still useful for *scheduling* singleton cron-like work, see §9)
- The in-memory pending map in NodeCommandBus is replaced with a per-request Promise registry that is **not** a source of truth

The architecture gets one less subsystem, not more.

---

## 1. The unlock

Two observations that collapse into one:

**(a)** `NodeCommandBus.pending` is already a queue. It's a `Map<id, PendingCommand>` with a `randomUUID()` correlation ID, a timeout, and a Promise that gets resolved when a correlation-matched response arrives. That's a queue in every semantic sense — it's just stored in process memory, which means it's tied to one replica and lost on restart.

**(b)** The "where does this operation execute" question has two answers today and neither is the right shape:
- *Operations that touch an agent:* WebSocket + in-memory bus. Hard requirement: the replica serving the user request must also be the one holding the agent's WebSocket. In a 2-replica-behind-LB setup, this is split-brain waiting to happen.
- *Operations that need leader-only execution (pool replenishment, billing scheduler):* leader election gates a setInterval. Works, but adds a whole subsystem (leader election, promote/demote, isLeader checks).

**Collapse:** put all work-in-flight in a durable table. Every "executor" (the core's own in-process handler loop, every node agent) is a worker that connects to Postgres, `LISTEN`s for new work, claims rows, executes, writes the result, NOTIFYs completion. There are no peer-to-peer relationships between replicas. There is no "leader" concept for correctness — just for *singleton scheduling* (§9).

The language-level abstraction for "wait for a non-blocking thing to finish" is `Promise` + `await`. The JavaScript event loop already gives us "the HTTP request is parked without blocking a thread." We don't need to invent operation IDs, SSE, long-poll, or status URLs. A single `async function` whose Promise resolves when the worker writes the result row is all we need.

---

## 2. Public contract: nothing changes at the API surface

```ts
// API handler, unchanged
async function createInstance(input, ctx) {
  await assertOrgAdminOrOwner(...);
  return await fleet.create({
    tenantId: input.orgId ?? ctx.tenantId,
    name: input.name,
    ...
  });
}

// InstanceService / Fleet, unchanged signature
async create(profile): Promise<Instance> {
  // ... same validation, same logic ...
  // Internally: enqueue, park on LISTEN, resolve when worker writes result
  // Externally: looks identical to today
}
```

Callers never touch the queue. Tests that mock `fleet.create()` continue to work — the mock returns a Promise, same as before. The implementation strategy is invisible.

**What changes inside `fleet.create`** is covered in §5 and §7. The shape is:
1. Insert a `pending_operations` row with the request payload
2. NOTIFY the worker channel
3. Park on a per-request in-memory Promise (see §6)
4. When a LISTEN handler receives the completion NOTIFY for this row, resolve the Promise with the result or reject with the error
5. Return the Instance (or throw)

---

## 3. The schema

```sql
CREATE TABLE pending_operations (
  id              uuid PRIMARY KEY,
  -- Operation type. Determines which handler runs it.
  -- Examples: 'instance.create', 'instance.remove', 'bot.start', 'pool.warm'
  type            text NOT NULL,
  -- Request payload (the arguments the handler needs)
  payload         jsonb NOT NULL,
  -- Which worker pool should drain this. 'core' = in-process core handler,
  -- or a node ID like 'node-abc' = only that node's agent. NULL = any worker.
  target          text,
  -- Status state machine: pending → processing → succeeded | failed
  status          text NOT NULL DEFAULT 'pending',
  -- Result payload (on succeeded) or error detail (on failed)
  result          jsonb,
  error_message   text,
  -- Which worker claimed this row. Used by the janitor to reset
  -- rows whose worker disappeared mid-processing (see §11).
  claimed_by      text,
  claimed_at      timestamptz,
  -- Audit timestamps
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  -- Idempotency: workers can look up an existing row before inserting
  -- to avoid duplicate work on retry. Format: caller-supplied.
  idempotency_key text,
  -- Max age in processing before janitor resets to pending (seconds)
  timeout_s       integer NOT NULL DEFAULT 300
);

-- Fast claim path: find pending rows filtered by target
CREATE INDEX idx_pending_ops_claim
  ON pending_operations (target, enqueued_at)
  WHERE status = 'pending';

-- Janitor path: find stuck processing rows
CREATE INDEX idx_pending_ops_stuck
  ON pending_operations (claimed_at)
  WHERE status = 'processing';

-- Idempotency lookup
CREATE UNIQUE INDEX idx_pending_ops_idempotency
  ON pending_operations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### Status state machine

```
             enqueue
    ┌──────────────────────→ pending
    │                           │
    │                           │ claim (SELECT FOR UPDATE SKIP LOCKED)
    │                           ▼
    │ janitor reset         processing
    │   (stale >timeout)        │
    └───────────────────────────┤
                                │
                                ├──→ succeeded (result written)
                                │
                                └──→ failed (error_message written)
```

Terminal statuses (`succeeded`, `failed`) are never re-processed. A retry enqueues a new row (or re-uses an idempotency-key hit, see §11).

### Security model

Two Postgres roles:
- `core_role` — full SELECT/INSERT/UPDATE on `pending_operations`. Used by core replicas.
- `agent_role` — SELECT/UPDATE only, constrained by RLS:
  ```sql
  CREATE POLICY agent_own_node ON pending_operations
    FOR ALL TO agent_role
    USING (target = current_setting('agent.node_id', true));
  ```
  The agent sets the `agent.node_id` session variable on connect. It can only see and update rows targeted at its own node.

Per-node DB credentials are minted at agent registration time (see §8). They rotate with the existing per-node secret rotation schedule. Agents reach Postgres over the existing `platform-overlay` swarm network (no new network exposure).

---

## 4. Components

### 4.1 `OperationQueue` — the shared client

Used by core replicas and by node agents. Single class, two consumers.

```ts
// core/platform-core/src/queue/operation-queue.ts

export interface OperationRequest<T = unknown> {
  type: string;
  payload: unknown;
  target?: string;             // 'core' | node id | null (any worker)
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface OperationResult<T> {
  id: string;
  status: "succeeded" | "failed";
  result?: T;
  error?: string;
}

export interface IOperationQueue {
  /**
   * Enqueue an operation and await its completion. Resolves with the
   * worker's return value; rejects with the worker's error. The Promise
   * is the operation handle — no other API surface needed.
   */
  execute<T>(req: OperationRequest): Promise<T>;

  /** Claim one pending row targeted at `target`. Called by workers. */
  claim(target: string): Promise<PendingOperationRow | null>;

  /** Mark a claimed row as complete with a result. Called by workers. */
  complete<T>(id: string, result: T): Promise<void>;

  /** Mark a claimed row as failed with an error. Called by workers. */
  fail(id: string, error: Error): Promise<void>;

  /** Start LISTEN'ing for completion events (only needed by queues that call execute). */
  startListener(): Promise<void>;

  stop(): Promise<void>;
}
```

### 4.2 `QueueWorker` — the drain loop

Same implementation on core and agent. Subclasses supply a handler map.

```ts
// core/platform-core/src/queue/queue-worker.ts

export abstract class QueueWorker {
  constructor(
    protected readonly queue: IOperationQueue,
    protected readonly target: string,                // 'core' or a node id
    protected readonly handlers: Map<string, OperationHandler>,
  ) {}

  async start(): Promise<void> {
    await this.queue.startListener();
    await this.drainLoop();
  }

  private async drainLoop(): Promise<void> {
    while (this.running) {
      const row = await this.queue.claim(this.target);
      if (!row) {
        // No work. Park on a completion-channel LISTEN + max wait interval.
        await this.waitForNotifyOrTimeout(30_000);
        continue;
      }
      const handler = this.handlers.get(row.type);
      if (!handler) {
        await this.queue.fail(row.id, new Error(`No handler for ${row.type}`));
        continue;
      }
      try {
        const result = await handler(row.payload);
        await this.queue.complete(row.id, result);
      } catch (err) {
        await this.queue.fail(row.id, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
```

### 4.3 Per-request Promise registry inside `execute()`

This is the ONLY in-memory state, and it's per-request, not per-system.

```ts
class OperationQueue implements IOperationQueue {
  // Per-REQUEST (not per-system). Each entry is a Promise this replica
  // is currently waiting on. Losing the entry loses the wait, not the work.
  private readonly awaiting = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  async execute<T>(req: OperationRequest): Promise<T> {
    // 1. Idempotency check
    if (req.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(req.idempotencyKey);
      if (existing?.status === "succeeded") return existing.result as T;
      if (existing?.status === "failed") throw new Error(existing.error);
      // If it's pending/processing, fall through and await via the registry
    }

    // 2. Enqueue
    const id = randomUUID();
    await this.db.insert(pendingOperations).values({
      id,
      type: req.type,
      payload: req.payload,
      target: req.target ?? null,
      idempotencyKey: req.idempotencyKey,
      timeoutS: Math.ceil((req.timeoutMs ?? 300_000) / 1000),
    });

    // 3. Wake any worker LISTEN'ing for work
    await this.db.execute(sql`NOTIFY op_enqueued, ${id}`);

    // 4. Register a Promise and park on it. The shared LISTEN handler
    //    (started by startListener) resolves it when the worker completes.
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.awaiting.delete(id);
        reject(new Error(`Operation ${req.type} (${id}) timed out`));
      }, req.timeoutMs ?? 300_000);
      this.awaiting.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
    });
  }

  // Called by the LISTEN handler (started once per replica in startListener)
  private handleCompletion(id: string): void {
    const pending = this.awaiting.get(id);
    if (!pending) return;                      // we're not the waiter, fine
    clearTimeout(pending.timer);
    this.awaiting.delete(id);
    // Read the row (NOTIFY payload is just the id; result is in the row)
    this.db.query.pendingOperations
      .findFirst({ where: eq(pendingOperations.id, id) })
      .then((row) => {
        if (!row) return pending.reject(new Error(`Op ${id} vanished`));
        if (row.status === "succeeded") pending.resolve(row.result);
        else if (row.status === "failed") pending.reject(new Error(row.errorMessage ?? "failed"));
        else pending.reject(new Error(`Op ${id} completed in unexpected state: ${row.status}`));
      })
      .catch(pending.reject);
  }
}
```

**Why this in-memory Map is fine:** each entry is a Promise tied to a single HTTP request. If the replica dies, the HTTP request drops too — there's no consistency issue. The DB row keeps processing; the client retries against a (healthy) replica; the new replica enqueues a new row (or idempotency-hits the old one and awaits its completion). The Map is a *connection detail*, not a source of truth.

This is the critical difference from `NodeCommandBus.pending`: that Map was the source of truth for "what commands are in flight." This Map is "what Promises are currently awaiting a DB-durable operation." The work survives; only the waiter is ephemeral.

---

## 5. How `fleet.create` changes (tiny)

**Before:**
```ts
async create(profile): Promise<Instance> {
  // ...validation...
  // Saga tracked here, rollback here, calls commandBus.send directly
  await this.commandBus.send(this.nodeId, { type: 'bot.update', payload: {...} });
  // ...
  return this.buildInstance(profile);
}
```

**After:**
```ts
async create(profile): Promise<Instance> {
  // ...validation... (same as today)
  // Instead of calling the bus directly, enqueue a queue op targeted
  // at the core worker pool. The handler runs the same saga.
  const result = await this.queue.execute<InstanceCreateResult>({
    type: "instance.create",
    payload: { profile, ... },
    target: "core",  // handled by the core worker loop
    idempotencyKey: profile.id,  // double-click safe
  });
  return this.buildInstance(result.profile);
}
```

The handler registered for `instance.create` on the core worker is where the existing saga lives — it's literally today's `InstanceService.create` body, unchanged. The queue is just the transport between the API handler's `await` and the saga's execution.

**Same for agent operations.** What's `bot.start` today:
```ts
// today: commandBus.send goes via WebSocket to the agent
await commandBus.send(nodeId, { type: 'bot.start', payload: {...} });
```
becomes:
```ts
// tomorrow: queue.execute targets the node's worker; agent's worker picks it up
await this.queue.execute({
  type: 'bot.start',
  payload: { image, env, ... },
  target: nodeId,
});
```

Both feel like RPC calls that return Promises. The RPC happens to go through `pending_operations`. Callers don't care.

---

## 6. Replica topology

```
┌───────────┐  ┌───────────┐
│  core-1   │  │  core-2   │
│           │  │           │
│  API      │  │  API      │ ← request acceptors (either replica)
│    │      │  │    │      │
│    │ enq  │  │    │ enq  │
│    ▼      │  │    ▼      │
│  execute  │  │  execute  │   each holds its own Map<id, Promise>
│   ↕ LISTEN│  │   ↕ LISTEN│   (per-request, not state)
│           │  │           │
│  worker   │  │  worker   │ ← each replica also runs a worker
│  loop     │  │  loop     │   draining target='core' rows
└─────┬─────┘  └─────┬─────┘
      │              │
      └──────┬───────┘
             ▼
      ┌──────────────┐
      │  Postgres    │
      │              │
      │  pending_ops │ ← durable, single source of truth
      │              │
      └──────────────┘
             ▲
             │ per-node connection with agent_role + RLS
             │
     ┌───────┴────────┐
     │                │
┌────┴─────┐    ┌─────┴────┐
│ agent-1  │    │ agent-2  │ ← each agent is a worker
│          │    │          │   draining target=<its nodeId> rows
│  worker  │    │  worker  │
│  loop    │    │  loop    │
└──────────┘    └──────────┘
```

### Key properties
- **Both core replicas accept API requests.** LB roulette is fine. Requests write to the queue; the `execute()` call parks on a Promise until the worker writes the result.
- **Both core replicas run the `core` worker loop.** `SELECT … FOR UPDATE SKIP LOCKED` ensures exactly one of them claims each row. The other just finds no work on that row and moves on.
- **Agent is symmetric.** Runs the same worker loop, filtered to `target = <its_own_node_id>`. No WebSocket. Connects to Postgres on the overlay network.
- **No leader election required for correctness.** (§9 addresses singleton scheduling.)

### What about the `execute()` waiter cross-replica?

Scenario: request hits core-1. core-1 enqueues and parks on its in-memory Promise. The worker that claims the row happens to be core-2 (or an agent). core-2 writes the result and NOTIFYs. Does core-1 wake up?

**Yes.** LISTEN/NOTIFY is cross-connection — every replica that's doing `LISTEN op_complete` sees every NOTIFY. core-1's LISTEN handler receives the NOTIFY with the row id, looks up `awaiting.get(id)`, finds its pending Promise, reads the result row, resolves. Core-2 also receives the same NOTIFY but `awaiting.get(id)` returns undefined — it's not waiting on that one — so it no-ops.

**Edge case: NOTIFY is lost.** Postgres NOTIFY is fire-and-forget; if the LISTEN connection is in the middle of reconnecting, the NOTIFY can be dropped. Mitigation: every `execute()` parks on both the NOTIFY channel AND a polling timer (e.g. every 2 seconds, re-query the row's status). Whichever wakes first resolves the Promise. Lowers the best-case latency by ~1ms but keeps the worst case bounded.

---

## 7. Operation types we'll register

### Core-handled (`target = 'core'`)
- `instance.create` — what's today `InstanceService.create` (credit check, fleet.create, provision, billing)
- `instance.destroy` — what's today `InstanceService.destroy` (deprovision, revoke, remove, stop billing)
- `instance.update_budget` — `InstanceService.updateBudget`
- `pool.tick` — scheduled (§9). Handler runs what's today `Fleet.tick()` (cleanup + replenish). Just enqueues per-node `pool.list`, `pool.cleanup`, `pool.warm` rows.

### Agent-handled (`target = '<node id>'`)
Everything `NodeCommandBus` used to send:
- `bot.start`, `bot.stop`, `bot.restart`, `bot.update`, `bot.remove`, `bot.logs`, `bot.inspect`
- `bot.export`, `bot.import`
- `backup.upload`, `backup.download`, `backup.run-nightly`, `backup.run-hot`
- `pool.warm`, `pool.cleanup`, `pool.list`

The agent's worker has the same dispatch switch today's `node-agent/index.ts#dispatch` has; it just reads the row from the queue instead of receiving a WebSocket message.

---

## 8. Agent changes

### 8.1 Dependencies
- Add `postgres` (postgres-js) package to the node-agent. It's already a transitive dep of Drizzle, so no new top-level dep.
- Agent's Dockerfile needs Postgres client libraries (already have them — they're in the base image for `psql` operational use).

### 8.2 Registration flow extension
When an agent registers (POST `/internal/nodes/register-token`), the core server:
1. Creates the `nodes` row with the assigned node ID (as today)
2. **Mints a per-node DB credential:**
   ```sql
   CREATE ROLE node_<sanitized-id> LOGIN PASSWORD <random>;
   GRANT agent_role TO node_<sanitized-id>;
   ```
3. Returns `{ nodeId, nodeSecret, dbUrl: "postgresql://node_X:password@postgres:5432/platform?application_name=agent-X" }` in the registration response
4. Agent persists `dbUrl` alongside `nodeSecret` in `/etc/wopr/credentials.json`

### 8.3 Worker loop on the agent

```ts
// core/platform-core/src/node-agent/worker.ts (new)
class AgentWorker extends QueueWorker {
  constructor(db: Pg, nodeId: string, dockerManager: DockerManager, config: NodeAgentConfig) {
    const handlers = new Map<string, OperationHandler>([
      ["bot.start", (p) => dockerManager.startBot(p as never)],
      ["bot.stop", (p) => dockerManager.stopBot((p as { name: string }).name)],
      ["pool.warm", (p) => dockerManager.createWarmContainer(p as never)],
      // ... every case that's in today's dispatch() switch
    ]);
    // This queue instance has execute() as a no-op since the agent
    // only drains; it doesn't enqueue to itself.
    const queue = new OperationQueue(db);
    super(queue, nodeId, handlers);
  }
}

// In node-agent/index.ts boot:
const db = postgres(config.dbUrl);
await db.unsafe(`SET agent.node_id = '${nodeId}'`);
const worker = new AgentWorker(db, nodeId, dockerManager, config);
await worker.start();
```

### 8.4 What goes away on the agent
- The whole WebSocket client (`ws` connection logic, reconnect loop, heartbeat sender-over-WS)
- The `commandSchema` dispatch switch — becomes a plain handler map
- The backup/heartbeat WebSocket messages — heartbeats become periodic `UPDATE nodes SET last_heartbeat_at = now() WHERE id = $1`

### 8.5 What the agent keeps
- DockerManager (unchanged)
- BackupManager (unchanged — handlers just call it)
- The handlers are ~10 lines each, mostly delegating to DockerManager

---

## 9. Singleton scheduling (cleanup ticks, billing cron)

`Fleet.tick()` (cleanup + replenish every 60s) and the runtime billing scheduler today rely on leader election: the leader runs a `setInterval`, non-leader doesn't. In the new model, there's no leader — but we still need "run this exactly once every 60s cluster-wide."

**Answer: scheduled rows with deterministic IDs.**

Every 60 seconds, *any* replica can enqueue:
```ts
await queue.execute({
  type: "pool.tick",
  payload: { /* ... */ },
  target: "core",
  idempotencyKey: `pool.tick:${floorToMinute(Date.now())}`,
});
```

The `idempotencyKey` pattern buckets the operation to a minute. The first replica to enqueue wins; other replicas within that minute do an idempotency hit and no-op. Exactly one row per minute, claimed by whichever worker gets there first.

The scheduling itself is a boring local `setInterval` on every replica. The *correctness* comes from the idempotency key, not from electing a scheduler.

**For rarer work** (hourly backup run, daily billing tick), the same pattern works with minute/hour/day buckets.

### Can we delete leader election entirely?
Mostly. The one thing it still gives you is "which replica's logs are interesting for cluster-wide events" — useful for observability but not correctness. Keep it around if you want leader-tagged logs; delete it if you don't care.

---

## 10. What gets deleted (by the end of Phase 3)

Confirmed-dead code after migration:
- `core/platform-core/src/fleet/node-command-bus.ts`
- `core/platform-core/src/fleet/node-connection-manager.ts`
- `core/platform-core/src/fleet/node-connection-registry.ts` (already dead — separate cleanup)
- `core/platform-core/src/fleet/inference-watchdog.ts` (already dormant — separate cleanup)
- `core/platform-core/src/fleet/fleet-notification-listener.ts` (already dormant)
- `core/platform-core/src/node-agent/index.ts` — the WebSocket client path, `handleMessage`, `executeCommand`, `sendResult`, `sendCommand`
- `core/platform-core/src/server/mount-routes.ts` — the entire `/internal/nodes/:id/ws` handler
- Agent `Command`, `CommandResult` types from `node-agent/types.ts` (keep the schemas for validation inside handlers)

Kept and updated:
- `FleetManager` (now just enqueues instead of `commandBus.send`)
- `Fleet` (composite is still valuable for "list all nodes" and placement — even though operations are now DB-routed, `claim target node` still needs a placement decision that picks a node ID)
- `InstanceService` → its methods become worker handlers registered against the queue
- `OperationQueue` and `QueueWorker` are new

---

## 11. Edge cases and their handlers

### 11.1 Worker dies mid-processing
The row sits in `status = 'processing'` with `claimed_by = <dead replica id>`. The janitor (a `pool.tick`-style scheduled op) periodically runs:
```sql
UPDATE pending_operations
SET status = 'pending', claimed_by = NULL, claimed_at = NULL
WHERE status = 'processing'
  AND claimed_at < now() - interval '1 second' * timeout_s;
```
Another worker claims the row on its next tick. **Operations must be idempotent** so replay is safe — most of ours already are (create is idempotent on the instance id, remove is idempotent on missing container, etc.). For the ones that aren't, the handler does a "already done?" check before acting.

### 11.2 NOTIFY dropped
Every `execute()` registers a per-request polling timer (every 2 seconds) that re-queries the row's status. The Promise resolves on whichever wakes first (NOTIFY or poll). Worst-case latency: 2 seconds. Best-case: immediate.

### 11.3 Client disconnects mid-wait
The HTTP connection drops. The `execute()` Promise stays parked — but nothing listens for its resolution, so eventually it hits the per-request timeout and cleans up the Map entry. The row still gets processed by the worker; its result just goes into the void (no waiter). On the next client retry, the idempotency-key lookup finds the completed row and returns the previous result immediately.

### 11.4 Idempotency collisions
Two requests with the same idempotency key arrive on different replicas within ms of each other. Both insert — one succeeds, the other gets a unique constraint violation. The second replica catches it, looks up the existing row, and joins the wait as if it had done the insert itself. First-writer-wins, subsequent-waiters-piggyback.

### 11.5 Payload size limits
Postgres NOTIFY has a ~8KB limit. We only ever NOTIFY the row id (a 36-char UUID). The payload lives in the row, fetched via SELECT. No size concerns for NOTIFY; `pending_operations.payload` is `jsonb` so the row can be large.

### 11.6 Worker overload
Queue depth is directly observable (`SELECT count(*) FROM pending_operations WHERE status = 'pending'`). Add alerting for queue depth > N or oldest-pending-age > T. Scale out by adding more core replicas (they all drain the `core` target). For agent operations, the bottleneck is the agent itself; no scaling lever inside the architecture.

### 11.7 Operation ordering guarantees
None by default. Two operations that need to be sequenced (e.g., create-then-start) must chain via `await` in the caller — the second operation is enqueued only after the first Promise resolves. The queue does not guarantee FIFO processing across operations, only within a single `target`.

---

## 12. Testing strategy

### 12.1 Unit (PGlite)
- Enqueue + claim (single worker)
- Enqueue + claim with two concurrent workers → only one gets the row
- Enqueue + claim + complete → worker's result appears in `result` field
- Enqueue + claim + fail → `error_message` populated, status = `failed`
- Idempotency: enqueue with key → second enqueue with same key short-circuits to the existing row
- Timeout: enqueue with short timeout → expires as `failed` with timeout error
- Janitor: insert stuck processing row → reset picks it up

### 12.2 Integration (real Postgres)
- NOTIFY round-trip: enqueue on connection A, LISTEN on connection B, B receives the notify
- Cross-replica: two OperationQueue instances against the same DB; one enqueues, the other claims, the first's `execute()` Promise resolves
- Agent worker: AgentWorker drains `target=node-1`, doesn't touch `target=core` rows
- RLS: attempt to read/update a row with `target != current node` as `agent_role` → denied

### 12.3 End-to-end (against the running stack)
- Create an instance through the API → worker processes it → Promise resolves → UI receives Instance
- Destroy an instance → agent picks up `bot.remove` → worker completes → Promise resolves
- Kill the replica that's waiting mid-operation → HTTP drops → worker still completes → next retry hits idempotency → immediate success

---

## 13. Migration phases

### Phase 1 — foundation (1 session)
Produces: `pending_operations` table, `OperationQueue` class, `QueueWorker` base class, full unit test suite. **Nothing is migrated yet.** Both WebSocket bus and queue coexist; the queue has no callers.

Files created:
- `core/platform-core/src/db/schema/pending-operations.ts`
- `core/platform-core/drizzle/migrations/NNNN_pending_operations.sql` (+ down migration)
- `core/platform-core/src/queue/operation-queue.ts`
- `core/platform-core/src/queue/queue-worker.ts`
- `core/platform-core/src/queue/__tests__/operation-queue.test.ts`
- `core/platform-core/src/queue/__tests__/queue-worker.test.ts`

No existing files changed. Tests pass. Deploy. Nothing in production behaves differently.

### Phase 2 — core handlers + one agent op (1 session)
Produces:
- Core worker started from `container.ts` boot (every replica runs one)
- Core handler registered for `instance.create` — the handler body is today's `InstanceService.create` verbatim, just moved into a function registered with the queue
- `InstanceService.create` switches from "call internal logic directly" to "enqueue and await via queue.execute"
- Agent registration extended to mint a DB credential
- Agent gains a `postgres` client + `AgentWorker`
- `bot.start` gets the first agent-side handler
- `FleetManager` switches `bot.start` specifically to use `queue.execute({ type: 'bot.start', target: nodeId })` instead of `commandBus.send`

**Both buses live side-by-side.** All other operations still use the WebSocket bus. One operation goes through the queue end-to-end to prove the model.

Deploy. Verify E2E (create an instance → worker processes → Promise resolves → UI gets Instance back, exactly like today).

### Phase 3 — migrate the rest + delete old (1 session)
Produces:
- Every agent-side command moved to a queue handler (`bot.stop`, `bot.restart`, `bot.update`, `bot.remove`, `bot.logs`, `bot.inspect`, `bot.export`, `bot.import`, `backup.*`, `pool.warm`, `pool.cleanup`, `pool.list`)
- Every core-side operation moved to a queue handler (`instance.destroy`, `instance.update_budget`, `pool.tick`)
- `FleetManager` calls `queue.execute(...)` everywhere, `commandBus.send` is gone
- Janitor implemented (scheduled `pool.tick`-style op that resets stuck rows)
- Scheduled ops using idempotency-key bucketing (every replica does the `setInterval`, only one insert wins)
- **Deletions:** NodeCommandBus, NodeConnectionManager, `/internal/nodes/:id/ws` route, agent WebSocket client, the `setCommandBus` setter plumbing, the in-memory pending Map on the old bus (dead now)
- Leader election: either deleted entirely or demoted to "just for log tagging"

Deploy. Verify full test suite + E2E. Celebrate the net deletion (likely -1500 lines).

---

## 14. Open questions to answer during implementation

1. **Janitor interval.** How often should it scan for stuck `processing` rows? Default proposal: every 30 seconds. Each stuck row's `timeout_s` is the deadline; janitor only resets rows past their deadline.
2. **Handler timeout vs. operation timeout.** If `execute()` times out from the caller's perspective but the handler is still running, does the handler get cancelled? Proposal: no — handlers run to completion, their result/error just goes unread. The next retry idempotency-hits the completed row.
3. **Concurrency per agent.** Should an agent claim one row at a time or multiple? Proposal: one at a time initially (matches today's sequential WebSocket handling). Parallelize later if needed.
4. **Agent DB credential rotation.** Today's per-node secret rotates via operator action. Should DB credentials rotate with it? Proposal: yes, tied to the same rotation.
5. **Observability.** Should we add metrics for queue depth, enqueue latency, handler duration, timeout rate? Proposal: yes, as part of Phase 1 foundation.
6. **Migration cutover strategy.** During Phase 2, one operation is dual-routed (queue for new, bus for old). Do we want a feature flag to toggle, or parallel deployment? Proposal: hardcode the switch per operation per commit. Simpler, smaller blast radius.
7. **Single-node backward compat.** If a host runs one core replica + local agent, the agent's DB credential and connection still work — they connect to `postgres:5432` inside the same Docker compose. No issue. But double-check there's no DNS issue for first-boot before the Postgres container is up.

---

## 15. Why this is correct (the one-paragraph summary)

Today, "work in flight" lives in a `Map` in process memory on whichever replica happens to be serving the request. The Map is the source of truth for "is this command still being worked on or did it finish?" That's a denial of the fact that there are two replicas: the Map's contents diverge across replicas, the WebSocket for any given agent lives on only one of them, and any attempt at correctness requires either leader-only-everything (the non-leader does nothing useful) or intricate cross-replica routing (Redis, RPC, etc.). After this refactor, work in flight lives in `pending_operations` — one row per operation, one truth. The Map becomes a per-request Promise registry that's only used to resolve the `await` in the current HTTP request; losing the Map loses the wait, not the work. Every worker (core or agent) is a Postgres client running `LISTEN + SELECT FOR UPDATE SKIP LOCKED + UPDATE`. `fleet.create(profile)` stays `async`, stays `Promise<Instance>`, and nothing in the caller layer has any reason to know a queue exists. JavaScript's `Promise` + `async/await` is the only abstraction callers need — it was always enough, we just had a clever workaround in place that's now obsolete.

---

## 16. Execution checklist for the next session

Phase 1 must-dos:
- [ ] Write the migration (table + indexes + RLS + `agent_role` + `core_role`)
- [ ] Verify migration runs forward and backward against PGlite and real Postgres
- [ ] Implement `OperationQueue` class with all methods
- [ ] Implement `QueueWorker` base class
- [ ] Write unit tests (§12.1)
- [ ] Run full test suite — should be green (nothing migrated yet)
- [ ] Lint + typecheck + commit
- [ ] Deploy to prod — no behavior change, just new table + new code paths

Phase 2 must-dos:
- [ ] Register the core worker in `container.ts` boot (every replica starts one)
- [ ] Migrate `instance.create` to use `queue.execute`
- [ ] Extend agent registration to mint per-node DB credentials
- [ ] Add `postgres` client to the agent
- [ ] Implement `AgentWorker` with one handler: `bot.start`
- [ ] Switch `FleetManager.create` pool-claim path to enqueue `bot.start` instead of `commandBus.send`
- [ ] Integration test: full create flow through the queue
- [ ] Deploy, verify E2E, revert if broken

Phase 3 must-dos:
- [ ] Migrate remaining agent commands one by one
- [ ] Migrate remaining core operations
- [ ] Implement janitor as a scheduled pool.tick-style op
- [ ] Delete `NodeCommandBus`, `NodeConnectionManager`, WS route, agent WS client
- [ ] Decide on leader election: delete or keep-for-logs
- [ ] Full regression test, lint, typecheck, commit, deploy

---

**End of handoff.**

When picking this up, read §1 (the unlock), §2 (the contract stays the same), and §6 (topology) first. Everything else is the execution detail for those three sections.
