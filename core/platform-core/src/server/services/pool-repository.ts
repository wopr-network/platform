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
  productSlug: string | null;
  image: string | null;
}

export interface IPoolRepository {
  getPoolSize(productSlug?: string): Promise<number>;
  setPoolSize(size: number, productSlug?: string): Promise<void>;
  warmCount(productSlug?: string): Promise<number>;
  insertWarm(id: string, containerId: string, productSlug?: string, image?: string): Promise<void>;
  listWarm(productSlug?: string): Promise<PoolInstance[]>;
  markDead(id: string): Promise<void>;
  deleteDead(): Promise<void>;
  claimWarm(tenantId: string, name: string, productSlug?: string): Promise<{ id: string; containerId: string } | null>;
  updateInstanceStatus(id: string, status: string): Promise<void>;
}

export class DrizzlePoolRepository implements IPoolRepository {
  constructor(private pool: Pool) {}

  async getPoolSize(productSlug?: string): Promise<number> {
    try {
      const slug = productSlug ?? "__default__";
      const res = await this.pool.query("SELECT pool_size FROM pool_config WHERE product_slug = $1", [slug]);
      if (res.rows.length === 0) {
        // Fall back to legacy id=1 row for backwards compat
        const legacy = await this.pool.query("SELECT pool_size FROM pool_config WHERE id = 1");
        return legacy.rows[0]?.pool_size ?? 2;
      }
      return res.rows[0].pool_size;
    } catch {
      return 2;
    }
  }

  async setPoolSize(size: number, productSlug?: string): Promise<void> {
    const slug = productSlug ?? "__default__";
    await this.pool.query(
      `INSERT INTO pool_config (id, pool_size, product_slug)
       VALUES (COALESCE((SELECT id FROM pool_config WHERE product_slug = $2), nextval('pool_config_id_seq')), $1, $2)
       ON CONFLICT (product_slug) DO UPDATE SET pool_size = $1`,
      [size, slug],
    );
  }

  async warmCount(productSlug?: string): Promise<number> {
    if (productSlug) {
      const res = await this.pool.query(
        "SELECT COUNT(*)::int AS count FROM pool_instances WHERE status = 'warm' AND product_slug = $1",
        [productSlug],
      );
      return res.rows[0].count;
    }
    const res = await this.pool.query("SELECT COUNT(*)::int AS count FROM pool_instances WHERE status = 'warm'");
    return res.rows[0].count;
  }

  async insertWarm(id: string, containerId: string, productSlug?: string, image?: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO pool_instances (id, container_id, status, product_slug, image) VALUES ($1, $2, 'warm', $3, $4)",
      [id, containerId, productSlug ?? null, image ?? null],
    );
  }

  async listWarm(productSlug?: string): Promise<PoolInstance[]> {
    const sql = productSlug
      ? "SELECT id, container_id, status, tenant_id, name, product_slug, image FROM pool_instances WHERE status = 'warm' AND product_slug = $1"
      : "SELECT id, container_id, status, tenant_id, name, product_slug, image FROM pool_instances WHERE status = 'warm'";
    const res = productSlug ? await this.pool.query(sql, [productSlug]) : await this.pool.query(sql);
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      containerId: r.container_id as string,
      status: r.status as string,
      tenantId: (r.tenant_id as string) ?? null,
      name: (r.name as string) ?? null,
      productSlug: (r.product_slug as string) ?? null,
      image: (r.image as string) ?? null,
    }));
  }

  async markDead(id: string): Promise<void> {
    await this.pool.query("UPDATE pool_instances SET status = 'dead' WHERE id = $1", [id]);
  }

  async deleteDead(): Promise<void> {
    await this.pool.query("DELETE FROM pool_instances WHERE status = 'dead'");
  }

  async claimWarm(
    tenantId: string,
    name: string,
    productSlug?: string,
  ): Promise<{ id: string; containerId: string } | null> {
    const slugFilter = productSlug ? "AND product_slug = $3" : "";
    const params = productSlug ? [tenantId, name, productSlug] : [tenantId, name];
    const res = await this.pool.query(
      `UPDATE pool_instances
          SET status = 'claimed',
              claimed_at = NOW(),
              tenant_id = $1,
              name = $2
        WHERE id = (
          SELECT id FROM pool_instances
           WHERE status = 'warm' ${slugFilter}
           ORDER BY created_at ASC
           LIMIT 1
             FOR UPDATE SKIP LOCKED
        )
        RETURNING id, container_id`,
      params,
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0] as { id: string; container_id: string };
    return { id: row.id, containerId: row.container_id };
  }

  async updateInstanceStatus(id: string, status: string): Promise<void> {
    await this.pool.query("UPDATE pool_instances SET status = $1 WHERE id = $2", [status, id]);
  }
}
