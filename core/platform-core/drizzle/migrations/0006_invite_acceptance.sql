ALTER TABLE "organization_invites" ADD COLUMN IF NOT EXISTS "accepted_at" bigint;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD COLUMN IF NOT EXISTS "revoked_at" bigint;