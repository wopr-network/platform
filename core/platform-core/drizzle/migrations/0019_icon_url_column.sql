-- Add icon_url column to payment_methods.
-- Stores URL for chain/token icon displayed in checkout UI.

ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "icon_url" text;
