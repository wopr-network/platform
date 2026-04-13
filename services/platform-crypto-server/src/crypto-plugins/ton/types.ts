/** TON HTTP API call function signature (TON Center v2 style). */
export type TonApiCall = (method: string, params: Record<string, string>) => Promise<unknown>;

/**
 * TON transaction from getTransactions API.
 *
 * The API nests lt and hash under `transaction_id`, not at the top level.
 * `@type` / `storage_fee` / `other_fee` / `account` / `data` are also
 * present on live responses but we don't use them.
 */
export interface TonTransaction {
  utime: number;
  transaction_id: {
    lt: string;
    hash: string;
  };
  fee: string;
  in_msg?: TonMessage;
  out_msgs?: TonMessage[];
}

/** TON message (incoming or outgoing). */
export interface TonMessage {
  source: string;
  destination: string;
  value: string;
  message?: string;
  msg_data?: {
    "@type": string;
    body?: string;
    text?: string;
  };
}

/** TON account state from getAddressInformation. */
export interface TonAccountState {
  balance: string;
  state: "active" | "uninitialized" | "frozen";
  last_transaction_id?: {
    lt: string;
    hash: string;
  };
}

/** Jetton transfer from TON Center v3 /jetton/transfers API. */
export interface JettonTransferV3 {
  query_id: string;
  source: string;
  destination: string;
  amount: string;
  source_wallet: string;
  jetton_master: string;
  transaction_hash: string;
  transaction_lt: string;
  transaction_now: number;
  transaction_aborted: boolean;
  response_destination: string;
  forward_payload: string | null;
}
