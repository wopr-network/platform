import { describe, expect, it } from "vitest";
import { formatCreditDetailed, formatCreditStandard } from "@/lib/format-credit";

describe("formatCreditStandard", () => {
  it("formats zero", () => {
    expect(formatCreditStandard(0)).toBe("$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatCreditStandard(5)).toBe("$5.00");
  });

  it("formats cents", () => {
    expect(formatCreditStandard(1.5)).toBe("$1.50");
  });

  it("formats large amounts", () => {
    expect(formatCreditStandard(1234.56)).toBe("$1234.56");
  });

  it("rounds to 2 decimals", () => {
    expect(formatCreditStandard(1.999)).toBe("$2.00");
  });
});

describe("formatCreditDetailed", () => {
  it("formats zero", () => {
    expect(formatCreditDetailed(0)).toBe("$0.00");
  });

  it("formats sub-cent (nanodollar)", () => {
    expect(formatCreditDetailed(0.000001)).toBe("$0.000001");
  });

  it("formats whole cents — keeps 2 decimals", () => {
    expect(formatCreditDetailed(0.01)).toBe("$0.01");
  });

  it("formats normal dollar amount — trims trailing zeros to 2", () => {
    expect(formatCreditDetailed(1.23)).toBe("$1.23");
  });

  it("does NOT show trailing zeros beyond 2", () => {
    expect(formatCreditDetailed(5)).toBe("$5.00");
  });

  it("trims trailing zeros but keeps significant digits", () => {
    expect(formatCreditDetailed(0.001)).toBe("$0.001");
  });

  it("handles large amounts", () => {
    expect(formatCreditDetailed(999.12)).toBe("$999.12");
  });

  it("handles very small nanodollar amounts", () => {
    expect(formatCreditDetailed(0.000000001)).toBe("$0.000000001");
  });
});
