import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@core": resolve(__dirname, "./node_modules/@wopr-network/platform-ui-core/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    exclude: ["node_modules"],
    testTimeout: 15000,
  },
});
