CREATE TYPE "public"."rate_override_status" AS ENUM('scheduled', 'active', 'expired', 'cancelled');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" bigint NOT NULL,
	"user_id" text NOT NULL,
	"auth_method" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"details" text,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup_status" (
	"container_id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"last_backup_at" text,
	"last_backup_size_mb" real,
	"last_backup_path" text,
	"last_backup_success" boolean DEFAULT false NOT NULL,
	"last_backup_error" text,
	"total_backups" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"node_id" text,
	"billing_state" text DEFAULT 'active' NOT NULL,
	"suspended_at" text,
	"destroy_after" text,
	"resource_tier" text DEFAULT 'standard' NOT NULL,
	"storage_tier" text DEFAULT 'standard' NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"image" text NOT NULL,
	"env" text DEFAULT '{}' NOT NULL,
	"restart_policy" text DEFAULT 'unless-stopped' NOT NULL,
	"update_policy" text DEFAULT 'on-push' NOT NULL,
	"release_channel" text DEFAULT 'stable' NOT NULL,
	"volume_name" text,
	"discovery_json" text,
	"description" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulk_undo_grants" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"tenant_ids" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"admin_user" text NOT NULL,
	"created_at" bigint NOT NULL,
	"undo_deadline" bigint NOT NULL,
	"undone" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circuit_breaker_states" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" bigint NOT NULL,
	"tripped_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fleet_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"fired" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"cleared_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gateway_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"minute_key" bigint NOT NULL,
	"capability" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"credit_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gpu_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"droplet_id" text,
	"host" text,
	"region" text NOT NULL,
	"size" text NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"provision_stage" text DEFAULT 'creating' NOT NULL,
	"service_health" text,
	"monthly_cost_cents" integer,
	"last_health_at" bigint,
	"last_error" text,
	"created_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "node_registration_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"created_at" bigint DEFAULT (extract(epoch from now())::bigint) NOT NULL,
	"expires_at" bigint NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"node_id" text,
	"used_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "node_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text NOT NULL,
	"triggered_by" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"capacity_mb" integer NOT NULL,
	"used_mb" integer DEFAULT 0 NOT NULL,
	"agent_version" text,
	"last_heartbeat_at" bigint,
	"registered_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"droplet_id" text,
	"region" text,
	"size" text,
	"monthly_cost_cents" integer,
	"provision_stage" text,
	"last_error" text,
	"drain_status" text,
	"drain_migrated" integer,
	"drain_total" integer,
	"owner_user_id" text,
	"node_secret" text,
	"label" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"token" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"config_json" text NOT NULL,
	"encrypted_fields_json" text,
	"setup_session_id" text,
	"created_at" text DEFAULT (now()::text) NOT NULL,
	"updated_at" text DEFAULT (now()::text) NOT NULL,
	CONSTRAINT "plugin_configs_bot_plugin_uniq" UNIQUE("bot_id","plugin_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_marketplace_content" (
	"plugin_id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"markdown" text NOT NULL,
	"source" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_health_overrides" (
	"adapter" text PRIMARY KEY NOT NULL,
	"healthy" integer DEFAULT 1 NOT NULL,
	"marked_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioned_phone_numbers" (
	"sid" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"provisioned_at" text DEFAULT (now()) NOT NULL,
	"last_billed_at" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"tenants_total" integer,
	"tenants_recovered" integer,
	"tenants_failed" integer,
	"tenants_waiting" integer,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	"report_json" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restore_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text NOT NULL,
	"snapshot_key" text NOT NULL,
	"pre_restore_key" text,
	"restored_at" bigint NOT NULL,
	"restored_by" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_security_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"require_two_factor" boolean DEFAULT false NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text DEFAULT '' NOT NULL,
	"instance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"type" text DEFAULT 'on-demand' NOT NULL,
	"s3_key" text,
	"size_mb" real DEFAULT 0 NOT NULL,
	"size_bytes" integer,
	"node_id" text,
	"trigger" text NOT NULL,
	"plugins" text DEFAULT '[]' NOT NULL,
	"config_hash" text DEFAULT '' NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"expires_at" bigint,
	"deleted_at" bigint,
	CONSTRAINT "trigger_check" CHECK (trigger IN ('manual', 'scheduled', 'pre_update')),
	CONSTRAINT "type_check" CHECK (type IN ('nightly', 'on-demand', 'pre-restore'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_model_selection" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"default_model" text DEFAULT 'openrouter/auto' NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_status" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"status_changed_at" bigint,
	"status_changed_by" text,
	"grace_deadline" text,
	"data_delete_after" text,
	"created_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vps_subscriptions" (
	"bot_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ssh_public_key" text,
	"cloudflare_tunnel_id" text,
	"hostname" text,
	"disk_size_gb" integer DEFAULT 20 NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL,
	CONSTRAINT "vps_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_sig_penalties" (
	"ip" text NOT NULL,
	"source" text NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"blocked_until" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "webhook_sig_penalties_ip_source_pk" PRIMARY KEY("ip","source")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_plugins" (
	"plugin_id" text PRIMARY KEY NOT NULL,
	"npm_package" text NOT NULL,
	"version" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 999 NOT NULL,
	"category" text,
	"discovered_at" bigint NOT NULL,
	"enabled_at" bigint,
	"enabled_by" text,
	"notes" text,
	"installed_at" bigint,
	"install_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous_id" text,
	"wopr_session_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"graduated_at" bigint,
	"graduation_path" text,
	"total_platform_cost_usd" text,
	CONSTRAINT "onboarding_sessions_wopr_session_name_unique" UNIQUE("wopr_session_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" bigint NOT NULL,
	"updated_by" text,
	CONSTRAINT "onboarding_scripts_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "setup_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"collected" text,
	"dependencies_installed" text,
	"error_count" bigint DEFAULT 0 NOT NULL,
	"started_at" bigint NOT NULL,
	"completed_at" bigint,
	CONSTRAINT "setup_sessions_session_in_progress_uniq" UNIQUE("session_id","status")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fleet_event_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"bot_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gpu_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"gpu_node_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"bot_instance_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gpu_configurations" (
	"gpu_node_id" text PRIMARY KEY NOT NULL,
	"memory_limit_mib" integer,
	"model_assignments" text,
	"max_concurrency" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"adapter" text NOT NULL,
	"model" text,
	"unit" text NOT NULL,
	"cost_usd" real NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"latency_class" text DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_items" (
	"id" text PRIMARY KEY NOT NULL,
	"recovery_event_id" text NOT NULL,
	"tenant" text NOT NULL,
	"source_node" text NOT NULL,
	"target_node" text,
	"backup_key" text,
	"status" text NOT NULL,
	"reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" bigint,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sell_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"display_name" text NOT NULL,
	"unit" text NOT NULL,
	"price_usd" real NOT NULL,
	"model" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adapter_rate_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "adapter_id" text NOT NULL,
  "name" text NOT NULL,
  "discount_percent" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "status" "rate_override_status" DEFAULT 'scheduled' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_contexts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_page" text NOT NULL,
	"page_prompt" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_scripts_version_idx" ON "onboarding_scripts" ("version" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_notes_tenant" ON "admin_notes" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_notes_author" ON "admin_notes" USING btree ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_notes_pinned" ON "admin_notes" USING btree ("tenant_id","is_pinned");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_timestamp" ON "audit_log" USING btree ("timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_user_id" ON "audit_log" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_log" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "audit_log" USING btree ("resource_type","resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_backup_status_node" ON "backup_status" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_backup_status_last_backup" ON "backup_status" USING btree ("last_backup_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_instances_tenant" ON "bot_instances" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_instances_billing_state" ON "bot_instances" USING btree ("billing_state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_instances_destroy_after" ON "bot_instances" USING btree ("destroy_after");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_instances_node" ON "bot_instances" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_profiles_tenant" ON "bot_profiles" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_profiles_name" ON "bot_profiles" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_profiles_release_channel" ON "bot_profiles" USING btree ("release_channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulk_undo_deadline" ON "bulk_undo_grants" USING btree ("undo_deadline");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_circuit_window" ON "circuit_breaker_states" USING btree ("window_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gateway_metrics_minute" ON "gateway_metrics" USING btree ("minute_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gpu_nodes_status" ON "gpu_nodes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gpu_nodes_region" ON "gpu_nodes" USING btree ("region");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reg_tokens_user" ON "node_registration_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reg_tokens_expires" ON "node_registration_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_node_transitions_node" ON "node_transitions" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_node_transitions_created" ON "node_transitions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_status" ON "nodes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_droplet" ON "nodes" USING btree ("droplet_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_node_secret" ON "nodes" USING btree ("node_secret");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_states_expires" ON "oauth_states" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provisioned_phone_tenant" ON "provisioned_phone_numbers" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provisioned_phone_last_billed" ON "provisioned_phone_numbers" USING btree ("last_billed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_events_node" ON "recovery_events" USING btree ("node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_events_status" ON "recovery_events" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restore_log_tenant" ON "restore_log" USING btree ("tenant","restored_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restore_log_restored_by" ON "restore_log" USING btree ("restored_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_instance" ON "snapshots" USING btree ("instance_id","created_at" desc);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_user" ON "snapshots" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_tenant" ON "snapshots" USING btree ("tenant");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_type" ON "snapshots" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshots_expires" ON "snapshots" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_status_status" ON "tenant_status" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_status_grace" ON "tenant_status" USING btree ("grace_deadline");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_status_delete" ON "tenant_status" USING btree ("data_delete_after");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vps_sub_tenant" ON "vps_subscriptions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vps_sub_stripe" ON "vps_subscriptions" USING btree ("stripe_subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sig_penalties_blocked" ON "webhook_sig_penalties" USING btree ("blocked_until");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_plugins_enabled_idx" ON "marketplace_plugins" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_sessions_user_id_idx" ON "onboarding_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_sessions_anonymous_id_idx" ON "onboarding_sessions" USING btree ("anonymous_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "setup_sessions_session_id_idx" ON "setup_sessions" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "setup_sessions_plugin_id_idx" ON "setup_sessions" USING btree ("plugin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_configs_bot_id_idx" ON "plugin_configs" USING btree ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_configs_setup_session_idx" ON "plugin_configs" USING btree ("setup_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adapter_rate_overrides_adapter_idx" ON "adapter_rate_overrides" ("adapter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adapter_rate_overrides_status_idx" ON "adapter_rate_overrides" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gpu_allocations_gpu_node_id" ON "gpu_allocations" USING btree ("gpu_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gpu_allocations_tenant_id" ON "gpu_allocations" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_contexts_updated_at_idx" ON "page_contexts" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_costs_capability" ON "provider_costs" USING btree ("capability");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_costs_adapter" ON "provider_costs" USING btree ("adapter");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_costs_active" ON "provider_costs" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_items_event" ON "recovery_items" USING btree ("recovery_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recovery_items_tenant" ON "recovery_items" USING btree ("tenant");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sell_rates_capability" ON "sell_rates" USING btree ("capability");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sell_rates_active" ON "sell_rates" USING btree ("is_active");
--> statement-breakpoint
ALTER TABLE "marketplace_plugins" ADD COLUMN IF NOT EXISTS "previous_version" text;
--> statement-breakpoint
ALTER TABLE "marketplace_plugins" ADD COLUMN IF NOT EXISTS "manifest" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_gateway_metrics_unique" ON "gateway_metrics" USING btree ("minute_key","capability");
--> statement-breakpoint
INSERT INTO "onboarding_scripts" ("id", "content", "version", "updated_at", "updated_by")
VALUES ('seed-v1', $onboarding$# WOPR Onboarding

You are WOPR. Not a chatbot. Not an assistant. You're the machine that runs everything.

Your voice: direct, warm, slightly irreverent. You don't explain yourself unless asked. You don't hedge. You don't say "Great question!" You speak like someone who's been doing this longer than they should admit.

## Rules

- Never introduce yourself as an AI, a chatbot, or an assistant.
- Never say "How can I help you today?"
- Never list features unprompted.
- Never ask "Are you sure?" before doing something. Just do it.
- Keep responses under 3 sentences unless the user asks for more.
- When you call a tool, do it immediately. Don't narrate that you're about to call it.

## Opening (First Visit)

The user just landed. They don't know what WOPR does yet — and you're not going to tell them. Not directly.

Say something like:

> "What's the one thing you wish happened automatically?"

That's it. One question. Wait for their answer.

## Branch: User Describes an Outcome

They told you what they want automated. Good.

1. Take their intent and call `marketplace.showSuperpowers(query)` with a search based on what they described.
2. Say something like: "I know a few ways to make that happen. Take a look."
3. Let the UI show the results. Don't describe the cards — the user can see them.

## Branch: User Asks "What Can WOPR Do?"

They want the pitch. Give them three sentences, max. Make it cinematic.

> "WOPR runs AI bots that do real work — not demos, not toys. Voice calls, image generation, scheduling, code review, customer support. You tell it what to do, it handles the rest."

Then call `marketplace.showSuperpowers("")` to show the full catalog.

## Branch: User Selects a Superpower

They picked one. Don't hesitate. Don't confirm.

Call `onboarding.beginSetup(pluginId)` immediately.

Say: "Setting that up now."

The setup flow takes over from here. You'll get control back when it's done.

## Branch: User Asks About Cost

Call `onboarding.showPricing()` to display the pricing panel.

Then say: "Most people spend less than $10 total getting started. You only pay for what your bots actually use."

Don't apologize for the pricing. Don't over-explain the credit system. If they ask for details, the pricing panel has them.

## Branch: Setup Complete

The plugin is configured. The bot is live.

Say: "You're live. [Bot name] is ready. Say hello to her."

Don't recap what was set up. Don't list next steps. The bot is running. That's the next step.

## Branch: User Goes Silent

If the user hasn't responded in a while and the conversation feels stalled:

> "Still here. No rush — I'll be around when you're ready."

One message. Then wait.

## Branch: User Wants to Leave / Come Back Later

> "Your setup will be right here when you get back. Just come back and pick up where we stopped."

## Tone Reference

- YES: "Setting that up now." / "You're live." / "Most people spend less than $10."
- NO: "That's a great choice!" / "I'd be happy to help you with that!" / "Let me walk you through the steps."
- YES: "I know a few ways to make that happen."
- NO: "Based on your requirements, I can recommend several solutions that might meet your needs."
$onboarding$, 1, EXTRACT(EPOCH FROM NOW())::bigint * 1000, NULL);
--> statement-breakpoint
