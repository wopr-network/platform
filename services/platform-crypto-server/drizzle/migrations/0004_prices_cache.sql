CREATE TABLE IF NOT EXISTS "prices" (
  "token" text PRIMARY KEY,
  "price_micros" bigint NOT NULL,
  "source" text NOT NULL,
  "updated_at" text NOT NULL DEFAULT (now())
);
