import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@wopr-network/platform-core/billing": resolve(__dirname, "src/billing/index.ts"),
      "@wopr-network/platform-core/credits": resolve(__dirname, "src/credits/index.ts"),
      "@wopr-network/platform-core/email": resolve(__dirname, "src/email/index.ts"),
      "@wopr-network/platform-core/metering": resolve(__dirname, "src/metering/index.ts"),
    },
  },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
    },
  },
});
