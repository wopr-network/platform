import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../../db/index.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { DrizzleSecretAuditRepository } from "./audit-repository.js";

let db: PlatformDb;
let pool: PGlite;
let repo: DrizzleSecretAuditRepository;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

beforeEach(async () => {
  await truncateAllTables(pool);
  repo = new DrizzleSecretAuditRepository(db);
});

describe("DrizzleSecretAuditRepository", () => {
  const credentialId = "cred-1";

  it("inserts and retrieves audit events", async () => {
    const event = {
      id: randomUUID(),
      credentialId,
      accessedAt: Date.now(),
      accessedBy: "user-1",
      action: "read" as const,
      ip: "127.0.0.1",
    };
    await repo.insert(event);

    const events = await repo.listByCredentialId(credentialId, { limit: 50, offset: 0 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: event.id,
      credentialId,
      accessedBy: "user-1",
      action: "read",
      ip: "127.0.0.1",
    });
  });

  it("counts events by credential ID", async () => {
    for (let i = 0; i < 3; i++) {
      await repo.insert({
        id: randomUUID(),
        credentialId,
        accessedAt: Date.now() + i,
        accessedBy: "user-1",
        action: "read",
        ip: null,
      });
    }
    const count = await repo.countByCredentialId(credentialId);
    expect(count).toBe(3);
  });

  it("paginates results ordered by accessedAt desc", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        id: randomUUID(),
        credentialId,
        accessedAt: 1000 + i,
        accessedBy: "user-1",
        action: "read",
        ip: null,
      });
    }
    const page1 = await repo.listByCredentialId(credentialId, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);
    expect(page1[0]?.accessedAt).toBe(1004); // newest first

    const page2 = await repo.listByCredentialId(credentialId, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
    expect(page2[0]?.accessedAt).toBe(1002);
  });

  it("returns empty for unknown credential", async () => {
    const events = await repo.listByCredentialId("nonexistent", { limit: 50, offset: 0 });
    expect(events).toHaveLength(0);
    const count = await repo.countByCredentialId("nonexistent");
    expect(count).toBe(0);
  });
});
