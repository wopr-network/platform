/**
 * Holyship boot sequence.
 *
 * Holyship is a standalone flow engine server. It owns:
 *   - Flow engine (states, gates, transitions, reaper)
 *   - GitHub integration (webhooks, primitive ops, installations)
 *   - Ship It (issue → entity → flow)
 *   - Flow editor, interrogation, gap actualization
 *   - Worker pool (asks core to provision holyshipper containers)
 *
 * It delegates to core (via core-client) for:
 *   - Auth (session validation)
 *   - Billing, credits, payments
 *   - Org/tenant management
 *   - Fleet (container provisioning)
 *   - Email/notifications
 *   - Metering, gateway
 */

import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { createShipItRoutes } from "./api/ship-it.js";
import { setCoreUrl } from "./auth/validate-session.js";
import { getConfig } from "./config.js";
import { DomainEventPersistAdapter } from "./engine/domain-event-adapter.js";
import { Engine } from "./engine/engine.js";
import { EventEmitter } from "./engine/event-emitter.js";
import type { PrimitiveOpHandler } from "./engine/gate-evaluator.js";
import { provisionEngineeringFlow } from "./flows/provision.js";
import { DrizzleGitHubInstallationRepository } from "./github/installation-repo.js";
import {
  checkCiStatus,
  checkCommentExists,
  checkFilesChangedSince,
  checkPrForBranch,
  checkPrHeadChanged,
  checkPrReviewStatus,
  checkPrStatus,
} from "./github/primitive-ops.js";
import { getInstallationAccessToken } from "./github/token-generator.js";
import { createGitHubWebhookRoutes } from "./github/webhook.js";
import { logger } from "./logger.js";
import type { Entity } from "./repositories/interfaces.js";
import { createScopedRepos } from "./repositories/scoped-repos.js";
import { createEngineRoutes } from "./routes/engine.js";
import { createFlowEditorRoutes } from "./routes/flow-editor.js";
import { createInterrogationRoutes } from "./routes/interrogation.js";
import { createTRPCContext } from "./trpc/init.js";

// ---------------------------------------------------------------------------
// GitHub token resolution
// ---------------------------------------------------------------------------

async function getTokenForEntity(
  _entity: Entity,
  installationRepo: InstanceType<typeof DrizzleGitHubInstallationRepository>,
  appId: string,
  privateKey: string,
): Promise<string> {
  const installations = await installationRepo.listByTenant("default");
  if (installations.length === 0) {
    throw new Error("No GitHub App installations found");
  }
  const installation = installations[0];
  if (!installation.accessToken || !installation.tokenExpiresAt || installation.tokenExpiresAt < new Date()) {
    const { token, expiresAt } = await getInstallationAccessToken(appId, privateKey, installation.installationId);
    await installationRepo.updateToken(installation.installationId, token, expiresAt);
    return token;
  }
  return installation.accessToken;
}

function parseRepoFullName(entity: Entity): { owner: string; repo: string } {
  const fullName = entity.artifacts?.repoFullName as string | undefined;
  if (!fullName?.includes("/")) {
    throw new Error(`Entity ${entity.id} missing repoFullName artifact`);
  }
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  const config = getConfig();

  // ─── 1. Wire auth to core ────────────────────────────────────────────
  setCoreUrl(config.CORE_URL);
  logger.info("Core URL configured", { url: config.CORE_URL });

  // ─── 2. Engine database (holyship's own tables) ──────────────────────
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const engineSchema = await import("./repositories/drizzle/schema.js");
  const engineDb = drizzle(pool, { schema: engineSchema });

  // ─── 3. Engine migrations ────────────────────────────────────────────
  {
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const localMigrations = path.resolve(process.cwd(), "drizzle");
    if (existsSync(localMigrations)) {
      await migrate(engineDb as never, {
        migrationsFolder: localMigrations,
        migrationsTable: "__holyship_migrations",
      });
      logger.info("Engine migrations complete");
    }
  }

  // ─── 4. Hono app ────────────────────────────────────────────────────
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: [config.UI_ORIGIN],
      credentials: true,
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", service: "holyship" }));

  // ─── 5. Auth proxy — forward to core so cookies work on our domain ──
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    const url = new URL(c.req.url);
    const coreUrl = `${config.CORE_URL}${url.pathname}${url.search}`;

    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Product", "holyship");
    headers.delete("host");

    const res = await fetch(coreUrl, {
      method: c.req.method,
      headers,
      body: c.req.method === "POST" ? await c.req.arrayBuffer() : undefined,
    });

    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  });

  // ─── 6. tRPC ─────────────────────────────────────────────────────────
  const { appRouter } = await import("./trpc/index.js");
  app.all("/trpc/*", async (c) => {
    return fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext(c.req.raw),
    });
  });
  logger.info("tRPC router mounted at /trpc/*");

  // ─── 7. Flow engine ──────────────────────────────────────────────────
  const tenantId = "default";
  const repos = createScopedRepos(engineDb, tenantId);

  const eventEmitter = new EventEmitter(logger);
  eventEmitter.register(new DomainEventPersistAdapter(repos.domainEvents));

  // GitHub primitive op handler (for gate evaluation)
  const hasGitHubApp = !!(config.GITHUB_APP_ID && config.GITHUB_APP_PRIVATE_KEY);
  const installationRepo = new DrizzleGitHubInstallationRepository(engineDb, tenantId);

  const primitiveOpHandler: PrimitiveOpHandler | undefined = hasGitHubApp
    ? async (primitiveOp, params, entity) => {
        const token = await getTokenForEntity(
          entity,
          installationRepo,
          config.GITHUB_APP_ID as string,
          config.GITHUB_APP_PRIVATE_KEY as string,
        );
        const { owner, repo } = parseRepoFullName(entity);
        const ctx = { token, owner, repo };

        switch (primitiveOp) {
          case "vcs.ci_status":
            return checkCiStatus(ctx, { ref: params.ref as string });
          case "vcs.pr_status":
            return checkPrStatus(ctx, { pullNumber: Number(params.pullNumber) });
          case "issue_tracker.comment_exists": {
            const result = await checkCommentExists(ctx, {
              issueNumber: Number(params.issueNumber),
              pattern: params.pattern as string,
            });
            const artifactKey = params.artifactKey as string | undefined;
            if (artifactKey && result.artifacts) {
              const arts = result.artifacts as Record<string, unknown>;
              if (arts.extractedBody) {
                arts[artifactKey] = arts.extractedBody;
                delete arts.extractedBody;
              }
            }
            return result;
          }
          case "vcs.pr_for_branch":
            return checkPrForBranch(ctx, { branchPattern: params.branchPattern as string });
          case "vcs.pr_review_status":
            return checkPrReviewStatus(ctx, { pullNumber: Number(params.pullNumber) });
          case "vcs.pr_head_changed":
            return checkPrHeadChanged(ctx, {
              pullNumber: Number(params.pullNumber),
              lastKnownSha: params.lastKnownSha as string,
            });
          case "vcs.files_changed_since":
            return checkFilesChangedSince(ctx, {
              pullNumber: Number(params.pullNumber),
              pathPatterns: params.pathPatterns as string,
            });
          default:
            return { outcome: "error", message: `Unknown primitive op: ${primitiveOp}` };
        }
      }
    : undefined;

  // biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
  const withTransaction = <T>(fn: (tx: any) => T | Promise<T>): Promise<T> =>
    // biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
    (engineDb as any).transaction(async (tx: any) => fn(tx));

  const repoFactory = (tx: unknown) => {
    const r = createScopedRepos(tx, tenantId);
    return {
      entityRepo: r.entities,
      flowRepo: r.flows,
      invocationRepo: r.invocations,
      gateRepo: r.gates,
      transitionLogRepo: r.transitionLog,
      domainEvents: r.domainEvents,
    };
  };

  const engine = new Engine({
    entityRepo: repos.entities,
    flowRepo: repos.flows,
    invocationRepo: repos.invocations,
    gateRepo: repos.gates,
    transitionLogRepo: repos.transitionLog,
    adapters: new Map(),
    eventEmitter,
    withTransaction,
    repoFactory,
    domainEvents: repos.domainEvents,
    primitiveOpHandler,
  });

  // Provision the baked-in engineering flow
  const { flowId } = await provisionEngineeringFlow(repos.flows, repos.gates);
  logger.info(`Engineering flow provisioned: ${flowId}`);

  // Start reaper
  const stopReaper = engine.startReaper(30_000);

  // ─── 8. FlowEditService (calls core's gateway — not local) ──────────
  const { FlowEditService } = await import("./flows/flow-edit-service.js");
  const gatewayUrl = `${config.CORE_URL}/v1`;
  const flowEditService = new FlowEditService({
    gatewayUrl,
    platformServiceKey: config.HOLYSHIP_PLATFORM_SERVICE_KEY ?? config.HOLYSHIP_GATEWAY_KEY ?? "",
  });

  // ─── 9. Reactive worker pool (holyshipper containers via core fleet) ─
  let holyshipperFleetManager: import("./fleet/provision-holyshipper.js").IFleetManager | undefined;
  if (config.HOLYSHIP_WORKER_IMAGE && config.HOLYSHIP_GATEWAY_KEY) {
    try {
      const { HolyshipperFleetManager } = await import("./fleet/holyshipper-fleet-manager.js");
      holyshipperFleetManager = new HolyshipperFleetManager({
        image: config.HOLYSHIP_WORKER_IMAGE,
        gatewayUrl,
        gatewayKey: config.HOLYSHIP_GATEWAY_KEY,
        network: config.DOCKER_NETWORK,
      });

      const { WorkerPool } = await import("./fleet/worker-pool.js");
      const workerPool = new WorkerPool({
        engine,
        db: engineDb,
        tenantId,
        fleetManager: holyshipperFleetManager,
        invocationRepo: repos.invocations,
        getGithubToken: async () => {
          if (!hasGitHubApp) return null;
          const installations = await installationRepo.listByTenant(tenantId);
          if (installations.length === 0) return null;
          const { token } = await getInstallationAccessToken(
            config.GITHUB_APP_ID as string,
            config.GITHUB_APP_PRIVATE_KEY as string,
            installations[0].installationId,
          );
          return token;
        },
        poolSize: 4,
      });

      eventEmitter.register(workerPool);
      logger.info("Reactive worker pool registered (4 slots)");
    } catch (err) {
      logger.warn("Worker pool setup failed (non-fatal)", (err as Error).message);
    }
  } else {
    logger.info("Worker pool disabled (HOLYSHIP_WORKER_IMAGE or HOLYSHIP_GATEWAY_KEY not set)");
  }

  // ─── 10. Engine REST routes (claim/report for holyshippers) ──────────
  app.route(
    "/api",
    createEngineRoutes({
      engine,
      entities: repos.entities,
      flows: repos.flows,
      invocations: repos.invocations,
      workerToken: config.HOLYSHIP_WORKER_TOKEN,
    }),
  );

  // ─── 11. Ship It routes ──────────────────────────────────────────────
  app.route(
    "/api/ship-it",
    createShipItRoutes({
      engine,
      fetchIssue: async (owner, repo, issueNumber) => {
        if (!hasGitHubApp) {
          throw new Error("GitHub App not configured (set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY)");
        }
        const installations = await installationRepo.listByTenant(tenantId);
        if (installations.length === 0) {
          throw new Error("No GitHub App installations found");
        }
        const { token } = await getInstallationAccessToken(
          config.GITHUB_APP_ID as string,
          config.GITHUB_APP_PRIVATE_KEY as string,
          installations[0].installationId,
        );
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!res.ok) {
          throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        }
        const issue = (await res.json()) as { title: string; body: string; html_url: string };
        return { title: issue.title, body: issue.body ?? "", htmlUrl: issue.html_url };
      },
    }),
  );

  // ─── 12. GitHub webhook routes ───────────────────────────────────────
  const githubWebhookSecret = config.GITHUB_WEBHOOK_SECRET;
  if (githubWebhookSecret) {
    app.route(
      "/api/github/webhook",
      createGitHubWebhookRoutes({
        installationRepo,
        webhookSecret: githubWebhookSecret,
        tenantId,
        onIssueOpened: async (payload) => {
          logger.info(`Issue opened: ${payload.owner}/${payload.repo}#${payload.issueNumber}`);
          await engine.createEntity("engineering", undefined, {
            repoFullName: `${payload.owner}/${payload.repo}`,
            issueNumber: payload.issueNumber,
            issueTitle: payload.issueTitle,
            issueBody: payload.issueBody,
          });
        },
      }),
    );
    logger.info("GitHub webhook routes mounted");
  }

  // ─── 12b. GitHub repos endpoint (for dashboard + ship-it UI) ─────────
  if (hasGitHubApp) {
    app.get("/api/github/repos", async (c) => {
      try {
        const installations = await installationRepo.listByTenant(tenantId);
        if (installations.length === 0) {
          return c.json({ repositories: [] });
        }
        const { token } = await getInstallationAccessToken(
          config.GITHUB_APP_ID as string,
          config.GITHUB_APP_PRIVATE_KEY as string,
          installations[0].installationId,
        );
        const res = await fetch("https://api.github.com/installation/repositories?per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!res.ok) {
          return c.json({ repositories: [], error: `GitHub API ${res.status}` }, 502);
        }
        const data = (await res.json()) as {
          repositories: { id: number; full_name: string; name: string }[];
        };
        return c.json({ repositories: data.repositories });
      } catch (err) {
        logger.error("Failed to list repos", (err as Error).message);
        return c.json({ repositories: [], error: (err as Error).message }, 500);
      }
    });
    logger.info("GitHub repos endpoint mounted");

    // GitHub issues endpoint — proxy to GitHub API via installation token
    app.get("/api/github/repos/:owner/:repo/issues", async (c) => {
      try {
        const owner = c.req.param("owner");
        const repo = c.req.param("repo");
        const state = c.req.query("state") ?? "open";
        const perPage = c.req.query("per_page") ?? "50";
        const installations = await installationRepo.listByTenant(tenantId);
        if (installations.length === 0) {
          return c.json({ issues: [] });
        }
        const { token } = await getInstallationAccessToken(
          config.GITHUB_APP_ID as string,
          config.GITHUB_APP_PRIVATE_KEY as string,
          installations[0].installationId,
        );
        const res = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}&per_page=${encodeURIComponent(perPage)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
        if (!res.ok) {
          return c.json({ issues: [], error: `GitHub API ${res.status}` }, 502);
        }
        const issues = (await res.json()) as {
          number: number;
          title: string;
          labels: { name: string; color: string }[];
          created_at: string;
          html_url: string;
          pull_request?: unknown;
        }[];
        return c.json({ issues: issues.filter((i) => !i.pull_request) });
      } catch (err) {
        logger.error("Failed to list issues", err);
        return c.json({ issues: [], error: (err as Error).message }, 500);
      }
    });
    logger.info("GitHub issues endpoint mounted");
  }

  // ─── 12c+12d. Flow editor + interrogation routes ─────────────────────
  {
    const { InterrogationService } = await import("./flows/interrogation-service.js");
    const { GapActualizationService } = await import("./flows/gap-actualization-service.js");
    const { FlowDesignService } = await import("./flows/flow-design-service.js");

    const getGithubToken = async (): Promise<string | null> => {
      if (!hasGitHubApp) return null;
      const installations = await installationRepo.listByTenant(tenantId);
      if (installations.length === 0) return null;
      const installation = installations[0];
      if (!installation.accessToken || !installation.tokenExpiresAt || installation.tokenExpiresAt < new Date()) {
        const { token, expiresAt } = await getInstallationAccessToken(
          config.GITHUB_APP_ID as string,
          config.GITHUB_APP_PRIVATE_KEY as string,
          installation.installationId,
        );
        await installationRepo.updateToken(installation.installationId, token, expiresAt);
        return token;
      }
      return installation.accessToken;
    };

    const interrogationService = new InterrogationService({
      db: engineDb,
      tenantId,
      fleetManager: holyshipperFleetManager ?? {
        provision: () =>
          Promise.reject(new Error("Fleet not configured — set HOLYSHIP_WORKER_IMAGE + HOLYSHIP_GATEWAY_KEY")),
        teardown: () => Promise.resolve(),
      },
      getGithubToken,
    });

    const gapActualizationService = new GapActualizationService({
      interrogationService,
      engine,
      getGithubToken,
    });

    const flowDesignService = new FlowDesignService({
      interrogationService,
      gatewayUrl,
      platformServiceKey: config.HOLYSHIP_PLATFORM_SERVICE_KEY ?? config.HOLYSHIP_GATEWAY_KEY ?? "",
    });

    if (hasGitHubApp) {
      app.route(
        "/api",
        createFlowEditorRoutes({
          getGithubToken: async () => {
            const installations = await installationRepo.listByTenant(tenantId);
            if (installations.length === 0) return null;
            const { token } = await getInstallationAccessToken(
              config.GITHUB_APP_ID as string,
              config.GITHUB_APP_PRIVATE_KEY as string,
              installations[0].installationId,
            );
            return token;
          },
          flowEditService,
          flowDesignService,
        }),
      );
      logger.info("Flow editor routes mounted");
    }

    app.route(
      "/api",
      createInterrogationRoutes({
        interrogationService,
        gapActualizationService,
      }),
    );
    logger.info("Interrogation routes mounted");
  }

  // ─── 13. Start server ────────────────────────────────────────────────
  serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, () => {
    logger.info(`holyship listening on ${config.HOST}:${config.PORT}`);
    if (hasGitHubApp) {
      logger.info("GitHub App configured — primitive gates and Ship It are live");
    } else {
      logger.warn("GitHub App not configured — primitive gates will fail");
    }
  });

  // ─── Graceful shutdown ───────────────────────────────────────────────
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down`);
      void stopReaper();
      pool.end();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error("Fatal startup error", (err as Error).message);
  process.exit(1);
});
