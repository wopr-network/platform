-- Double-entry ledger: accounts, journal_entries, journal_lines, account_balances
-- Replaces single-entry credit_transactions + credit_balances

DO $$ BEGIN
  CREATE TYPE "public"."account_type" AS ENUM('asset','liability','equity','revenue','expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."entry_side" AS ENUM('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"normal_side" "entry_side" NOT NULL,
	"tenant_id" text,
	"created_at" text DEFAULT (now()) NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"posted_at" text DEFAULT (now()) NOT NULL,
	"entry_type" text NOT NULL,
	"description" text,
	"reference_id" text,
	"tenant_id" text NOT NULL,
	"metadata" jsonb,
	"created_by" text
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_entry_id" text NOT NULL REFERENCES "journal_entries"("id"),
	"account_id" text NOT NULL REFERENCES "accounts"("id"),
	"amount" bigint NOT NULL,
	"side" "entry_side" NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_balances" (
	"account_id" text PRIMARY KEY NOT NULL REFERENCES "accounts"("id"),
	"balance" bigint DEFAULT 0 NOT NULL,
	"last_updated" text DEFAULT (now()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_accounts_code" ON "accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_tenant" ON "accounts" USING btree ("tenant_id") WHERE "tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_type" ON "accounts" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_je_reference" ON "journal_entries" USING btree ("reference_id") WHERE "reference_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_je_tenant" ON "journal_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_je_type" ON "journal_entries" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_je_posted" ON "journal_entries" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_je_tenant_posted" ON "journal_entries" USING btree ("tenant_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jl_entry" ON "journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jl_account" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jl_account_side" ON "journal_lines" USING btree ("account_id","side");--> statement-breakpoint

-- Seed system accounts
INSERT INTO "accounts" ("id", "code", "name", "type", "normal_side") VALUES
  (gen_random_uuid(), '1000', 'Cash', 'asset', 'debit'),
  (gen_random_uuid(), '1100', 'Stripe Receivable', 'asset', 'debit'),
  (gen_random_uuid(), '3000', 'Retained Earnings', 'equity', 'credit'),
  (gen_random_uuid(), '4000', 'Revenue: Bot Runtime', 'revenue', 'credit'),
  (gen_random_uuid(), '4010', 'Revenue: Adapter Usage', 'revenue', 'credit'),
  (gen_random_uuid(), '4020', 'Revenue: Addon', 'revenue', 'credit'),
  (gen_random_uuid(), '4030', 'Revenue: Storage Upgrade', 'revenue', 'credit'),
  (gen_random_uuid(), '4040', 'Revenue: Resource Upgrade', 'revenue', 'credit'),
  (gen_random_uuid(), '4050', 'Revenue: Onboarding LLM', 'revenue', 'credit'),
  (gen_random_uuid(), '4060', 'Revenue: Expired Credits', 'revenue', 'credit'),
  (gen_random_uuid(), '5000', 'Expense: Signup Grant', 'expense', 'debit'),
  (gen_random_uuid(), '5010', 'Expense: Admin Grant', 'expense', 'debit'),
  (gen_random_uuid(), '5020', 'Expense: Promo', 'expense', 'debit'),
  (gen_random_uuid(), '5030', 'Expense: Referral', 'expense', 'debit'),
  (gen_random_uuid(), '5040', 'Expense: Affiliate', 'expense', 'debit'),
  (gen_random_uuid(), '5050', 'Expense: Bounty', 'expense', 'debit'),
  (gen_random_uuid(), '5060', 'Expense: Dividend', 'expense', 'debit'),
  (gen_random_uuid(), '5070', 'Expense: Correction', 'expense', 'debit');--> statement-breakpoint

-- Initialize balance rows for all seeded system accounts
INSERT INTO "account_balances" ("account_id", "balance")
  SELECT "id", 0 FROM "accounts";--> statement-breakpoint

-- Drop old single-entry tables
DROP TABLE IF EXISTS "credit_transactions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "credit_balances" CASCADE;
