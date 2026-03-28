#!/usr/bin/env node
// Strips "workspace:" prefix from deps so pnpm resolves from npm + lockfile
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const [k, v] of Object.entries(pkg[field] || {})) {
    if (v.startsWith("workspace:")) {
      // workspace:* → *, workspace:^1.0.0 → ^1.0.0
      pkg[field][k] = v.replace("workspace:", "");
    }
  }
}
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
