import { eq, sql } from "drizzle-orm";
import type { CryptoDb } from "../db/index.js";
import { prices } from "../db/schema.js";

export interface PriceRow {
  token: string;
  priceMicros: number;
  source: string;
  updatedAt: string;
}

/**
 * DB-backed price reader + writer.
 *
 * The hot path (watchers, /charges) calls `get(token)` and treats the DB as
 * the single source of pricing truth. The refresher calls `upsert()` once an
 * hour per supported token. See `oracle/refresher.ts`.
 */
export interface IPriceStore {
  get(token: string): Promise<PriceRow | null>;
  list(): Promise<PriceRow[]>;
  upsert(token: string, priceMicros: number, source: string): Promise<void>;
}

export class DrizzlePriceStore implements IPriceStore {
  constructor(private readonly db: CryptoDb) {}

  async get(token: string): Promise<PriceRow | null> {
    const row = (await this.db.select().from(prices).where(eq(prices.token, token)))[0];
    return row ?? null;
  }

  async list(): Promise<PriceRow[]> {
    return await this.db.select().from(prices);
  }

  async upsert(token: string, priceMicros: number, source: string): Promise<void> {
    await this.db
      .insert(prices)
      .values({ token, priceMicros, source })
      .onConflictDoUpdate({
        target: prices.token,
        // raw SQL: Drizzle's set clause needs a server-side `now()` to
        // stamp updatedAt at commit time; a JS Date here would pin the
        // timestamp to when the query was built, not when it landed.
        set: { priceMicros, source, updatedAt: sql`(now())` },
      });
  }
}
