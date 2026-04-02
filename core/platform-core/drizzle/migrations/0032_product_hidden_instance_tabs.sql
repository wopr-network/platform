DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_features' AND column_name = 'hidden_instance_tabs'
  ) THEN
    ALTER TABLE "product_features" ADD COLUMN "hidden_instance_tabs" text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
