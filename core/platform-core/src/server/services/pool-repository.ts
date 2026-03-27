/**
 * Repository for hot pool database operations.
 *
 * Encapsulates all pool_config and pool_instances queries behind
 * a testable interface. No raw pool.query() outside this file.
 */

import type { Pool } from "pg";

export interface PoolInstance {
  id: string;
  containerId: string;
  status: string;
  tenantId: string | null;
  name: string | null;
}

export interface IPoolRepository {
  getPoolSize(): Promise<number>;
  setPoolSize(size: number): Promise<void>;
  warmCount(): Promise<number>;
  insertWarm(id: string, containerId: string): Promise<void>;
  listWarm(): Promise<PoolInstance[]>;
  markDead(id: string): Promise<void>;
  deleteDead(): Promise<void>;
  claimWarm(tenantId: string, name: string): Promise<{ id: string; containerId: string } | null>;
  updateInstanceStatus(id: string, status: string): Promise<void>;
}

export class DrizzlePoolRepository implements IPoolRepository {
  constructor(private pool: Pool) {}

  async getPoolSize(): Promise<number> {
    try {
      const res = await this.pool.query("SELECT pool_size FROM pool_config WHERE id = 1");
      return res.rows[0]?.pool_size ?? 2;
    } catch {
      return 2;
    }
  }

  async setPoolSize(size: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO pool_config (id, pool_size) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET pool_size = $1",
      [size],
    );
  }

  async warmCount(): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*)::int AS count FROM pool_instances WHERE status = 'warm'");
    return res.rows[0].count;
  }

  async insertWarm(id: string, containerId: string): Promise<void> {
    await this.pool.query("INSERT INTO pool_instances (id, container_id, status) VALUES ($1, $2, 'warm')", [
      id,
      containerId,
    ]);
  }

  async listWarm(): Promise<PoolInstance[]> {
    const res = await this.pool.query(
      "SELECT id, container_id, status, tenant_id, name FROM pool_instances WHERE status = 'warm'",
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      containerId: r.container_id as string,
      status: r.status as string,
      tenantId: (r.tenant_id as string) ?? null,
      name: (r.name as string) ?? null,
    }));
  }

  async markDead(id: string): Promise<void> {
    await this.pool.query("UPDATE pool_instances SET status = 'dead' WHERE id = $1", [id]);
  }

  async deleteDead(): Promise<void> {
    await this.pool.query("DELETE FROM pool_instances WHERE status = 'dead'");
  }

  async claimWarm(tenantId: string, name: string): Promise<{ id: string; containerId: string } | null> {
    const res = await this.pool.query(
      `UPDATE pool_instances
          SET status = 'claimed',
              claimed_at = NOW(),
              tenant_id = $1,
              name = $2
        WHERE id = (
          SELECT id FROM pool_instances
           WHERE status = 'warm'
           ORDER BY created_at ASC
           LIMIT 1
             FOR UPDATE SKIP LOCKED
        )
        RETURNING id, container_id`,
      [tenantId, name],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0] as { id: string; container_id: string };
    return { id: row.id, containerId: row.container_id };
  }

  async updateInstanceStatus(id: string, status: string): Promise<void> {
    await this.pool.query("UPDATE pool_instances SET status = $1 WHERE id = $2", [status, id]);
  }
}
