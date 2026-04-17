import { describe, expect, it } from "vitest";
import { normalizeAddress } from "../lib/normalize-address.js";

describe("normalizeAddress", () => {
  it("lowercases evm addresses", () => {
    expect(normalizeAddress("evm", "0xABCDEF1234567890ABCDEF1234567890ABCDEF12")).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef12",
    );
  });

  it("lowercases bech32 addresses", () => {
    expect(normalizeAddress("bech32", "BC1QARCHDHFKJ9876543210")).toBe("bc1qarchdhfkj9876543210");
  });

  it("preserves case for p2pkh (BTC/LTC/DOGE)", () => {
    const addr = "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf";
    expect(normalizeAddress("p2pkh", addr)).toBe(addr);
  });

  it("preserves case for ton-base64url", () => {
    const addr = "UQD9K2jVfpbN8BqOHAk3tXVkP0rYhC7M2dGx6lWs8zF3A";
    expect(normalizeAddress("ton-base64url", addr)).toBe(addr);
  });

  it("preserves case for base58-solana", () => {
    const addr = "So11111111111111111111111111111111111111112";
    expect(normalizeAddress("base58-solana", addr)).toBe(addr);
  });

  it("preserves case for ed25519-base58", () => {
    const addr = "9ZNTfG4NyQgxy2SWjSiQoUyBPEvXT2xo7fKc5hPYYJ7b";
    expect(normalizeAddress("ed25519-base58", addr)).toBe(addr);
  });

  it("preserves case for keccak-b58check (Tron)", () => {
    const addr = "TJYeasTPa6gpEEfzmD9QcMkL3Hkf6fGmYe";
    expect(normalizeAddress("keccak-b58check", addr)).toBe(addr);
  });

  it("preserves case for unknown types", () => {
    const addr = "SomeArbitraryMixedCaseAddr";
    expect(normalizeAddress("unknown-future-type", addr)).toBe(addr);
  });
});
