import { describe, expect, it } from "vitest";
import { capabilityMeta, pricingData } from "@/lib/pricing-data";

describe("pricing-data", () => {
  describe("pricingData", () => {
    it("matches snapshot", () => {
      expect(pricingData).toMatchSnapshot();
    });

    it("has expected bot price", () => {
      expect(pricingData.bot_price).toEqual({ amount: 5, period: "month" });
    });

    it("has expected signup credit", () => {
      expect(pricingData.signup_credit).toBe(5);
    });

    it("has expected number of capability categories", () => {
      expect(pricingData.capabilities).toHaveLength(4);
    });
  });

  describe("capabilityMeta", () => {
    it("matches snapshot", () => {
      expect(capabilityMeta).toMatchSnapshot();
    });

    it("maps all expected backend keys", () => {
      expect(Object.keys(capabilityMeta).sort()).toEqual(["image_gen", "llm", "sms", "stt", "tts"]);
    });
  });
});
