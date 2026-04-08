/**
 * Tests for the wopr_agent password bootstrap.
 *
 * The function issues raw DDL (`ALTER ROLE WITH PASSWORD`) which can't be
 * verified end-to-end in PGlite without a real superuser connection. We
 * instead capture the SQL the function tries to run by stubbing the
 * Drizzle `db.execute` call and inspecting the SQL object's payload.
 */

import { describe, expect, it } from "vitest";
import type { DrizzleDb } from "../db/index.js";
import { ensureAgentLoginRolePassword } from "./agent-role-bootstrap.js";

interface CapturedSql {
  text: string;
}

/**
 * Tiny stub Drizzle that captures whatever sql.raw() string was passed to
 * `db.execute`. We pull the raw string out of the SQL object's `queryChunks`
 * because that's where Drizzle stashes literal text from `sql.raw()`.
 */
function makeCapturingDb(): { db: DrizzleDb; captured: CapturedSql[] } {
  const captured: CapturedSql[] = [];
  const db = {
    execute: async (query: unknown) => {
      // sql.raw('foo') returns SQL { queryChunks: [StringChunk { value: 'foo' }] }
      // The shape is internal to Drizzle but stable enough for tests.
      const q = query as { queryChunks?: Array<{ value?: string }> };
      const text = (q.queryChunks ?? []).map((c) => c?.value ?? "").join("");
      captured.push({ text });
      return undefined;
    },
  } as unknown as DrizzleDb;
  return { db, captured };
}

describe("ensureAgentLoginRolePassword", () => {
  it("issues an ALTER ROLE wrapped in a DO block tolerating undefined_object", async () => {
    const { db, captured } = makeCapturingDb();
    await ensureAgentLoginRolePassword(db, "supersecret");
    expect(captured).toHaveLength(1);
    const sql = captured[0].text;
    expect(sql).toMatch(/ALTER ROLE "wopr_agent" WITH PASSWORD/);
    expect(sql).toMatch(/'supersecret'/);
    expect(sql).toMatch(/undefined_object/);
  });

  it("escapes single quotes in the password", async () => {
    const { db, captured } = makeCapturingDb();
    await ensureAgentLoginRolePassword(db, "with'quote");
    expect(captured[0].text).toMatch(/'with''quote'/);
  });

  it("rejects an empty password", async () => {
    const { db } = makeCapturingDb();
    await expect(ensureAgentLoginRolePassword(db, "")).rejects.toThrow(/empty password/);
  });

  it("returns true when execute resolves (regardless of role existence)", async () => {
    const { db } = makeCapturingDb();
    const result = await ensureAgentLoginRolePassword(db, "abc");
    expect(result).toBe(true);
  });
});
