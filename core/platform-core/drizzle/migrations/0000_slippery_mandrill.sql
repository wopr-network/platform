CREATE TYPE "public"."promotion_status" AS ENUM('draft', 'scheduled', 'active', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('bonus_on_purchase', 'coupon_fixed', 'coupon_unique', 'batch_grant');--> statement-breakpoint
CREATE TYPE "public"."promotion_user_segment" AS ENUM('all', 'new_users', 'existing_users', 'tenant_list');--> statement-breakpoint
CREATE TYPE "public"."promotion_value_type" AS ENUM('flat_credits', 'percent_of_purchase');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delete_after" text NOT NULL,
	"reason" text,
	"cancel_reason" text,
	"completed_at" text,
	"deletion_summary" text,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_export_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"format" text DEFAULT 'json' NOT NULL,
	"download_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_user" text NOT NULL,
	"action" text NOT NULL,
	"category" text NOT NULL,
	"target_tenant" text,
	"target_user" text,
	"details" text DEFAULT '{}' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"tenant_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"credit_balance_cents" integer DEFAULT 0 NOT NULL,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"last_seen" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "chk_admin_users_status" CHECK ("admin_users"."status" IN ('active', 'suspended', 'grace_period', 'dormant', 'banned')),
	CONSTRAINT "chk_admin_users_role" CHECK ("admin_users"."role" IN ('platform_admin', 'tenant_admin', 'user'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_codes" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	CONSTRAINT "affiliate_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_tenant_id" text NOT NULL,
	"referred_tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"signed_up_at" text DEFAULT (now()) NOT NULL,
	"first_purchase_at" text,
	"match_amount_cents" integer,
	"matched_at" text,
	"payout_suppressed" boolean DEFAULT false NOT NULL,
	"suppression_reason" text,
	"signup_ip" text,
	"signup_email" text,
	CONSTRAINT "affiliate_referrals_referred_tenant_id_unique" UNIQUE("referred_tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_fraud_events" (
	"id" text PRIMARY KEY NOT NULL,
	"referral_id" text NOT NULL,
	"referrer_tenant_id" text NOT NULL,
	"referred_tenant_id" text NOT NULL,
	"verdict" text NOT NULL,
	"signals" text NOT NULL,
	"signal_details" text NOT NULL,
	"phase" text NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupon_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"code" text NOT NULL,
	"assigned_tenant_id" text,
	"assigned_email" text,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_auto_topup" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"payment_reference" text,
	"created_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_auto_topup_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"usage_enabled" boolean DEFAULT false NOT NULL,
	"usage_threshold_cents" integer DEFAULT 100 NOT NULL,
	"usage_topup_cents" integer DEFAULT 500 NOT NULL,
	"usage_consecutive_failures" integer DEFAULT 0 NOT NULL,
	"usage_charge_in_flight" boolean DEFAULT false NOT NULL,
	"schedule_enabled" boolean DEFAULT false NOT NULL,
	"schedule_amount_cents" integer DEFAULT 500 NOT NULL,
	"schedule_interval_hours" integer DEFAULT 168 NOT NULL,
	"schedule_next_at" text,
	"schedule_consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_balances" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"balance_credits" bigint DEFAULT 0 NOT NULL,
	"last_updated" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"amount_credits" bigint NOT NULL,
	"balance_after_credits" bigint NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"reference_id" text,
	"funding_source" text,
	"attributed_user_id" text,
	"created_at" text DEFAULT (now()) NOT NULL,
	"expires_at" text,
	"stripe_fingerprint" text,
	CONSTRAINT "credit_transactions_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dividend_distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"pool_cents" integer NOT NULL,
	"active_users" integer NOT NULL,
	"created_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email_type" text NOT NULL,
	"sent_at" text DEFAULT (now()) NOT NULL,
	"sent_date" text NOT NULL,
	CONSTRAINT "uniq_email_per_day" UNIQUE("tenant_id","email_type","sent_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_period_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"event_count" integer NOT NULL,
	"total_cost" bigint NOT NULL,
	"total_charge" bigint NOT NULL,
	"total_duration" integer DEFAULT 0 NOT NULL,
	"period_start" bigint NOT NULL,
	"period_end" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meter_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text NOT NULL,
	"cost" bigint NOT NULL,
	"charge" bigint NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"timestamp" bigint NOT NULL,
	"session_id" text,
	"duration" integer,
	"usage_units" real,
	"usage_unit_type" text,
	"tier" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"event_count" integer NOT NULL,
	"total_cost" bigint NOT NULL,
	"total_charge" bigint NOT NULL,
	"total_duration" integer DEFAULT 0 NOT NULL,
	"window_start" bigint NOT NULL,
	"window_end" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"billing_low_balance" boolean DEFAULT true NOT NULL,
	"billing_receipts" boolean DEFAULT true NOT NULL,
	"billing_auto_topup" boolean DEFAULT true NOT NULL,
	"agent_channel_disconnect" boolean DEFAULT true NOT NULL,
	"agent_status_changes" boolean DEFAULT false NOT NULL,
	"account_role_changes" boolean DEFAULT true NOT NULL,
	"account_team_invites" boolean DEFAULT true NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email_type" text NOT NULL,
	"recipient_email" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" bigint,
	"last_error" text,
	"retry_after" bigint,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"sent_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_memberships" (
	"org_tenant_id" text NOT NULL,
	"member_tenant_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "org_memberships_org_tenant_id_member_tenant_id_pk" PRIMARY KEY("org_tenant_id","member_tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "organization_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payram_charges" (
	"reference_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"currency" text,
	"filled_amount" text,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL,
	"credited_at" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"roles" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"expires_at" bigint,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"coupon_code_id" uuid,
	"credits_granted" integer NOT NULL,
	"credit_transaction_id" text NOT NULL,
	"purchase_amount_credits" integer,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "promotion_type" NOT NULL,
	"status" "promotion_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"value_type" "promotion_value_type" NOT NULL,
	"value_amount" integer NOT NULL,
	"max_value_credits" integer,
	"first_purchase_only" boolean DEFAULT false NOT NULL,
	"min_purchase_credits" integer,
	"user_segment" "promotion_user_segment" DEFAULT 'all' NOT NULL,
	"eligible_tenant_ids" text[],
	"total_use_limit" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"budget_credits" integer,
	"total_uses" integer DEFAULT 0 NOT NULL,
	"total_credits_granted" integer DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"coupon_batch_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "promotions_coupon_code_unique" UNIQUE("coupon_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"key_name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"auth_type" text NOT NULL,
	"auth_header" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_validated" text,
	"created_at" text DEFAULT (now()) NOT NULL,
	"rotated_at" text,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_entries" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" bigint NOT NULL,
	CONSTRAINT "rate_limit_entries_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secret_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"accessed_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"accessed_by" text NOT NULL,
	"action" text NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"page" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_spending_limits" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"global_alert_at" real,
	"global_hard_cap" real,
	"per_capability_json" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_addons" (
	"tenant_id" text NOT NULL,
	"addon_key" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_addons_tenant_id_addon_key_pk" PRIMARY KEY("tenant_id","addon_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_capability_settings" (
	"tenant_id" text NOT NULL,
	"capability" text NOT NULL,
	"mode" text DEFAULT 'hosted' NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "tenant_capability_settings_tenant_id_capability_pk" PRIMARY KEY("tenant_id","capability")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_usage_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant" text NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"period_start" bigint NOT NULL,
	"period_end" bigint NOT NULL,
	"event_name" text NOT NULL,
	"value_cents" integer NOT NULL,
	"reported_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_customers" (
	"tenant" text PRIMARY KEY NOT NULL,
	"processor_customer_id" text NOT NULL,
	"processor" text DEFAULT 'stripe' NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"billing_hold" integer DEFAULT 0 NOT NULL,
	"inference_mode" text DEFAULT 'byok' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "tenant_customers_processor_customer_id_unique" UNIQUE("processor_customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"type" text NOT NULL,
	"owner_id" text NOT NULL,
	"billing_email" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chk_tenants_type" CHECK ("tenants"."type" IN ('personal', 'org'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_by" text,
	"granted_at" bigint NOT NULL,
	CONSTRAINT "user_roles_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_seen_events" (
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"seen_at" bigint NOT NULL,
	CONSTRAINT "webhook_seen_events_event_id_source_pk" PRIMARY KEY("event_id","source")
);
--> statement-breakpoint
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_coupon_code_id_coupon_codes_id_fk" FOREIGN KEY ("coupon_code_id") REFERENCES "public"."coupon_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acct_del_tenant" ON "account_deletion_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acct_del_status" ON "account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acct_del_delete_after" ON "account_deletion_requests" USING btree ("status","delete_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acct_export_tenant" ON "account_export_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_acct_export_status" ON "account_export_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_admin" ON "admin_audit_log" USING btree ("admin_user","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_tenant" ON "admin_audit_log" USING btree ("target_tenant","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_audit_action" ON "admin_audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_email" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_tenant" ON "admin_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_status" ON "admin_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_role" ON "admin_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_created" ON "admin_users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admin_users_last_seen" ON "admin_users" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_affiliate_ref_referrer" ON "affiliate_referrals" USING btree ("referrer_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_affiliate_ref_code" ON "affiliate_referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fraud_referrer" ON "affiliate_fraud_events" USING btree ("referrer_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fraud_referred" ON "affiliate_fraud_events" USING btree ("referred_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fraud_verdict" ON "affiliate_fraud_events" USING btree ("verdict");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_fraud_referral_phase" ON "affiliate_fraud_events" USING btree ("referral_id","phase");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_codes_promotion_idx" ON "coupon_codes" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_codes_assigned_tenant_idx" ON "coupon_codes" USING btree ("assigned_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_tenant" ON "credit_auto_topup" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_status" ON "credit_auto_topup" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_created" ON "credit_auto_topup" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_tenant_created" ON "credit_auto_topup" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_settings_usage" ON "credit_auto_topup_settings" USING btree ("usage_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auto_topup_settings_schedule" ON "credit_auto_topup_settings" USING btree ("schedule_enabled","schedule_next_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_tenant" ON "credit_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_type" ON "credit_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_ref" ON "credit_transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_created" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_tenant_created" ON "credit_transactions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_expires" ON "credit_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_tx_fingerprint" ON "credit_transactions" USING btree ("stripe_fingerprint") WHERE "credit_transactions"."stripe_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dividend_dist_tenant" ON "dividend_distributions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dividend_dist_date" ON "dividend_distributions" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dividend_dist_tenant_date" ON "dividend_distributions" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_notif_tenant" ON "email_notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_notif_type" ON "email_notifications" USING btree ("email_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_billing_period_unique" ON "billing_period_summaries" USING btree ("tenant","capability","provider","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_period_tenant" ON "billing_period_summaries" USING btree ("tenant","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_period_window" ON "billing_period_summaries" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_tenant" ON "meter_events" USING btree ("tenant");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_timestamp" ON "meter_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_capability" ON "meter_events" USING btree ("capability");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_session" ON "meter_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_tenant_timestamp" ON "meter_events" USING btree ("tenant","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_meter_tier" ON "meter_events" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_summary_tenant" ON "usage_summaries" USING btree ("tenant","window_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_summary_window" ON "usage_summaries" USING btree ("window_start","window_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_queue_tenant" ON "notification_queue" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_queue_status" ON "notification_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_queue_type" ON "notification_queue" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_queue_retry" ON "notification_queue" USING btree ("status","retry_after");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_org_memberships_member_unique" ON "org_memberships" USING btree ("member_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_memberships_org" ON "org_memberships" USING btree ("org_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_invites_org_id" ON "organization_invites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_invites_token" ON "organization_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_members_org_id" ON "organization_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_org_members_user_id" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_members_org_user_unique" ON "organization_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payram_charges_tenant" ON "payram_charges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payram_charges_status" ON "payram_charges" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payram_charges_created" ON "payram_charges" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_platform_api_keys_hash" ON "platform_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_api_keys_user" ON "platform_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotion_redemptions_promotion_idx" ON "promotion_redemptions" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotion_redemptions_tenant_idx" ON "promotion_redemptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotions_status_idx" ON "promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotions_coupon_code_idx" ON "promotions" USING btree ("coupon_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_creds_provider" ON "provider_credentials" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_creds_active" ON "provider_credentials" USING btree ("provider","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_creds_created_by" ON "provider_credentials" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rate_limit_window" ON "rate_limit_entries" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_secret_audit_credential" ON "secret_audit_log" USING btree ("credential_id","accessed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_secret_audit_accessed_by" ON "secret_audit_log" USING btree ("accessed_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_usage_session" ON "session_usage" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_usage_user" ON "session_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_usage_created" ON "session_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_usage_page" ON "session_usage" USING btree ("page");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_addons_tenant" ON "tenant_addons" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_keys_tenant_provider" ON "tenant_api_keys" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_keys_tenant" ON "tenant_api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_keys_provider" ON "tenant_api_keys" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stripe_usage_unique" ON "stripe_usage_reports" USING btree ("tenant","capability","provider","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_usage_tenant" ON "stripe_usage_reports" USING btree ("tenant","reported_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_customers_processor" ON "tenant_customers" USING btree ("processor_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_owner" ON "tenants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_type" ON "tenants" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_roles_tenant" ON "user_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_roles_role" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_seen_expires" ON "webhook_seen_events" USING btree ("seen_at");