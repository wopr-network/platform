/**
 * Reactive Worker Pool — event-driven execution of invocations.
 *
 * Subscribes to engine events as an IEventBusAdapter. When invocation.created
 * fires, a worker claims it and runs the full lifecycle:
 *   provision container → dispatch prompt → evaluate gates → transition → teardown
 *
 * Concurrency is bounded by pool size. If all workers are busy, events queue.
 * No polling. No sleep loops. Purely reactive.
 */

import { eq } from "drizzle-orm";
import type { Engine } from "../engine/engine.js";
import type { EngineEvent, IEventBusAdapter } from "../engine/event-types.js";
import { logger } from "../logger.js";
import { holyshipperContainers } from "../repositories/drizzle/schema.js";
import type { IEntityRepository, IInvocationRepository } from "../repositories/interfaces.js";
import type { IFleetManager, ProvisionConfig } from "./provision-holyshipper.js";

// biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
type Db = any;

const AGENT_ROLE_TO_TIER: Record<string, string> = {
  "wopr-architect": "sonnet",
  "wopr-coder": "sonnet",
  "wopr-reviewer": "haiku",
  "wopr-technical-writer": "haiku",
};

/** When set, overrides all tier selections — use "test" for free models in dev/staging */
const MODEL_TIER_OVERRIDE = process.env.HOLYSHIP_MODEL_TIER_OVERRIDE ?? "";

export interface WorkerPoolConfig {
  engine: Engine;
  db: Db;
  tenantId: string;
  fleetManager: IFleetManager;
  invocationRepo: IInvocationRepository;
  entityRepo: IEntityRepository;
  getGithubToken: () => Promise<string | null>;
  /** Max concurrent workers (containers). Default 4. */
  poolSize?: number;
}

export class WorkerPool implements IEventBusAdapter {
  private readonly engine: Engine;
  private readonly db: Db;
  private readonly tenantId: string;
  private readonly fleetManager: IFleetManager;
  private readonly invocationRepo: IInvocationRepository;
  private readonly entityRepo: IEntityRepository;
  private readonly getGithubToken: () => Promise<string | null>;
  private readonly poolSize: number;

  private activeWorkers = 0;
  private readonly pending: Array<EngineEvent & { type: "invocation.created" }> = [];

  constructor(config: WorkerPoolConfig) {
    this.engine = config.engine;
    this.db = config.db;
    this.tenantId = config.tenantId;
    this.fleetManager = config.fleetManager;
    this.invocationRepo = config.invocationRepo;
    this.entityRepo = config.entityRepo;
    this.getGithubToken = config.getGithubToken;
    this.poolSize = config.poolSize ?? 4;
    logger.info("[worker-pool] initialized", {
      poolSize: this.poolSize,
      tierOverride: MODEL_TIER_OVERRIDE || "(none)",
    });
  }

  /**
   * Re-emit invocation.created for every unclaimed active invocation.
   *
   * The pool is reactive — it only schedules work when it receives an
   * invocation.created event. A restart (every prod deploy) drops that queue
   * on the floor: invocations created before the restart sit unclaimed
   * forever, because no new event ever fires for them. This method walks the
   * DB once at boot and synthesizes the missing events so pre-restart work
   * drains.
   */
  async recoverUnclaimed(): Promise<number> {
    // Let a repo failure reject up to the caller's .catch — swallowing it
    // would collapse "nothing to recover" and "DB unavailable" into the
    // same return value and hide real incidents.
    const unclaimed = await this.invocationRepo.findUnclaimedActive();
    if (unclaimed.length === 0) {
      logger.info("[worker-pool] recoverUnclaimed: no stranded invocations");
      return 0;
    }
    logger.info("[worker-pool] recoverUnclaimed: re-emitting invocation.created", {
      count: unclaimed.length,
    });
    let recovered = 0;
    for (const inv of unclaimed) {
      // Per-invocation try/catch: a single bad record (e.g. entity vanished
      // between the repo read and emit) must not strand the rest. Each
      // emit() is a local in-process dispatch — this sync-await inside the
      // loop is cheap because emit() either kicks off runWorker synchronously
      // or pushes to this.pending and returns.
      try {
        await this.emit({
          type: "invocation.created",
          entityId: inv.entityId,
          invocationId: inv.id,
          stage: inv.stage,
          emittedAt: new Date(),
        });
        recovered++;
      } catch (err) {
        logger.warn("[worker-pool] recoverUnclaimed: emit failed for one invocation — continuing", {
          invocationId: inv.id,
          entityId: inv.entityId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return recovered;
  }

  async emit(event: EngineEvent): Promise<void> {
    logger.debug("[worker-pool] event received", {
      type: event.type,
      entityId: "entityId" in event ? event.entityId : undefined,
    });

    // When an entity is created, claim it and directly schedule the worker.
    // claimWork emits entity.claimed but NOT invocation.created, so we
    // synthesize the event and feed it into the pool ourselves.
    if (event.type === "entity.created") {
      logger.info("[worker-pool] entity.created — claiming work", { entityId: event.entityId });
      try {
        const claimed = await this.engine.claimWork("engineering");
        if (claimed && typeof claimed === "object") {
          logger.info("[worker-pool] claimWork succeeded — scheduling worker directly", {
            claimedEntityId: claimed.entityId,
            invocationId: claimed.invocationId,
          });
          const syntheticEvent = {
            type: "invocation.created" as const,
            entityId: claimed.entityId,
            invocationId: claimed.invocationId,
            stage: claimed.stage,
            emittedAt: new Date(),
          };
          if (this.activeWorkers < this.poolSize) {
            void this.runWorker(syntheticEvent);
          } else {
            this.pending.push(syntheticEvent);
            logger.warn("[worker-pool] all slots busy — queued claimed work", {
              entityId: claimed.entityId,
              queueDepth: this.pending.length,
            });
          }
        } else {
          logger.warn("[worker-pool] claimWork returned no work", {
            entityId: event.entityId,
            result: String(claimed),
          });
        }
      } catch (err) {
        logger.error("[worker-pool] claimWork threw", {
          entityId: event.entityId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
      return;
    }

    if (event.type !== "invocation.created") return;
    if ("mode" in event && event.mode === "passive") {
      logger.debug("[worker-pool] skipping passive invocation", { entityId: event.entityId });
      return;
    }

    logger.info("[worker-pool] invocation.created — scheduling worker", {
      entityId: event.entityId,
      invocationId: event.invocationId,
      stage: event.stage,
      activeWorkers: this.activeWorkers,
      poolSize: this.poolSize,
      queueDepth: this.pending.length,
    });

    if (this.activeWorkers < this.poolSize) {
      void this.runWorker(event);
    } else {
      this.pending.push(event);
      logger.warn("[worker-pool] all slots busy — queued", {
        entityId: event.entityId,
        queueDepth: this.pending.length,
        activeWorkers: this.activeWorkers,
      });
    }
  }

  private async runWorker(event: EngineEvent & { type: "invocation.created" }): Promise<void> {
    this.activeWorkers++;
    const workerId = this.activeWorkers;
    const tag = `[worker-${workerId}]`;

    logger.info(`${tag} starting`, {
      entityId: event.entityId,
      invocationId: event.invocationId,
      activeWorkers: this.activeWorkers,
    });

    try {
      await this.executeInvocation(workerId, event);
    } catch (err) {
      logger.error(`${tag} unhandled error`, {
        entityId: event.entityId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      this.activeWorkers--;
      logger.info(`${tag} finished`, {
        entityId: event.entityId,
        activeWorkers: this.activeWorkers,
        pendingCount: this.pending.length,
      });
      const next = this.pending.shift();
      if (next) {
        logger.info(`${tag} dequeuing next`, { nextEntityId: next.entityId });
        void this.runWorker(next);
      }
    }
  }

  private async executeInvocation(
    workerId: number,
    event: EngineEvent & { type: "invocation.created" },
  ): Promise<void> {
    const { entityId, invocationId, stage } = event;
    const tag = `[worker-${workerId}]`;

    // 1. Read invocation for prompt
    logger.info(`${tag} reading invocation`, { invocationId });
    const invocation = await this.invocationRepo.get(invocationId);
    if (!invocation) {
      logger.error(`${tag} invocation not found`, { invocationId });
      return;
    }
    if (!invocation.prompt) {
      logger.error(`${tag} invocation has no prompt`, { invocationId, agentRole: invocation.agentRole });
      return;
    }

    const { prompt } = invocation;
    // Artifacts live on the entity — createEntity() stores the caller payload
    // (owner, repo, repoFullName, issueNumber, ...) via entityRepo.updateArtifacts.
    // Invocations don't carry artifacts, so reading invocation.artifacts always
    // yields {} and the worker provisions with blank owner/repo.
    const entity = await this.entityRepo.get(entityId);
    if (!entity) {
      logger.error(`${tag} entity not found — aborting invocation`, { entityId, invocationId });
      return;
    }
    const artifacts = entity.artifacts ?? {};
    const repoFullName = (artifacts.repoFullName as string) ?? "";
    const [owner = "", repo = ""] = repoFullName.includes("/") ? repoFullName.split("/") : ["", ""];
    const issueNumber = Number(artifacts.issueNumber) || 0;
    const agentRole = invocation.agentRole;

    logger.info(`${tag} invocation loaded`, {
      entityId,
      invocationId,
      agentRole,
      promptLength: prompt.length,
      repoFullName: repoFullName || "(none)",
      issueNumber: issueNumber || "(none)",
    });

    let githubToken = "";
    try {
      githubToken = (await this.getGithubToken()) ?? "";
      logger.debug(`${tag} github token ${githubToken ? "obtained" : "empty"}`);
    } catch (err) {
      logger.warn(`${tag} github token failed`, { error: String(err) });
    }

    const provisionConfig: ProvisionConfig = { entityId, flowName: stage, owner, repo, issueNumber, githubToken };

    // 2. Provision container
    logger.info(`${tag} provisioning holyshipper container`, {
      entityId,
      stage,
      owner,
      repo,
      image: process.env.HOLYSHIP_WORKER_IMAGE ?? "(default)",
    });

    const dbRecordId = crypto.randomUUID();
    await this.db.insert(holyshipperContainers).values({
      id: dbRecordId,
      tenantId: this.tenantId,
      entityId,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    logger.debug(`${tag} DB record created`, { dbRecordId });

    let runnerUrl: string;
    let containerId: string;
    try {
      const provisionStart = Date.now();
      const result = await this.fleetManager.provision(entityId, provisionConfig);
      runnerUrl = result.runnerUrl;
      containerId = result.containerId;
      const provisionMs = Date.now() - provisionStart;

      logger.info(`${tag} container provisioned`, {
        entityId,
        containerId: containerId.slice(0, 12),
        runnerUrl,
        provisionMs,
      });

      await this.db
        .update(holyshipperContainers)
        .set({ containerId, runnerUrl, status: "running", provisionedAt: new Date(), updatedAt: new Date() })
        .where(eq(holyshipperContainers.id, dbRecordId));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`${tag} provision FAILED`, {
        entityId,
        error: errMsg,
        stack: err instanceof Error ? err.stack : undefined,
      });
      await this.db
        .update(holyshipperContainers)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(holyshipperContainers.id, dbRecordId));
      // Also record on the invocation so /api/engine/entities/:id/detail
      // surfaces the failure to the UI and operators — previously provision
      // errors only went to container stdout, invisible without SSH.
      try {
        await this.invocationRepo.fail(invocationId, `provision: ${errMsg}`);
      } catch (failErr) {
        logger.warn(`${tag} invocation.fail record failed`, {
          invocationId,
          error: failErr instanceof Error ? failErr.message : String(failErr),
        });
      }
      return;
    }

    // 3. Dispatch prompt
    const modelTier = MODEL_TIER_OVERRIDE || AGENT_ROLE_TO_TIER[agentRole ?? ""] || "sonnet";
    logger.info(`${tag} dispatching prompt`, {
      entityId,
      invocationId,
      modelTier,
      tierSource: MODEL_TIER_OVERRIDE ? "env override" : `role:${agentRole ?? "default"}`,
      promptLength: prompt.length,
      runnerUrl,
    });

    try {
      const dispatchStart = Date.now();
      const res = await fetch(`${runnerUrl.replace(/\/$/, "")}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelTier }),
        signal: AbortSignal.timeout(600_000),
      });

      const dispatchMs = Date.now() - dispatchStart;

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error(`${tag} dispatch HTTP error`, {
          entityId,
          status: res.status,
          body: text.slice(0, 500),
          dispatchMs,
        });
        await this.invocationRepo
          .fail(invocationId, `dispatch HTTP ${res.status}: ${text.slice(0, 200)}`)
          .catch((e) => logger.warn(`${tag} invocation.fail failed`, { error: String(e) }));
        await this.teardown(dbRecordId, containerId, tag, entityId);
        return;
      }

      logger.info(`${tag} dispatch response received`, { entityId, status: res.status, dispatchMs });

      // 4. Parse SSE result
      const body = await res.text();
      logger.debug(`${tag} SSE body length`, { entityId, bodyLength: body.length });

      const sseEvents = body
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => {
          try {
            return JSON.parse(line.slice(5)) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      logger.info(`${tag} SSE events parsed`, {
        entityId,
        eventCount: sseEvents.length,
        types: sseEvents.map((e) => e.type),
      });

      // Log any error events for debugging
      const errorEvents = sseEvents.filter((e) => e.type === "error");
      if (errorEvents.length > 0) {
        logger.error(`${tag} SSE error events`, { entityId, errors: errorEvents });
      }

      const resultEvent = sseEvents.find((e) => e.type === "result");
      if (!resultEvent) {
        logger.error(`${tag} no result event in SSE stream`, {
          entityId,
          eventTypes: sseEvents.map((e) => e.type),
          rawBody: body.slice(0, 2000),
        });
        await this.invocationRepo
          .fail(invocationId, "no result event in SSE stream")
          .catch((e) => logger.warn(`${tag} invocation.fail failed`, { error: String(e) }));
        await this.teardown(dbRecordId, containerId, tag, entityId);
        return;
      }

      const agentSignal = (resultEvent.signal as string) ?? "";
      const resultArtifacts = (resultEvent.artifacts as Record<string, unknown>) ?? {};

      logger.info(`${tag} dispatch complete`, {
        entityId,
        agentSignal: agentSignal || "(empty)",
        artifactKeys: Object.keys(resultArtifacts),
        costUsd: resultEvent.costUsd,
        isError: resultEvent.isError,
        stopReason: resultEvent.stopReason,
      });

      // 5. Close the triggering invocation BEFORE gate-driven transition so
      // the concurrency check for the next-state invocation doesn't count
      // this one as still-pending. (Mirrors DirectFlowEngine.report() which
      // completes, then processes the signal.) If we skip this, successful
      // architect runs never mark their row complete — findUnclaimedActive
      // keeps returning them, recovery re-dispatches on every boot, and
      // checkConcurrency refuses to create coder invocations because the
      // stale rows pin maxConcurrent.
      try {
        await this.invocationRepo.complete(invocationId, agentSignal || "agent_output", resultArtifacts);
      } catch (err) {
        logger.warn(`${tag} invocation.complete failed (non-fatal)`, {
          invocationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // 6. Gate-driven transition: engine evaluates all outgoing gates to
      // determine what happened, then falls back to fuzzy signal matching.
      // Agent output format is irrelevant — gates check external systems.
      logger.info(`${tag} evaluating gates for transition`, { entityId });
      try {
        const transitionResult = await this.engine.evaluateAndTransition(entityId, body, resultArtifacts);
        logger.info(`${tag} transition evaluated`, {
          entityId,
          result: JSON.stringify(transitionResult).slice(0, 500),
        });
      } catch (err) {
        logger.error(`${tag} evaluateAndTransition FAILED`, {
          entityId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    } catch (err) {
      logger.error(`${tag} dispatch FAILED`, {
        entityId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      await this.invocationRepo
        .fail(invocationId, `dispatch: ${err instanceof Error ? err.message : String(err)}`)
        .catch((e) => logger.warn(`${tag} invocation.fail failed`, { error: String(e) }));
    }

    // 7. Teardown — processSignal is sync so gates are done
    await this.teardown(dbRecordId, containerId, tag, entityId);
  }

  private async teardown(dbRecordId: string, containerId: string, tag: string, entityId: string): Promise<void> {
    logger.info(`${tag} tearing down container`, { entityId, containerId: containerId.slice(0, 12) });
    try {
      await this.fleetManager.teardown(containerId);
      logger.info(`${tag} container removed`, { entityId, containerId: containerId.slice(0, 12) });
    } catch (err) {
      logger.warn(`${tag} teardown failed (container may already be gone)`, {
        entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await this.db
      .update(holyshipperContainers)
      .set({ status: "torn_down", tornDownAt: new Date(), updatedAt: new Date() })
      .where(eq(holyshipperContainers.id, dbRecordId));
    logger.info(`${tag} teardown complete`, { entityId });
  }
}
