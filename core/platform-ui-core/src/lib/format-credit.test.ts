import { describe, expect, it } from "vitest";
import { formatCreditDetailed, formatCreditStandard } from "./format-credit";

describe("formatCreditStandard", () => {
  it("formats whole dollars with 2 decimal places", () => {
    expect(formatCreditStandard(5)).toBe("$5.00");
  });

  it("formats fractional dollars", () => {
    expect(formatCreditStandard(1.5)).toBe("$1.50");
  });

  it("formats zero", () => {
    expect(formatCreditStandard(0)).toBe("$0.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatCreditStandard(1.999)).toBe("$2.00");
  });

  it("formats large values", () => {
    expect(formatCreditStandard(1000)).toBe("$1000.00");
  });

  it("formats small fractional values", () => {
    expect(formatCreditStandard(0.01)).toBe("$0.01");
  });
});

describe("formatCreditDetailed", () => {
  it("formats standard 2-decimal values", () => {
    expect(formatCreditDetailed(1.23)).toBe("$1.23");
  });

  it("preserves nanodollar precision", () => {
    expect(formatCreditDetailed(0.000001)).toBe("$0.000001");
  });

  it("trims trailing zeros beyond 2 places", () => {
    expect(formatCreditDetailed(1.5)).toBe("$1.50");
  });

  it("keeps minimum 2 decimal places for whole numbers", () => {
    expect(formatCreditDetailed(5)).toBe("$5.00");
  });

  it("keeps minimum 2 decimal places for zero", () => {
    expect(formatCreditDetailed(0)).toBe("$0.00");
  });

  it("trims only trailing zeros", () => {
    expect(formatCreditDetailed(0.001)).toBe("$0.001");
  });

  it("handles values with exactly 2 significant decimals", () => {
    expect(formatCreditDetailed(0.01)).toBe("$0.01");
  });

  it("pads single significant decimal to 2", () => {
    expect(formatCreditDetailed(1.1)).toBe("$1.10");
  });

  it("handles very small values", () => {
    expect(formatCreditDetailed(0.000000001)).toBe("$0.000000001");
  });
});
