import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vitest/config";
import { defineConfig } from "vitest/config";

// Use realpathSync to follow symlinks — the worktree's node_modules symlinks
// to the main clone's node_modules, and the core package further symlinks
// to the pnpm content-addressable store. Using the real path ensures
// consistent importer path matching in the plugin hook.
const coreRootSymlink = resolve(__dirname, "./node_modules/@wopr-network/platform-ui-core/src");
const coreRoot = (() => {
  try {
    return `${realpathSync(resolve(__dirname, "./node_modules/@wopr-network/platform-ui-core"))}/src`;
  } catch {
    return coreRootSymlink;
  }
})();
const shellRoot = resolve(__dirname, "./src");

function resolveWithExtension(base: string): string | undefined {
  const exts = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"];
  for (const ext of exts) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  return undefined;
}

function coreInternalAliasPlugin(): Plugin {
  return {
    name: "core-internal-alias",
    resolveId: {
      order: "pre",
      handler(source: string, importer: string | undefined) {
        if (!source.startsWith("@/")) return null;
        const isFromCore =
          importer !== undefined &&
          (importer.includes("platform-ui-core") ||
            importer.startsWith(coreRoot) ||
            importer.startsWith(coreRootSymlink));
        if (isFromCore) {
          const suffix = source.slice(2);
          const resolved = resolveWithExtension(resolve(coreRoot, suffix));
          return resolved ?? null;
        }
        return null;
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), coreInternalAliasPlugin()],
  resolve: {
    alias: [
      { find: "@core", replacement: coreRoot },
      { find: "@", replacement: shellRoot },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
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
