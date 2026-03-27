import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema/*.ts", "!./src/db/schema/index.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
});
