"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CheckoutResult } from "@/lib/api";

interface DepositViewProps {
  checkout: CheckoutResult;
  status: "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";
  onBack: () => void;
  /** Native crypto amounts for partial payment display */
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
// Payment URI builder — triggers wallet apps on QR scan or deep link click
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

  // UTXO chains use human-readable amounts (e.g. 0.001 BTC)
  if (scheme === "bitcoin" || scheme === "litecoin" || scheme === "dogecoin") {
    const d = decimals ?? 8;
    const human = nativeAmount ? formatCrypto(nativeAmount, d) : undefined;
    return human ? `${scheme}:${address}?amount=${human}` : `${scheme}:${address}`;
  }

  // EVM chains use wei for native transfers
  if (scheme === "ethereum") {
    return nativeAmount ? `${scheme}:${address}?value=${nativeAmount}` : `${scheme}:${address}`;
  }

  // Solana uses human-readable amounts
  if (scheme === "solana") {
    const d = decimals ?? 9;
    const human = nativeAmount ? formatCrypto(nativeAmount, d) : undefined;
    return human ? `${scheme}:${address}?amount=${human}` : `${scheme}:${address}`;
  }

  // TRON
  if (scheme === "tron") {
    return `${scheme}:${address}`;
  }

  return address;
}

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

  // Build payment URI — updates when native amount arrives from poll
  const paymentUri = useMemo(
    () => buildPaymentUri(checkout.chain, checkout.depositAddress, expectedAmount, decimals),
    [checkout.chain, checkout.depositAddress, expectedAmount, decimals],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(checkout.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [checkout.depositAddress]);

  return (
    <div className="space-y-4 text-center">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground self-start">
        &larr; Back
      </button>
      {status === "partial" && expectedAmount && receivedAmount && decimals != null && token ? (
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
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Send exactly</p>
          <p className="text-2xl font-semibold">{checkout.displayAmount}</p>
          <p className="text-xs text-muted-foreground">
            on {checkout.chain} &middot; ${checkout.amountUsd.toFixed(2)} USD
          </p>
        </>
      )}
      <div className="mx-auto w-fit rounded-lg border border-border bg-white p-3" aria-hidden="true">
        <QRCodeSVG value={paymentUri} size={140} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="text-[10px] text-muted-foreground">Scan with your wallet app</p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
        <code className="flex-1 truncate text-xs font-mono">{checkout.depositAddress}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy address">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <a
        href={paymentUri}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Wallet
      </a>
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
                <>
                  Received {formatCrypto(receivedAmount, decimals)} of {formatCrypto(expectedAmount, decimals)} {token}{" "}
                  &mdash; send {formatCrypto(String(BigInt(expectedAmount) - BigInt(receivedAmount)), decimals)} more
                </>
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
