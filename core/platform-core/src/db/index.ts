import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import * as schema from "./schema/index.js";

/** The platform schema type. */
export type PlatformSchema = typeof schema;

/** Alias used throughout platform-core (and by wopr-platform). */
export type Schema = PlatformSchema;

/**
 * Structural DrizzleDb type — satisfied by both NodePgDatabase (production)
 * and PgliteDatabase (tests). Repositories accept this type.
 */
export type DrizzleDb = PgDatabase<PgQueryResultHKT, PlatformSchema>;

/** @deprecated Use DrizzleDb instead */
export type PlatformDb = DrizzleDb;

/** Create a Drizzle database instance wrapping the given pg.Pool. */
export function createDb(pool: Pool): PlatformDb {
  return drizzle(pool, { schema }) as unknown as PlatformDb;
}

export type { SQL } from "drizzle-orm";
// Re-export commonly used drizzle-orm operators so consumers using pnpm link
// resolve them from the same drizzle-orm instance as the schema tables.
export { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
// Re-export pg-core table builders for consumers that define local tables.
export { pgTable, text } from "drizzle-orm/pg-core";
export type { AuthUser, IAuthUserRepository } from "./auth-user-repository.js";
export { BetterAuthUserRepository } from "./auth-user-repository.js";
export { creditColumn } from "./credit-column.js";
export { schema };
