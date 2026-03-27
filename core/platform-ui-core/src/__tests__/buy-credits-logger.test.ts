import { beforeEach, describe, expect, it, vi } from "vitest";

describe("buy-credits-panel logger usage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should use logger instead of raw console.error", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("src/components/billing/buy-credits-panel.tsx", "utf-8");

    // Must import logger
    expect(source).toContain('import { logger } from "@/lib/logger"');

    // Must NOT have raw console.error
    expect(source).not.toMatch(/console\.error\(/);

    // Must use log.error
    expect(source).toMatch(/log\.error\(/);
  });
});
