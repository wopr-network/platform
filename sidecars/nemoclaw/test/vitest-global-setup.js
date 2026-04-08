// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// Local-only setup for the vendored nemoclaw copy inside wopr-network/platform.
// install-preflight.test.js and related tests call `is_source_checkout()` which
// requires `.git` to exist at the sidecar root OR `NEMOCLAW_REPO_ROOT` to be set.
// Inside the platform monorepo, `.git` lives at the platform root (not here), so
// we create a transient `.git` directory before the test suite runs, then remove
// it in teardown so it doesn't leak into subsequent installs or the package
// `prepare` hook (which conditionally installs git hooks when `.git` exists).

import fs from "node:fs";
import path from "node:path";

export default function setup() {
  const sidecarRoot = path.resolve(import.meta.dirname, "..");
  const fakeGit = path.join(sidecarRoot, ".git");
  const created = !fs.existsSync(fakeGit);
  if (created) {
    fs.mkdirSync(fakeGit, { recursive: true });
  }
  // Teardown: remove the fake .git dir if (and only if) we created it.
  return () => {
    if (!created) return;
    try {
      // Only remove if still empty — don't blow away a real .git anyone happened to create.
      const entries = fs.readdirSync(fakeGit);
      if (entries.length === 0) {
        fs.rmdirSync(fakeGit);
      }
    } catch {
      /* best effort */
    }
  };
}
