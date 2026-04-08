import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // E2E tests spawn child processes + embedded postgres. Default 10s is too tight.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
