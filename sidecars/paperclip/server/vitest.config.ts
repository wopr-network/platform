import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Embedded postgres init can take 30+s on cold cache. Default 10s is too tight.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
