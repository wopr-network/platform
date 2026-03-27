import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe(".env.example", () => {
  const envExample = readFileSync(resolve(root, ".env.example"), "utf-8");

  it("exists and is non-empty", () => {
    expect(envExample.length).toBeGreaterThan(0);
  });

  it("documents NEXT_PUBLIC_API_URL", () => {
    expect(envExample).toContain("NEXT_PUBLIC_API_URL");
  });

  it("provides a default localhost value", () => {
    expect(envExample).toMatch(/NEXT_PUBLIC_API_URL=http:\/\/localhost:3001/);
  });

  it("warns about production requiring a public HTTPS URL", () => {
    expect(envExample).toMatch(/production.*https/i);
  });
});
