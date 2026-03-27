import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["node_modules", "e2e/**"],
    testTimeout: 15000,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "json-summary"],
      reportOnFailure: true,
    },
  },
});
