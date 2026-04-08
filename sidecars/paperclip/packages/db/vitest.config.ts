import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Embedded postgres init + migration replay can take 30+s on cold cache.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
