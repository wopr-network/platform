/**
 * UTXO sweep stub -- BTC/LTC/DOGE sweeps are manual via wallet software.
 *
 * UTXO chains require coin selection, fee estimation, and input signing
 * that is best handled by dedicated wallet software (Electrum, Sparrow, etc.).
 */
import type { DepositInfo, ISweepStrategy, KeyPair, SweepResult } from "@wopr-network/platform-crypto-server/plugin";

export class UtxoSweeper implements ISweepStrategy {
	private readonly chain: string;

	constructor(chain: string) {
		this.chain = chain;
	}

	async scan(_keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
		throw new Error(`UTXO sweep not implemented for ${this.chain} -- use wallet software (Electrum/Sparrow)`);
	}

	async sweep(_keys: KeyPair[], _treasury: string, _dryRun: boolean): Promise<SweepResult[]> {
		throw new Error(`UTXO sweep not implemented for ${this.chain} -- use wallet software (Electrum/Sparrow)`);
	}
}
