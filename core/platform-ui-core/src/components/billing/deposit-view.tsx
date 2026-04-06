"use client";

import { Check, Copy, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CheckoutResult } from "@/lib/api";

interface DepositViewProps {
  checkout: CheckoutResult;
  status: "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";
  onBack: () => void;
  expectedAmount?: string | null;
  receivedAmount?: string | null;
  token?: string;
  decimals?: number;
}

function formatCrypto(raw: string, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  return n.toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// Payment URI builder — triggers wallet apps on QR scan
// ---------------------------------------------------------------------------

const CHAIN_URI_SCHEMES: Record<string, string> = {
  bitcoin: "bitcoin",
  litecoin: "litecoin",
  dogecoin: "dogecoin",
  ethereum: "ethereum",
  base: "ethereum",
  "base-sepolia": "ethereum",
  sepolia: "ethereum",
  arbitrum: "ethereum",
  optimism: "ethereum",
  polygon: "ethereum",
  avalanche: "ethereum",
  solana: "solana",
  tron: "tron",
};

function buildPaymentUri(chain: string, address: string, nativeAmount?: string | null, decimals?: number): string {
  const scheme = CHAIN_URI_SCHEMES[chain.toLowerCase()];
  if (!scheme) return address;

  if (scheme === "bitcoin" || scheme === "litecoin" || scheme === "dogecoin") {
    const d = decimals ?? 8;
    const human = nativeAmount ? formatCrypto(nativeAmount, d) : undefined;
    return human ? `${scheme}:${address}?amount=${human}` : `${scheme}:${address}`;
  }

  if (scheme === "ethereum") {
    return nativeAmount ? `${scheme}:${address}?value=${nativeAmount}` : `${scheme}:${address}`;
  }

  if (scheme === "solana") {
    const d = decimals ?? 9;
    const human = nativeAmount ? formatCrypto(nativeAmount, d) : undefined;
    return human ? `${scheme}:${address}?amount=${human}` : `${scheme}:${address}`;
  }

  return `${scheme}:${address}`;
}

// ---------------------------------------------------------------------------
// Wallet detection + direct transaction submission
// ---------------------------------------------------------------------------

type WalletType = "metamask" | "solana" | "tron" | null;

function detectWallet(chain: string): WalletType {
  if (typeof window === "undefined") return null;
  const scheme = CHAIN_URI_SCHEMES[chain.toLowerCase()];
  if (scheme === "ethereum" && (window as { ethereum?: unknown }).ethereum) return "metamask";
  if (scheme === "solana" && (window as { solana?: { isPhantom?: boolean } }).solana?.isPhantom) return "solana";
  if (scheme === "tron" && (window as { tronWeb?: unknown }).tronWeb) return "tron";
  return null;
}

function walletLabel(type: WalletType): string {
  switch (type) {
    case "metamask":
      return "Pay with Wallet";
    case "solana":
      return "Pay with Phantom";
    case "tron":
      return "Pay with TronLink";
    default:
      return "Pay with Wallet";
  }
}

// ERC-20 transfer(address,uint256) function selector
const TRANSFER_SELECTOR = "0xa9059cbb";

function encodeErc20Transfer(to: string, amount: string): string {
  const addr = to.slice(2).toLowerCase().padStart(64, "0");
  const val = BigInt(amount).toString(16).padStart(64, "0");
  return `${TRANSFER_SELECTOR}${addr}${val}`;
}

interface WalletTxOpts {
  walletType: WalletType;
  depositAddress: string;
  amount: string | null;
  tokenType?: string;
  contractAddress?: string | null;
}

async function sendViaWallet(opts: WalletTxOpts): Promise<string | null> {
  const { walletType, depositAddress, amount, tokenType, contractAddress } = opts;
  if (!amount) return null;

  if (walletType === "metamask") {
    // Find the REAL MetaMask provider — TronLink and other extensions also inject window.ethereum
    type EthProvider = {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
    const root = (window as { ethereum?: EthProvider & { providers?: EthProvider[] } }).ethereum;
    if (!root) return null;
    const eth: EthProvider = root.providers?.find((p) => p.isMetaMask) ?? root;

    // Check if already connected (non-prompting), only request if needed
    let accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    if (!accounts[0]) {
      accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    }
    if (!accounts[0]) return null;

    // Build the single transaction object
    const tx: Record<string, string> = { from: accounts[0] };
    if (tokenType === "erc20" && contractAddress) {
      tx.to = contractAddress;
      tx.value = "0x0";
      tx.data = encodeErc20Transfer(depositAddress, amount);
    } else {
      tx.to = depositAddress;
      tx.value = `0x${BigInt(amount).toString(16)}`;
    }

    const txHash = (await eth.request({
      method: "eth_sendTransaction",
      params: [tx],
    })) as string;
    return txHash;
  }

  if (walletType === "solana") {
    // Solana requires @solana/web3.js for tx construction — fall back to URI
    return null;
  }

  if (walletType === "tron") {
    type TronWeb = {
      trx: { sendTransaction: (to: string, amount: number) => Promise<{ txid: string }> };
      contract: () => {
        at: (addr: string) => Promise<{ transfer: (to: string, amount: string) => { send: () => Promise<string> } }>;
      };
    };
    const tw = (window as { tronWeb?: TronWeb }).tronWeb;
    if (!tw) return null;

    // TRC-20: call transfer() on the contract via tronWeb.contract()
    if (tokenType === "erc20" && contractAddress) {
      const contract = await tw.contract().at(contractAddress);
      const txHash = await contract.transfer(depositAddress, amount).send();
      return txHash;
    }
    const result = await tw.trx.sendTransaction(depositAddress, Number(amount));
    return result.txid;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DepositView({
  checkout,
  status,
  onBack,
  expectedAmount,
  receivedAmount,
  token,
  decimals,
}: DepositViewProps) {
  const [copied, setCopied] = useState(false);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [txSent, setTxSent] = useState(false);

  useEffect(() => {
    setWalletType(detectWallet(checkout.chain));
  }, [checkout.chain]);

  const paymentUri = useMemo(
    () => buildPaymentUri(checkout.chain, checkout.depositAddress, expectedAmount, decimals),
    [checkout.chain, checkout.depositAddress, expectedAmount, decimals],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(checkout.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [checkout.depositAddress]);

  const handleWalletPay = useCallback(async () => {
    if (sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setWalletError(null);
    try {
      const amountToSend =
        expectedAmount && receivedAmount
          ? String(BigInt(expectedAmount) - BigInt(receivedAmount))
          : (checkout.expectedAmount ?? expectedAmount);
      const txHash = await sendViaWallet({
        walletType,
        depositAddress: checkout.depositAddress,
        amount: amountToSend ?? null,
        tokenType: checkout.type,
        contractAddress: checkout.contractAddress,
      });
      if (txHash) {
        setTxSent(true);
      } else if (walletType === "solana") {
        // Solana needs SDK — fall back to URI
        window.open(paymentUri);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected";
      if (!msg.includes("User denied") && !msg.includes("rejected")) {
        setWalletError(msg);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    walletType,
    checkout.depositAddress,
    checkout.type,
    checkout.contractAddress,
    checkout.expectedAmount,
    expectedAmount,
    receivedAmount,
    paymentUri,
  ]);

  return (
    <div className="space-y-4 text-center">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground self-start">
        &larr; Back
      </button>
      {status === "partial" && expectedAmount && receivedAmount && decimals != null && token ? (
        BigInt(receivedAmount) >= BigInt(expectedAmount) ? (
          <>
            <p className="text-sm text-primary font-medium">Full amount received</p>
            <p className="text-2xl font-semibold">
              {formatCrypto(receivedAmount, decimals)} {token}
            </p>
            <p className="text-xs text-muted-foreground animate-pulse">Waiting for on-chain confirmation...</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Send remaining</p>
            <p className="text-2xl font-semibold">
              {formatCrypto(String(BigInt(expectedAmount) - BigInt(receivedAmount)), decimals)} {token}
            </p>
            <p className="text-xs text-muted-foreground">
              on {checkout.chain} &middot; {formatCrypto(receivedAmount, decimals)} of{" "}
              {formatCrypto(expectedAmount, decimals)} {token} received
            </p>
          </>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Send exactly</p>
          <p className="text-2xl font-semibold">{checkout.displayAmount}</p>
          <p className="text-xs text-muted-foreground">
            on {checkout.chain} &middot; ${checkout.amountUsd.toFixed(2)} USD
          </p>
        </>
      )}

      {/* Wallet button — primary action when wallet detected */}
      {walletType && !txSent && (
        <Button onClick={handleWalletPay} disabled={sending} className="w-full gap-2">
          <Wallet className="h-4 w-4" />
          {sending ? "Confirm in wallet..." : walletLabel(walletType)}
        </Button>
      )}
      {txSent && <p className="text-sm text-primary font-medium">Transaction sent — waiting for confirmation...</p>}
      {walletError && <p className="text-xs text-destructive">{walletError}</p>}

      {/* QR + manual address — fallback or mobile */}
      <div className="mx-auto w-fit rounded-lg border border-border bg-white p-3" aria-hidden="true">
        <QRCodeSVG value={paymentUri} size={140} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {walletType ? "Or scan with another wallet" : "Scan with your wallet app"}
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
        <code className="flex-1 truncate text-xs font-mono">{checkout.depositAddress}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy address">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-2">
        {status === "waiting" && (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
            <span className="text-xs text-yellow-500">Waiting for payment...</span>
          </>
        )}
        {status === "partial" && (
          <>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs text-blue-500">
              {expectedAmount && receivedAmount && decimals != null && token ? (
                BigInt(receivedAmount) >= BigInt(expectedAmount) ? (
                  "Full amount received — confirming on chain"
                ) : (
                  <>
                    Received {formatCrypto(receivedAmount, decimals)} of {formatCrypto(expectedAmount, decimals)}{" "}
                    {token} &mdash; send{" "}
                    {formatCrypto(String(BigInt(expectedAmount) - BigInt(receivedAmount)), decimals)} more
                  </>
                )
              ) : (
                "Partial payment received"
              )}
            </span>
          </>
        )}
        {status === "expired" && <span className="text-xs text-destructive">Payment expired</span>}
        {status === "failed" && <span className="text-xs text-destructive">Payment failed</span>}
      </div>
    </div>
  );
}
