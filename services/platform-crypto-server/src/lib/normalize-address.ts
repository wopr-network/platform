// EVM (hex) and bech32 (segwit) addresses are canonically lowercase.
// All other types — p2pkh, ton-base64url, keccak-b58check (Tron),
// base58-solana, ed25519-base58 — are case-sensitive.
const LOWERCASE_TYPES = new Set(["evm", "bech32"]);

export function normalizeAddress(addressType: string, address: string): string {
  return LOWERCASE_TYPES.has(addressType) ? address.toLowerCase() : address;
}
