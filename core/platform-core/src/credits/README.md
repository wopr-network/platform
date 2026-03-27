# Double-Entry Credit Ledger

A production double-entry accounting system for prepaid credit management. Every mutation posts a balanced journal entry where `sum(debits) === sum(credits)`. A tenant's "credit balance" is the balance of their `unearned_revenue` liability account.

## Accounting Model

```
ASSETS (1000s)          — Cash, Stripe Receivable
LIABILITIES (2000:tid)  — Unearned Revenue per tenant (the "credit balance")
EQUITY (3000s)          — Retained Earnings
REVENUE (4000s)         — Bot Runtime, Adapter Usage, Addon, Storage, Onboarding, Expired Credits
EXPENSES (5000s)        — Signup Grant, Admin Grant, Promo, Referral, Affiliate, Bounty, Dividend, Correction
```

### Transaction Flows

| Operation | Debit | Credit | Effect |
|-----------|-------|--------|--------|
| Purchase | Cash (1000) | Unearned Revenue (2000:tid) | Tenant buys credits |
| Usage | Unearned Revenue (2000:tid) | Revenue (4000-4050) | Credits consumed, revenue recognized |
| Grant | Expense (5000-5070) | Unearned Revenue (2000:tid) | Free credits issued |
| Refund | Unearned Revenue (2000:tid) | Cash (1000) | Money returned to tenant |
| Expiry | Unearned Revenue (2000:tid) | Revenue: Expired (4060) | Unused credits recognized as revenue |

The accounting equation holds at all times: `Assets = Liabilities + Equity + Revenue - Expenses`.

## Safety Guarantees

### Double-Entry Invariant
Every journal entry requires at least 2 lines. `sum(debits) === sum(credits)` is verified with **BigInt arithmetic** before the database transaction begins. The `trialBalance()` method independently verifies `total_debits === total_credits` across all journal lines using BigInt aggregation.

### Transaction Isolation (TOCTOU-Safe)
All balance mutations use PostgreSQL `SELECT ... FOR UPDATE` row locks on both the `accounts` and `account_balances` rows. The balance check happens **inside** the transaction **after** acquiring locks, preventing time-of-check-to-time-of-use races under concurrent debit operations.

### Deadlock Prevention
Journal lines are sorted by `accountCode` before lock acquisition, establishing a consistent global lock ordering. This eliminates deadlocks when concurrent transactions touch overlapping accounts.

### Overflow Protection
- `Credit.fromRaw()` throws `RangeError` if the value exceeds `Number.MAX_SAFE_INTEGER` (~$9M in nanodollars)
- `Credit.add()`, `subtract()`, `multiply()` all throw `RangeError` on overflow
- Aggregate queries (`trialBalance`, `lifetimeSpend`, `sumPurchasesForPeriod`) use BigInt to prevent silent precision loss
- Tiered observability warnings at $10K / $100K / $1M balances

### Idempotency
Journal entries support an optional `referenceId` with a unique constraint (partial index, NULL-safe). Callers use domain-specific prefixes to prevent double-posting:
- `pi_<stripe_id>` — Stripe purchases
- `runtime:<date>:<tenantId>` — Daily bot runtime billing
- `runtime-tier:<date>:<tenantId>` — Resource tier surcharges
- `runtime-storage:<date>:<tenantId>` — Storage tier surcharges
- `runtime-addon:<date>:<tenantId>` — Infrastructure addon charges
- `expiry:<entryId>` — Credit expiry clawbacks

### Credit Expiry (Allowlist-Gated)
Only entry types listed in `EXPIRABLE_CREDIT_TYPES` can be returned by `expiredCredits()`. The constant is typed as `as const satisfies readonly CreditType[]` — adding a new `CreditType` without updating the allowlist produces a compile error.

## Value Object: `Credit`

All amounts are stored as **nanodollars** (1 dollar = 1,000,000,000 raw units). The `Credit` class enforces integer-only arithmetic:

```typescript
Credit.fromDollars(0.001)  // 1,000,000 raw units
Credit.fromCents(500)       // 5,000,000,000 raw units
Credit.fromRaw(n)           // throws TypeError if not integer, RangeError if > MAX_SAFE_INTEGER

credit.toCentsRounded()     // for display / API responses
credit.toCentsFloor()       // for Stripe charges (never overcharge)
credit.toRaw()              // for database storage
```

No floating-point arithmetic in storage or ledger paths. `Math.round()` is used only at input boundaries (`fromDollars`, `fromCents`, `multiply`).

## Key Files

| File | Purpose |
|------|---------|
| `ledger.ts` | `DrizzleLedger` — the core double-entry engine |
| `credit.ts` | `Credit` value object with overflow protection |
| `credit-expiry-cron.ts` | Sweeps expired grants, debits remaining balance |
| `../monetization/credits/runtime-cron.ts` | Daily bot billing with per-charge-type idempotency |
| `../gateway/credit-gate.ts` | Pre/post-call balance checks for the API gateway |
| `../db/schema/ledger.ts` | Drizzle schema: accounts, journal_entries, journal_lines, account_balances |

## Interface: `ILedger`

```typescript
post(input: PostEntryInput): Promise<JournalEntry>          // The primitive — posts a balanced entry
credit(tenantId, amount, type, opts?): Promise<JournalEntry> // Add credits (DR source, CR liability)
debit(tenantId, amount, type, opts?): Promise<JournalEntry>  // Deduct credits (DR liability, CR revenue)
debitCapped(tenantId, maxAmount, type, opts?)                 // Atomic balance-capped debit (single txn)
balance(tenantId): Promise<Credit>                            // Tenant's credit balance
trialBalance(): Promise<TrialBalance>                         // Verify the books balance
```

## Audit History

Audited 2026-03-16. Seven issues identified and resolved:

| # | Issue | Fix |
|---|-------|-----|
| #86 | Runtime cron `continue` skipped surcharges on crash retry | Per-charge-type independent idempotency |
| #87 | Credit expiry cron TOCTOU race on balance read | `debitCapped()` — atomic single-transaction balance read + debit |
| #88 | `Credit.add()/subtract()/multiply()` bypassed overflow checks | `Number.isSafeInteger()` guard on all arithmetic results |
| #89 | Potential deadlock from unsorted lock acquisition | Sort lines by `accountCode` before `FOR UPDATE` |
| #90 | `expiredCredits()` used denylist (fragile to new types) | Allowlist `EXPIRABLE_CREDIT_TYPES` with compile-time safety |
| #91 | Missing concurrency and edge-case tests | 6 new tests: race, corruption, deadlock, overflow, expiry |
| #92 | `post()` pre-check used JS number (overflow-prone) | BigInt accumulators + guarded error formatting |
