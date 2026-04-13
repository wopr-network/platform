/**
 * TON sweep strategy — WalletV4R2 external-message construction.
 *
 * Scope of this file (for #80):
 *   - Native TON sweep only. Jetton (USDT-TON) sweep is deferred to a
 *     follow-up PR (#81) because Jetton wallets are separate contracts
 *     with their own deploy-on-first-send dance.
 *
 * Architecture choice:
 *   - Uses `@ton/core` for cell + BOC primitives. Unlike `ton/encoder.ts`
 *     which is deliberately pure (runs on the server hot path), the
 *     sweeper is a cold-side operation with different threat model.
 *     The battle-tested cell library is worth the dependency here.
 *   - Signs with `@noble/curves` Ed25519 — same as the rest of the
 *     codebase. Does NOT pull in `@ton/crypto`.
 *
 * Wallet V4R2 signed-message body format:
 *   signature(512 bits) || subwallet_id(32) || valid_until(32) ||
 *   seqno(32) || op(8) || send_mode(8) || ref(internal_message)
 *
 * Deploy-on-first-send:
 *   If the wallet account is uninitialized (seqno=0 and state=nonexistent),
 *   we include the StateInit in the external message so the first outgoing
 *   transfer doubles as the deploy. Every subsequent sweep is a plain
 *   transfer (no StateInit).
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { Address, beginCell, Cell, contractAddress, SendMode, storeStateInit } from "@ton/core";
import type {
  DepositInfo,
  ISweepStrategy,
  KeyPair,
  SweeperOpts,
  SweepResult,
} from "@wopr-network/platform-crypto-server/plugin";
import type { TonApiCall } from "./types.js";
import { createTonApiCaller } from "./watcher.js";

/** WalletV4R2 contract code BOC (base64). Same constant as in ./encoder.ts. */
const WALLET_V4R2_CODE_BOC_BASE64 =
  "te6cckECFAEAAtQAART/APSkE/S88sgLAQIBIAIPAgFIAwYC5tAB0NMDIXGwkl8E4CLXScEgkl8E4ALTHyGC" +
  "EHBsdWe9IoIQZHN0cr2wkl8F4AP6QDAg+kQByMoHy//J0O1E0IEBQNch9AQwXIEBCPQKb6Exs5JfB+AF0z/I" +
  "JYIQcGx1Z7qSODDjDQOCEGRzdHK6kl8G4w0EBQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAE" +
  "ywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRz" +
  "dHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAHDgIBIAgNAgFYCQoAPbKd+1E0IEBQNch9" +
  "AQwAsjKB8v/ydABgQEI9ApvoTGACASALDAAZrc52omhAIGuQ64X/wAAZrx32omhAEGuQ64WPwAARuMl+1E0Nc" +
  "LH4AFm9JCtvaiaECAoGuQ+gIYRw1AgIR6STfSmRDOaQPp/5g3gSgBt4EBSJhxWfMYQE+PKDCNcYINMf0x/T" +
  "HwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgP" +
  "AdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAG7SB/oA1NQi" +
  "+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBH" +
  "gQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fny" +
  "p4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVAj45Sg=";

/** Default subwallet id for workchain 0. Must match generate-ton-pool.mjs. */
const DEFAULT_SUBWALLET_ID = 698983191;

/** Message valid-until window (seconds) — TON convention is 60s. */
const DEFAULT_VALID_UNTIL_SECS = 60;

/** Minimum balance in nanoton to attempt a sweep (0.01 TON — below storage+fee floor). */
const MIN_SWEEPABLE_NANOTON = 10_000_000n;

/** Gas reserve kept on the wallet after sweep (covers storage + deploy overhead). */
const DEPLOY_RESERVE_NANOTON = 50_000_000n; // 0.05 TON — generous to avoid bounce

/** Sweep fee reserve for already-deployed wallets. */
const SWEEP_RESERVE_NANOTON = 10_000_000n; // 0.01 TON

export interface TonSweeperOpts extends SweeperOpts {
  /** Override subwallet id if needed (testing). */
  subwalletId?: number;
}

/**
 * Build the WalletV4R2 StateInit cell for a given Ed25519 pubkey.
 * Matches the convention used by the pool generator so the derived
 * address equals what the server assigned from the pool.
 */
function buildWalletV4R2StateInit(publicKey: Uint8Array, subwalletId: number): { code: Cell; data: Cell } {
  if (publicKey.length !== 32) {
    throw new Error(`TON pubkey must be 32 bytes, got ${publicKey.length}`);
  }
  const code = Cell.fromBase64(WALLET_V4R2_CODE_BOC_BASE64);
  const data = beginCell()
    .storeUint(0, 32) // seqno
    .storeUint(subwalletId, 32)
    .storeBuffer(Buffer.from(publicKey))
    .storeBit(0) // plugins dict: empty
    .endCell();
  return { code, data };
}

/**
 * Compute the mainnet WalletV4R2 address for a pubkey.
 * Must match what TonAddressEncoder.encode produces and what the pool
 * generator uploaded. Exported so tests and reconciliation scripts can
 * assert parity.
 */
export function computeWalletV4R2Address(publicKey: Uint8Array, subwalletId = DEFAULT_SUBWALLET_ID): string {
  const { code, data } = buildWalletV4R2StateInit(publicKey, subwalletId);
  return contractAddress(0, { code, data }).toString({ bounceable: false, urlSafe: true });
}

/**
 * Build the v4r2 signed-message body.
 *
 * body = subwallet_id(32) || valid_until(32) || seqno(32) || op=0(8) ||
 *        send_mode(8) || ref(internal_transfer)
 * signed body = signature(512) || body_bits || body_refs
 */
function buildSignedTransferBody(params: {
  privateKey: Uint8Array;
  subwalletId: number;
  validUntil: number;
  seqno: number;
  sendMode: number;
  internalMessage: Cell;
}): Cell {
  const unsigned = beginCell()
    .storeUint(params.subwalletId, 32)
    .storeUint(params.validUntil, 32)
    .storeUint(params.seqno, 32)
    .storeUint(0, 8) // op = 0 (simple transfer)
    .storeUint(params.sendMode, 8)
    .storeRef(params.internalMessage)
    .endCell();

  const hash = unsigned.hash();
  const signature = ed25519.sign(hash, params.privateKey);

  return beginCell().storeBuffer(Buffer.from(signature)).storeSlice(unsigned.asSlice()).endCell();
}

/**
 * Build the internal transfer message (what our wallet is instructing the
 * TON chain to emit from its outbox).
 */
function buildInternalTransfer(treasury: Address, nanoton: bigint): Cell {
  // CommonMsgInfoInternal bits (TL-B):
  //   int_msg_info$0 ihr_disabled:Bool bounce:Bool bounced:Bool
  //   src:MsgAddress dest:MsgAddressInt value:CurrencyCollection
  //   ihr_fee:Grams fwd_fee:Grams created_lt:uint64 created_at:uint32
  return beginCell()
    .storeUint(0, 1) // tag 0: int_msg_info
    .storeBit(1) // ihr_disabled = 1
    .storeBit(0) // bounce = 0 (non-bounceable sweep)
    .storeBit(0) // bounced = 0
    .storeUint(0, 2) // src = addr_none (wallet contract fills this in)
    .storeAddress(treasury)
    .storeCoins(nanoton) // value
    .storeUint(0, 1) // extra_currencies dict: empty
    .storeCoins(0n) // ihr_fee
    .storeCoins(0n) // fwd_fee
    .storeUint(0, 64) // created_lt
    .storeUint(0, 32) // created_at
    .storeBit(0) // no StateInit attached
    .storeBit(0) // body stored inline, empty
    .endCell();
}

/**
 * Wrap a signed transfer body into an external-in message, optionally
 * including StateInit for the first send from an uninitialized wallet.
 */
function buildExternalMessage(params: {
  destination: Address;
  body: Cell;
  stateInit?: { code: Cell; data: Cell };
}): Cell {
  const builder = beginCell()
    .storeUint(0b10, 2) // ext_in_msg_info
    .storeUint(0, 2) // src addr_none
    .storeAddress(params.destination)
    .storeCoins(0n); // import_fee

  if (params.stateInit) {
    builder.storeBit(1); // state init present
    builder.storeBit(1); // init as ref
    const initCell = beginCell();
    storeStateInit({ code: params.stateInit.code, data: params.stateInit.data })(initCell);
    builder.storeRef(initCell.endCell());
  } else {
    builder.storeBit(0); // no state init
  }
  builder.storeBit(1); // body as ref
  builder.storeRef(params.body);

  return builder.endCell();
}

/**
 * TON native sweep strategy.
 *
 * scan():  per key, hit getAddressInformation → balance + state.
 * sweep(): per deposit with > threshold, build signed external msg, sendBoc.
 *
 * Jetton (USDT-TON) sweeps intentionally not implemented here — see #81.
 */
export class TonSweeper implements ISweepStrategy {
  private readonly api: TonApiCall;
  private readonly token: string;
  private readonly chain: string;
  private readonly subwalletId: number;
  private readonly isJetton: boolean;

  constructor(opts: TonSweeperOpts) {
    this.api = createTonApiCaller(opts.rpcUrl, opts.rpcHeaders?.["X-API-Key"]);
    this.token = opts.token;
    this.chain = opts.chain;
    this.subwalletId = opts.subwalletId ?? DEFAULT_SUBWALLET_ID;
    this.isJetton = !!opts.contractAddress;
  }

  async scan(keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
    if (this.isJetton) {
      // Explicit no-op until #81. Return empty so the CLI reports
      // "nothing to sweep" rather than throwing.
      return [];
    }

    const results: DepositInfo[] = [];
    for (const key of keys) {
      const info = (await this.api("getAddressInformation", { address: key.address })) as {
        balance: string;
        state: "active" | "uninitialized" | "frozen";
      };
      const nativeBalance = BigInt(info.balance);
      if (nativeBalance >= MIN_SWEEPABLE_NANOTON) {
        results.push({
          index: key.index,
          address: key.address,
          nativeBalance,
          tokenBalances: [],
        });
      }
    }
    return results;
  }

  async sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]> {
    if (this.isJetton) {
      throw new Error("TON Jetton sweep not implemented in #80 — see #81 follow-up");
    }

    const results: SweepResult[] = [];
    const treasuryAddr = Address.parse(treasury);

    for (const key of keys) {
      const info = (await this.api("getAddressInformation", { address: key.address })) as {
        balance: string;
        state: "active" | "uninitialized" | "frozen";
      };
      const balance = BigInt(info.balance);
      if (balance < MIN_SWEEPABLE_NANOTON) continue;

      const isUninitialized = info.state === "uninitialized";
      const reserve = isUninitialized ? DEPLOY_RESERVE_NANOTON : SWEEP_RESERVE_NANOTON;
      const sweepable = balance - reserve;
      if (sweepable <= 0n) continue;

      if (dryRun) {
        results.push({
          index: key.index,
          address: key.address,
          token: this.token,
          amount: sweepable.toString(),
          txHash: "dry-run",
        });
        continue;
      }

      // Derive pubkey from privkey for StateInit construction
      const publicKey = ed25519.getPublicKey(key.privateKey);

      // Uninitialized wallets have seqno=0; we pass 0 explicitly instead of
      // querying runGetMethod, which avoids a second RPC roundtrip for the
      // common first-sweep case. For active wallets, fetch the current seqno.
      let seqno = 0;
      if (!isUninitialized) {
        const seqnoResult = (await this.api("runGetMethod", {
          address: key.address,
          method: "seqno",
          stack: JSON.stringify([]),
        })) as { stack?: Array<[string, { number?: { number?: string } } | string]> };
        const top = seqnoResult.stack?.[0];
        if (top && Array.isArray(top) && typeof top[1] !== "string") {
          seqno = Number(top[1].number?.number ?? 0);
        }
      }

      const internalMsg = buildInternalTransfer(treasuryAddr, sweepable);
      const validUntil = Math.floor(Date.now() / 1000) + DEFAULT_VALID_UNTIL_SECS;
      const signedBody = buildSignedTransferBody({
        privateKey: key.privateKey,
        subwalletId: this.subwalletId,
        validUntil,
        seqno,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        internalMessage: internalMsg,
      });

      const external = buildExternalMessage({
        destination: Address.parse(key.address),
        body: signedBody,
        stateInit: isUninitialized ? buildWalletV4R2StateInit(publicKey, this.subwalletId) : undefined,
      });

      const bocBase64 = external.toBoc().toString("base64");
      const sendResult = (await this.api("sendBoc", { boc: bocBase64 })) as { "@type"?: string; hash?: string };

      results.push({
        index: key.index,
        address: key.address,
        token: this.token,
        amount: sweepable.toString(),
        txHash: sendResult.hash ?? "pending",
      });
    }

    return results;
  }
}

// Re-export helpers for tests + reconciliation tooling.
export { buildExternalMessage, buildInternalTransfer, buildSignedTransferBody, buildWalletV4R2StateInit };
