import { BaseEvmLikeWatcher, type ParsedTransferLog } from "./base-watcher.js";
import type { RpcLog } from "./types.js";

/**
 * ERC-20 Transfer watcher for EVM mainnets (ethereum, base, arbitrum, polygon...).
 *
 * Behavioral parity with crypto-plugins/evm/watcher.ts — subclass only
 * supplies address decoding (lowercase 0x hex) and the "evm" watcher-id
 * prefix. All cursor/confirmation logic lives in BaseEvmLikeWatcher.
 */
export class EvmLikeEvmWatcher extends BaseEvmLikeWatcher {
  protected readonly watcherIdPrefix = "evm";

  protected buildWatcherIdPrefix(): string {
    return "evm";
  }

  protected encodeWatchedAddress(address: string): string {
    return address.toLowerCase();
  }

  protected parseTransferLog(log: RpcLog): ParsedTransferLog {
    // topics[1] = from (padded 32 bytes), topics[2] = to (padded 32 bytes).
    // Slice(26) drops the "0x" + 24 leading zero hex chars → the 20-byte addr.
    const to = `0x${log.topics[2].slice(26)}`.toLowerCase();
    const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
    const rawAmount = BigInt(log.data);
    return { from, to, rawAmount };
  }
}
