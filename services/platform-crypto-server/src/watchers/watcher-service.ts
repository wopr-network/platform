/**
 * Watcher Service — boots chain watchers and sends webhook callbacks.
 *
 * Payment flow:
 *   1. Watcher detects payment → handlePayment()
 *   2. Accumulate native amount (supports partial payments)
 *   3. When totalReceived >= expectedAmount AND confirmations >= required → confirmed + credit
 *   4. Every payment/confirmation change enqueues a webhook delivery
 *   5. Outbox processor retries failed deliveries with exponential backoff
 *
 * Amount comparison is ALWAYS in native crypto units (sats, wei, token base units).
 * The exchange rate is locked at charge creation — no live price comparison.
 */

import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { CryptoDb } from "../db/index.js";
import { cryptoCharges, webhookDeliveries } from "../db/schema.js";
import type { ICryptoChargeRepository } from "../stores/charge-store.js";
import type { CryptoChargeStatus } from "../types.js";

const MAX_DELIVERY_ATTEMPTS = 10;
const BACKOFF_BASE_MS = 5_000;

// --- SSRF validation ---

function isValidCallbackUrl(url: string, allowedPrefixes: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return false;
    return allowedPrefixes.some((prefix) => url.startsWith(prefix));
  } catch {
    return false;
  }
}

// --- Webhook outbox ---

async function enqueueWebhook(
  db: CryptoDb,
  chargeId: string,
  callbackUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(webhookDeliveries).values({
    chargeId,
    callbackUrl,
    payload: JSON.stringify(payload),
  });
}

export async function processDeliveries(
  db: CryptoDb,
  allowedPrefixes: string[],
  log: (msg: string, meta?: Record<string, unknown>) => void,
  serviceKey?: string,
): Promise<number> {
  const now = new Date().toISOString();
  const pending = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        or(isNull(webhookDeliveries.nextRetryAt), lte(webhookDeliveries.nextRetryAt, now)),
      ),
    )
    .limit(50);

  let delivered = 0;
  for (const row of pending) {
    if (!isValidCallbackUrl(row.callbackUrl, allowedPrefixes)) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", lastError: "Invalid callbackUrl (SSRF blocked)" })
        .where(eq(webhookDeliveries.id, row.id));
      continue;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (serviceKey) headers.Authorization = `Bearer ${serviceKey}`;
      const res = await fetch(row.callbackUrl, {
        method: "POST",
        headers,
        body: row.payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await db.update(webhookDeliveries).set({ status: "delivered" }).where(eq(webhookDeliveries.id, row.id));
      delivered++;
    } catch (err) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        await db
          .update(webhookDeliveries)
          .set({ status: "failed", attempts, lastError: String(err) })
          .where(eq(webhookDeliveries.id, row.id));
        log("Webhook permanently failed", { chargeId: row.chargeId, attempts });
      } else {
        const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
        const nextRetry = new Date(Date.now() + backoffMs).toISOString();
        await db
          .update(webhookDeliveries)
          .set({ attempts, nextRetryAt: nextRetry, lastError: String(err) })
          .where(eq(webhookDeliveries.id, row.id));
      }
    }
  }
  return delivered;
}

// --- Payment handling (partial + full + confirmation tracking) ---

export interface PaymentPayload {
  txHash: string;
  confirmations: number;
  confirmationsRequired: number;
  amountReceivedCents: number;
  [key: string]: unknown;
}

/**
 * Handle a payment event. Accumulates partial payments in native units.
 * Fires webhook on every payment/confirmation change with canonical statuses.
 *
 * 3-phase webhook lifecycle:
 *   1. Tx first seen -> status: "partial", confirmations: 0
 *   2. Each new block -> status: "partial", confirmations: current
 *   3. Threshold reached + full payment -> status: "confirmed"
 *
 * @param nativeAmount — received amount in native base units (sats for BTC/DOGE, raw token units for ERC20).
 *                        Pass "0" for confirmation-only updates (no new payment, just more confirmations).
 */
export async function handlePayment(
  db: CryptoDb,
  chargeStore: ICryptoChargeRepository,
  address: string,
  nativeAmount: string,
  payload: PaymentPayload,
  log: (msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const charge = await chargeStore.getByDepositAddress(address);
  if (!charge) {
    log("Payment to unknown address", { address });
    return;
  }
  if (charge.creditedAt) {
    return; // Already fully paid and credited
  }

  const { confirmations, confirmationsRequired, amountReceivedCents, txHash } = payload;

  // Deduplicate: only accumulate native amount for NEW transactions.
  // The watcher re-emits the same tx on each poll cycle (cursor doesn't advance
  // past unconfirmed blocks). Without dedup, 0.5 LINK gets added every cycle.
  const seen = new Set(charge.seenTxHashes ?? []);
  const isNewTx = txHash != null && txHash.length > 0 && !seen.has(txHash);
  const thisPayment = isNewTx ? BigInt(nativeAmount) : 0n;

  const prevReceived = BigInt(charge.receivedAmount ?? "0");
  const totalReceived = (prevReceived + thisPayment).toString();
  const expected = BigInt(charge.expectedAmount ?? "0");
  const isFull = expected > 0n && BigInt(totalReceived) >= expected;
  const isConfirmed = isFull && confirmations >= confirmationsRequired;

  // Accumulate cents using the same isNewTx dedup as native amount. On re-emits
  // of the same tx (higher confirmation counts) we keep the prior cents, which
  // preserves the price captured at first sighting. Cumulative USD display for
  // partials — two 0.5 LINK partials report ~885¢ after the second, not ~442¢.
  // Credit gating still fires on native totalReceived; cents is display-only.
  const prevReceivedCents = charge.amountReceivedCents ?? 0;
  const totalReceivedCents = prevReceivedCents + (isNewTx ? amountReceivedCents : 0);

  // Persist new payment amount + mark tx as seen
  if (isNewTx && txHash) {
    seen.add(txHash);
    await db
      .update(cryptoCharges)
      .set({
        receivedAmount: totalReceived,
        filledAmount: totalReceived,
        seenTxHashes: Array.from(seen),
      })
      .where(eq(cryptoCharges.referenceId, charge.referenceId));
  }

  // Determine canonical status
  const status: CryptoChargeStatus = isConfirmed ? "confirmed" : "partial";

  // Update progress via new API
  await chargeStore.updateProgress(charge.referenceId, {
    status,
    amountReceivedCents: totalReceivedCents,
    confirmations,
    confirmationsRequired,
    txHash,
  });

  if (isConfirmed) {
    await chargeStore.markCredited(charge.referenceId);
    log("Charge confirmed", {
      chargeId: charge.referenceId,
      confirmations,
      confirmationsRequired,
    });
  } else {
    log("Payment progress", {
      chargeId: charge.referenceId,
      confirmations,
      confirmationsRequired,
      received: totalReceived,
    });
  }

  // Webhook on every event — product shows confirmation progress to user
  if (charge.callbackUrl) {
    await enqueueWebhook(db, charge.referenceId, charge.callbackUrl, {
      chargeId: charge.referenceId,
      chain: charge.chain,
      token: charge.token,
      address: charge.depositAddress,
      amountExpectedCents: charge.amountUsdCents,
      amountReceivedCents: totalReceivedCents,
      expectedAmount: charge.expectedAmount,
      receivedAmount: totalReceived,
      confirmations,
      confirmationsRequired,
      txHash,
      status,
    });
  }
}
