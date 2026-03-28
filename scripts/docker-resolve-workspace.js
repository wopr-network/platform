#!/usr/bin/env node
// Replaces workspace:* deps with * for standalone Docker builds
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const [k, v] of Object.entries(pkg[field] || {})) {
    if (v.startsWith("workspace:")) pkg[field][k] = "*";
  }
}
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
