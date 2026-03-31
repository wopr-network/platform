-- Leader lease table for singleton leader election
CREATE TABLE IF NOT EXISTS "leader_lease" (
	"id" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"heartbeat_at" bigint NOT NULL
);
--> statement-breakpoint
-- Fleet node Docker connection columns
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "docker_url" text;
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "max_containers" integer;
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "use_container_names" integer;
