/**
 * Standalone entry point for the crypto key server.
 *
 * Deploys on the chain server (pay.wopr.bot:3100).
 * Boots: postgres → migrations → key server routes → watchers → serve.
 *
 * Usage: node dist/entry.js
 */
/* biome-ignore-all lint/suspicious/noConsole: standalone entry point */
import { serve } from "@hono/node-server";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createRpcCaller } from "./crypto-plugins/evm/watcher.js";
import {
  bitcoinPlugin,
  dogecoinPlugin,
  evmPlugin,
  litecoinPlugin,
  solanaPlugin,
  tonPlugin,
  tronPlugin,
} from "./crypto-plugins/index.js";
import { createDb } from "./db/index.js";
import { ChainlinkOracle } from "./oracle/chainlink.js";
import { CoinGeckoOracle } from "./oracle/coingecko.js";
import { DbPriceReader } from "./oracle/reader.js";
import { PriceRefresher } from "./oracle/refresher.js";
import { FixedRateStablecoinSource } from "./oracle/stablecoin.js";
import { PluginRegistry } from "./plugin/registry.js";
import { createKeyServerApp } from "./server.js";
import { DrizzleCryptoChargeRepository } from "./stores/charge-store.js";
import { DrizzleWatcherCursorStore } from "./stores/cursor-store.js";
import { DrizzlePaymentMethodStore } from "./stores/payment-method-store.js";
import { DrizzlePriceStore } from "./stores/price-store.js";
import { startPluginWatchers } from "./watchers/plugin-watcher-service.js";
import { processDeliveries } from "./watchers/watcher-service.js";

/**
 * Required env assertion. An unset required variable is not a state to
 * handle — it is a precondition that did not hold. Throwing at the point
 * of use (rather than an if/log/exit branch per variable) keeps the code
 * predicated on the data existing. The main().catch() at the bottom is the
 * single place that knows how to terminate the process.
 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const PORT = Number(process.env.PORT ?? "3100");
const DATABASE_URL = requireEnv("DATABASE_URL");
const BASE_RPC_URL = requireEnv("BASE_RPC_URL");
const SERVICE_KEY = process.env.SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Run migrations FIRST, before creating schema-typed db
  console.log("[crypto-key-server] Running migrations...");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle/migrations" });

  // Now create the schema-typed db (columns guaranteed to exist)
  console.log("[crypto-key-server] Connecting...");
  const db = createDb(pool);

  const chargeStore = new DrizzleCryptoChargeRepository(db);
  const methodStore = new DrizzlePaymentMethodStore(db);

  // ─── Pricing pipeline ──────────────────────────────────────────────────────
  // Hot path (watchers, /charges) reads prices ONLY from the `prices` DB table.
  // A separate PriceRefresher populates that table on boot + hourly, trying
  // multiple external sources in priority order. Any recorded price is valid;
  // refresher failures leave the previous value in place. This decoupling is
  // how we stop CoinGecko 429s from silently zeroing payment cents fields.
  const priceStore = new DrizzlePriceStore(db);
  const priceReader = new DbPriceReader(priceStore);

  // Build token→CoinGecko ID map from DB (zero-deploy chain additions)
  const allMethods = await methodStore.listAll();
  const dbTokenIds: Record<string, string> = {};
  for (const m of allMethods) {
    if (m.oracleAssetId) dbTokenIds[m.token] = m.oracleAssetId;
  }

  // Source priority: on-chain Chainlink → CoinGecko → stablecoin fixed-$1.
  // Chainlink is only consulted for tokens whose payment_method has an oracle
  // address; CoinGecko handles the rest; stablecoin catches USDC/USDT/DAI.
  const chainlink = new ChainlinkOracle({ rpcCall: createRpcCaller(BASE_RPC_URL) });
  const coingecko = new CoinGeckoOracle({ tokenIds: dbTokenIds });
  const stablecoin = new FixedRateStablecoinSource();

  // Tokens to refresh = every enabled payment method token. One row per token.
  // "First non-null feed wins" so a token served by two payment methods (e.g.,
  // ETH on mainnet + ETH on Base) still picks up the Chainlink feed even if
  // the null-feed method happens to be enumerated first.
  const tokenSet = new Map<string, `0x${string}` | undefined>();
  for (const m of allMethods) {
    if (!m.enabled) continue;
    const feed = m.oracleAddress ? (m.oracleAddress as `0x${string}`) : undefined;
    const existing = tokenSet.get(m.token);
    if (!tokenSet.has(m.token) || (existing === undefined && feed !== undefined)) {
      tokenSet.set(m.token, feed);
    }
  }
  const refresher = new PriceRefresher({
    store: priceStore,
    sources: [
      { name: "chainlink", source: chainlink },
      { name: "coingecko", source: coingecko },
      { name: "stablecoin", source: stablecoin },
    ],
    tokens: [...tokenSet.entries()].map(([token, feedAddress]) => ({ token, feedAddress })),
  });
  console.log(`[crypto-key-server] PriceRefresher tracking ${tokenSet.size} tokens:`, [...tokenSet.keys()].join(", "));
  await refresher.start();
  // ───────────────────────────────────────────────────────────────────────────

  // Build plugin registry — one plugin per chain family
  const registry = new PluginRegistry();
  registry.register(bitcoinPlugin);
  registry.register(litecoinPlugin);
  registry.register(dogecoinPlugin);
  registry.register(evmPlugin);
  registry.register(tronPlugin);
  registry.register(solanaPlugin);
  registry.register(tonPlugin);
  console.log(
    `[crypto-key-server] Registered ${registry.list().length} chain plugins:`,
    registry.list().map((p) => p.pluginId),
  );

  const app = createKeyServerApp({
    db,
    chargeStore,
    methodStore,
    priceStore,
    serviceKey: SERVICE_KEY,
    adminToken: ADMIN_TOKEN,
    registry,
  });

  // Boot plugin-driven watchers — polls for payments, sends webhooks.
  const cursorStore = new DrizzleWatcherCursorStore(db);
  const stopWatchers = await startPluginWatchers({
    db,
    chargeStore,
    methodStore,
    cursorStore,
    priceReader,
    registry,
    log: (msg, meta) => console.log(`[watcher] ${msg}`, meta ?? ""),
  });

  // Plugin watchers enqueue webhooks but don't run the delivery loop.
  // Start the outbox processor so enqueued webhooks actually get POSTed.
  const log = (msg: string, meta?: unknown) => console.log(`[webhook] ${msg}`, meta ?? "");
  const deliveryTimer: ReturnType<typeof setInterval> = setInterval(async () => {
    try {
      const count = await processDeliveries(db as never, ["https://"], log, SERVICE_KEY);
      if (count > 0) log("Webhooks delivered", { count });
    } catch (err) {
      log("Delivery error", { error: err instanceof Error ? err.message : String(err) });
    }
  }, 10_000);

  const server = serve({ fetch: app.fetch, port: PORT });
  console.log(`[crypto-key-server] Listening on :${PORT}`);

  // Graceful shutdown — stop accepting requests, drain watchers, close pool
  const shutdown = async () => {
    console.log("[crypto-key-server] Shutting down...");
    clearInterval(deliveryTimer);
    refresher.stop();
    stopWatchers();
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[crypto-key-server] Fatal:", err);
  process.exit(1);
});
