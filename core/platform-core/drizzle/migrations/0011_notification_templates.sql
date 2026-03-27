CREATE TABLE IF NOT EXISTS "notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	CONSTRAINT "notification_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "fleet_updates" boolean DEFAULT true NOT NULL;
