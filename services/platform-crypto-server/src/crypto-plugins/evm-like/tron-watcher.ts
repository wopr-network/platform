import { hexToTron, tronToHex } from "../tron/address-convert.js";
import { BaseEvmLikeWatcher, type ParsedTransferLog } from "./base-watcher.js";
import type { RpcLog } from "./types.js";

/**
 * TRC-20 Transfer watcher for Tron's EVM-compatible JSON-RPC.
 *
 * Behavioral parity with crypto-plugins/tron/watcher.ts. Tron's RPC speaks
 * 0x hex addresses at the wire, but the rest of the system speaks T...
 * Base58Check. We round-trip at the boundary:
 *
 *   setWatchedAddresses(T...) -> filter uses hex
 *   poll() emits events with T... from/to
 *
 * We also cache a hex -> original-T lookup so the exact caller-supplied
 * string is preserved when we echo `to` back, mirroring the existing watcher.
 */
export class EvmLikeTronWatcher extends BaseEvmLikeWatcher {
  protected readonly watcherIdPrefix = "tron";

  /** Map from lowercase hex -> original T... address the caller supplied. */
  private readonly _hexToTronMap: Map<string, string> = new Map();

  protected buildWatcherIdPrefix(): string {
    return "tron";
  }

  protected override onWatchedAddressesChanged(addresses: string[]): void {
    this._hexToTronMap.clear();
    for (const addr of addresses) {
      const hex = tronToHex(addr).toLowerCase();
      this._hexToTronMap.set(hex, addr);
    }
  }

  protected encodeWatchedAddress(address: string): string {
    return tronToHex(address).toLowerCase();
  }

  protected parseTransferLog(log: RpcLog): ParsedTransferLog {
    const toHex = `0x${log.topics[2].slice(26)}`.toLowerCase();
    const fromHex = `0x${log.topics[1].slice(26)}`.toLowerCase();
    const rawAmount = BigInt(log.data);

    // Prefer the caller-supplied T... form when we have it (preserves
    // case-exact round-trip); otherwise derive from hex.
    const to = this._hexToTronMap.get(toHex) ?? hexToTron(toHex);
    const from = hexToTron(fromHex);

    return { from, to, rawAmount };
  }
}
