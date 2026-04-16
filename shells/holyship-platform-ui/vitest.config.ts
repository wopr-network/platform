import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@core": new URL("./node_modules/@wopr-network/platform-ui-core/src", import.meta.url).pathname,
    },
  },
});
