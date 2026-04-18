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
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { createShipItRoutes } from "./api/ship-it.js";
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

  // ─── 1. Resolve secrets from Vault ───────────────────────────────────
  const { resolveSecrets, VaultClient, resolveVaultConfig } = await import("@wopr-network/vault-client");
  const secrets = await resolveSecrets("holyship");

  // Holyship-specific secrets (gateway key, worker token) + GitHub App ID
  const vaultConfig = resolveVaultConfig();
  let holyshipSecrets: Record<string, string> = {};
  let githubSecrets: Record<string, string> = {};
  if (vaultConfig) {
    const vault = new VaultClient(vaultConfig);
    [holyshipSecrets, githubSecrets] = await Promise.all([
      vault.read("holyship/prod").catch(() => ({})),
      vault.read("shared/github").catch(() => ({})),
    ]);
  }

  const githubAppId = githubSecrets.app_id ?? null;
  const githubAppPrivateKey = secrets.githubAppPrivateKey;
  const githubWebhookSecret = secrets.githubWebhookSecret;
  const gatewayKey = holyshipSecrets.gateway_key ?? null;
  const workerToken = holyshipSecrets.worker_token ?? null;
  const platformServiceKey = holyshipSecrets.platform_service_key ?? null;

  logger.info("Secrets resolved", { url: config.CORE_URL, hasGitHub: !!githubAppId });

  // Build DATABASE_URL from Vault secrets if not explicitly set
  const dbHost = process.env.DB_HOST ?? "postgres";
  const dbUser = process.env.DB_USER ?? "core";
  const dbName = process.env.DB_NAME ?? "holyship_engine";
  const dbPort = process.env.DB_PORT ?? "5432";
  const databaseUrl =
    config.DATABASE_URL ?? `postgresql://${dbUser}:${secrets.dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // ─── 2. Engine database (holyship's own tables) ──────────────────────
  const pool = new pg.Pool({ connectionString: databaseUrl });
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

  // Request logging — every request, every response
  app.use("*", async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    logger.info(`→ ${method} ${path}`);
    await next();
    const ms = Date.now() - start;
    logger.info(`← ${method} ${path} ${c.res.status} ${ms}ms`);
  });

  // ─── 5. Auth proxy to core ───────────────────────────────────────────
  // BetterAuth lives on core. The UI points at the engine for ALL /api/* and
  // the engine proxies /api/auth/* here via coreApiProxy (see §6b). The
  // proxy uses redirect:"manual" to preserve 302s and Set-Cookie.

  // ─── 6. tRPC proxy — forward all tRPC to core ────────────────────────
  app.all("/trpc/*", async (c) => {
    const url = new URL(c.req.url);
    const coreUrl = `${config.CORE_URL}${url.pathname}${url.search}`;
    logger.info("[proxy:trpc]", { path: url.pathname, method: c.req.method });

    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Product", "holyship");
    headers.delete("host");

    const res = await fetch(coreUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== "GET" ? await c.req.arrayBuffer() : undefined,
    });
    logger.info("[proxy:trpc] response", { path: url.pathname, status: res.status });
    return new Response(res.body, { status: res.status, headers: res.headers });
  });
  logger.info("tRPC proxied to core at /trpc/*");

  // ─── 6b. Core API proxy — platform endpoints that live on core ───────
  // Must be BEFORE engine routes (which have worker token auth at /api).
  //
  // redirect: "manual" is critical for /api/auth/* (BetterAuth OAuth callback
  // returns 302 with Set-Cookie) — default redirect:"follow" eats the 302 and
  // strips Set-Cookie, breaking login. Intentionally applied to all proxied
  // routes too: a transparent proxy should pass redirects through to the
  // client rather than silently chase them. /api/products/*, /api/stripe/*,
  // and /v1/* don't rely on server-side redirect-following today, so this is
  // strictly more correct.
  const coreApiProxy = async (c: {
    req: { url: string; method: string; raw: Request; arrayBuffer(): Promise<ArrayBuffer> };
  }) => {
    const url = new URL(c.req.url);
    const coreUrl = `${config.CORE_URL}${url.pathname}${url.search}`;
    logger.info("[proxy:core-api]", { path: url.pathname, method: c.req.method });
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Product", "holyship");
    headers.delete("host");
    const res = await fetch(coreUrl, {
      method: c.req.method,
      headers,
      body: !["GET", "HEAD"].includes(c.req.method) ? await c.req.arrayBuffer() : undefined,
      redirect: "manual",
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  };
  app.all("/api/auth/*", coreApiProxy);
  app.all("/api/products/*", coreApiProxy);
  app.all("/api/stripe/*", coreApiProxy);
  app.all("/v1/*", coreApiProxy);

  // ─── 7. Flow engine ──────────────────────────────────────────────────
  const tenantId = "default";
  const repos = createScopedRepos(engineDb, tenantId);

  const eventEmitter = new EventEmitter(logger);
  eventEmitter.register(new DomainEventPersistAdapter(repos.domainEvents));

  // GitHub primitive op handler (for gate evaluation)
  const hasGitHubApp = !!(githubAppId && githubAppPrivateKey);
  const installationRepo = new DrizzleGitHubInstallationRepository(engineDb, tenantId);

  const primitiveOpHandler: PrimitiveOpHandler | undefined = hasGitHubApp
    ? async (primitiveOp, params, entity) => {
        const token = await getTokenForEntity(
          entity,
          installationRepo,
          githubAppId as string,
          githubAppPrivateKey as string,
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
    platformServiceKey: platformServiceKey ?? gatewayKey ?? "",
  });

  // ─── 9. Reactive worker pool (holyshipper containers via core fleet) ─
  let holyshipperFleetManager: import("./fleet/provision-holyshipper.js").IFleetManager | undefined;
  if (config.HOLYSHIP_WORKER_IMAGE && gatewayKey) {
    try {
      const { HolyshipperFleetManager } = await import("./fleet/holyshipper-fleet-manager.js");
      holyshipperFleetManager = new HolyshipperFleetManager({
        image: config.HOLYSHIP_WORKER_IMAGE,
        gatewayUrl,
        gatewayKey: gatewayKey,
        network: config.DOCKER_NETWORK,
      });

      const { WorkerPool } = await import("./fleet/worker-pool.js");
      const workerPool = new WorkerPool({
        engine,
        db: engineDb,
        tenantId,
        fleetManager: holyshipperFleetManager,
        invocationRepo: repos.invocations,
        entityRepo: repos.entities,
        getGithubToken: async () => {
          if (!hasGitHubApp) return null;
          const installations = await installationRepo.listByTenant(tenantId);
          if (installations.length === 0) return null;
          const { token } = await getInstallationAccessToken(
            githubAppId as string,
            githubAppPrivateKey as string,
            installations[0].installationId,
          );
          return token;
        },
        poolSize: 4,
      });

      eventEmitter.register(workerPool);
      logger.info("Reactive worker pool registered (4 slots)");

      // Re-emit invocation.created for invocations that were unclaimed when
      // this process last exited. Without this, every deploy leaves those
      // invocations stranded — the reactive pool only wakes on new events.
      void workerPool
        .recoverUnclaimed()
        .then((count) => {
          if (count > 0) logger.info(`Worker pool recovered ${count} stranded invocation(s) from previous run`);
        })
        .catch((err) => logger.warn("Worker pool recovery failed (non-fatal)", (err as Error).message));
    } catch (err) {
      logger.warn("Worker pool setup failed (non-fatal)", (err as Error).message);
    }
  } else {
    logger.info("Worker pool disabled (HOLYSHIP_WORKER_IMAGE or HOLYSHIP_GATEWAY_KEY not set)");
  }

  // ─── 10. Engine REST routes (claim/report for holyshippers) ──────────
  app.route(
    "/api/engine",
    createEngineRoutes({
      engine,
      entities: repos.entities,
      flows: repos.flows,
      invocations: repos.invocations,
      workerToken: workerToken,
      coreUrl: config.CORE_URL,
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
          githubAppId as string,
          githubAppPrivateKey as string,
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
          githubAppId as string,
          githubAppPrivateKey as string,
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

    // Link installation — called by /connect/complete after GitHub App install
    app.post("/api/github/link-installation", async (c) => {
      try {
        const body = (await c.req.json()) as { installationId?: string | number };
        const instId = Number(body.installationId);
        if (!instId || Number.isNaN(instId)) {
          return c.json({ error: "installationId is required" }, 400);
        }

        // Fetch installation details from GitHub
        const { token } = await getInstallationAccessToken(
          githubAppId as string,
          githubAppPrivateKey as string,
          instId,
        );

        // Get the account info for this installation
        const infoRes = await fetch("https://api.github.com/installation/repositories?per_page=1", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });

        let accountLogin = "unknown";
        if (infoRes.ok) {
          const infoData = (await infoRes.json()) as {
            repositories?: { owner?: { login?: string; type?: string } }[];
          };
          accountLogin = infoData.repositories?.[0]?.owner?.login ?? "unknown";
        }

        await installationRepo.upsert({
          tenantId,
          installationId: instId,
          accountLogin,
          accountType: "Organization",
          accessToken: token,
          tokenExpiresAt: new Date(Date.now() + 55 * 60_000),
        });

        logger.info("GitHub installation linked", { installationId: instId, accountLogin });
        return c.json({ ok: true, installationId: instId, accountLogin });
      } catch (err) {
        logger.error("Failed to link installation", (err as Error).message);
        return c.json({ error: (err as Error).message }, 500);
      }
    });
    logger.info("GitHub link-installation endpoint mounted");

    // Sync installations — queries GitHub for all app installations, upserts them
    app.post("/api/github/sync-installations", async (c) => {
      try {
        const { generateAppJwt } = await import("./github/token-generator.js");
        const jwt = generateAppJwt(githubAppId as string, githubAppPrivateKey as string);
        const res = await fetch("https://api.github.com/app/installations", {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!res.ok) {
          return c.json({ error: `GitHub API ${res.status}` }, 502);
        }
        const installations = (await res.json()) as {
          id: number;
          account: { login: string; type: string };
        }[];
        let synced = 0;
        for (const inst of installations) {
          const { token, expiresAt } = await getInstallationAccessToken(
            githubAppId as string,
            githubAppPrivateKey as string,
            inst.id,
          );
          await installationRepo.upsert({
            tenantId,
            installationId: inst.id,
            accountLogin: inst.account.login,
            accountType: inst.account.type,
            accessToken: token,
            tokenExpiresAt: expiresAt,
          });
          synced++;
        }
        logger.info("GitHub installations synced", { synced });
        return c.json({ ok: true, synced });
      } catch (err) {
        logger.error("Failed to sync installations", (err as Error).message);
        return c.json({ error: (err as Error).message }, 500);
      }
    });

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
          githubAppId as string,
          githubAppPrivateKey as string,
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
          githubAppId as string,
          githubAppPrivateKey as string,
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
      platformServiceKey: platformServiceKey ?? gatewayKey ?? "",
    });

    if (hasGitHubApp) {
      app.route(
        "/api",
        createFlowEditorRoutes({
          getGithubToken: async () => {
            const installations = await installationRepo.listByTenant(tenantId);
            if (installations.length === 0) return null;
            const { token } = await getInstallationAccessToken(
              githubAppId as string,
              githubAppPrivateKey as string,
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
