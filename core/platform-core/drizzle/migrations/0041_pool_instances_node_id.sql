ALTER TABLE "pool_instances" ADD COLUMN "node_id" text NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE "pool_instances" ALTER COLUMN "node_id" DROP DEFAULT;
--> statement-breakpoint
CREATE INDEX "pool_instances_node_slug_status" ON "pool_instances" ("node_id", "product_slug", "status");
