ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "oracle_address" text;
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "xpub" text;
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_address" = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' WHERE "id" = 'ETH:base';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_address" = '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F' WHERE "id" = 'BTC:mainnet';
--> statement-breakpoint
UPDATE "payment_methods" SET "xpub" = 'xpub6DSVkV7mgEZrnBEmZEq412Cx9sYYZtFvGSb6W9bRDDSikYdpmUiJoNeuechuir63ZjdHQuWBLwchQQnh2GD6DJP6bPKUa1bey1X6XvH9jvM' WHERE "chain" = 'base';
--> statement-breakpoint
UPDATE "payment_methods" SET "xpub" = 'xpub6BuGg4sQuvoA7q545ZoStxU7QP24qmZNMo39FxRjLwbBCQ77sjsHGcpxeNVboGZQNdbeANHVK1GJx7ECMfjohkpLqoGLVP9SCQM4bR1F5vh' WHERE "chain" = 'bitcoin';
