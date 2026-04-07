import type { IPriceOracle, IWatcherCursorStore } from "@wopr-network/platform-crypto-server/plugin";

/** In-memory mock cursor store for testing UTXO watchers. */
export function createMockCursorStore(): IWatcherCursorStore & {
	_cursors: Map<string, number>;
	_confirmations: Map<string, number>;
} {
	const cursors = new Map<string, number>();
	const confirmations = new Map<string, number>();

	return {
		_cursors: cursors,
		_confirmations: confirmations,
		async get(watcherId: string): Promise<number | null> {
			return cursors.get(watcherId) ?? null;
		},
		async save(watcherId: string, cursor: number): Promise<void> {
			cursors.set(watcherId, cursor);
		},
		async getConfirmationCount(watcherId: string, txKey: string): Promise<number | null> {
			return confirmations.get(`${watcherId}:${txKey}`) ?? null;
		},
		async saveConfirmationCount(watcherId: string, txKey: string, count: number): Promise<void> {
			confirmations.set(`${watcherId}:${txKey}`, count);
		},
	};
}

/** Mock price oracle that returns a fixed price. */
export function createMockOracle(priceMicros = 100_000_000_000): IPriceOracle {
	return {
		async getPrice(_token: string) {
			return { priceMicros };
		},
	};
}
