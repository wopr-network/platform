// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // CLI tests spawn child processes + filesystem setup. Default 5s is too tight on slower
    // machines (CI, WSL2, etc.). Match platform sync baseline from wopr-network/platform#45.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Creates a transient `.git` dir at the sidecar root so install-preflight's
    // `is_source_checkout` detection works when run from inside the platform monorepo
    // (where the real .git lives at the platform root, not here).
    globalSetup: ["./test/vitest-global-setup.js"],
    projects: [
      {
        test: {
          name: "cli",
          include: ["test/**/*.test.{js,ts}", "src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/.claude/**", "test/e2e/**"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "plugin",
          include: ["nemoclaw/src/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: "e2e-brev",
          include: ["test/e2e/brev-e2e.test.js"],
          // Only run when explicitly targeted: npx vitest run --project e2e-brev
          enabled: !!process.env.BREV_API_TOKEN,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["nemoclaw/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
