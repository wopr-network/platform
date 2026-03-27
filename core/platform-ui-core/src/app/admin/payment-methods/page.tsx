"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adminListPaymentMethods,
  adminTogglePaymentMethod,
  adminUpsertPaymentMethod,
  type PaymentMethodAdmin,
} from "@/lib/api";

/** BIP-44 coin types by chain name. */
const COIN_TYPES: Record<string, number> = {
  base: 60,
  ethereum: 60,
  polygon: 60,
  optimism: 60,
  arbitrum: 60,
  bitcoin: 0,
  litecoin: 2,
  dogecoin: 3,
};

/**
 * Derive xpub from mnemonic client-side. Mnemonic NEVER leaves the browser.
 * Returns the extended public key for the given BIP-44 coin type.
 * Path: m/44'/<coinType>'/0'
 */
async function deriveXpubFromMnemonic(mnemonic: string, coinType: number): Promise<string> {
  const { HDKey } = await import("@scure/bip32");
  const { mnemonicToSeedSync } = await import("@scure/bip39");
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const master = HDKey.fromMasterSeed(seed);
  const account = master.derive(`m/44'/${coinType}'/0'`);
  const xpub = account.publicExtendedKey;
  if (!xpub) throw new Error("Failed to derive xpub");
  return xpub;
}

function MnemonicDeriveSection({
  chain,
  onXpubDerived,
}: {
  chain: string;
  onXpubDerived: (xpub: string) => void;
}) {
  const [mnemonic, setMnemonic] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derived, setDerived] = useState(false);

  const coinType = COIN_TYPES[chain.toLowerCase()] ?? 60;
  const path = `m/44'/${coinType}'/0'`;

  async function handleDerive() {
    if (!mnemonic.trim()) return;
    setDeriving(true);
    setError(null);
    try {
      const xpub = await deriveXpubFromMnemonic(mnemonic, coinType);
      onXpubDerived(xpub);
      setMnemonic(""); // Clear mnemonic immediately
      setDerived(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeriving(false);
    }
  }

  if (derived) {
    return (
      <div className="col-span-2 rounded-md border border-green-500/30 bg-green-500/5 p-3">
        <p className="text-xs text-green-500">
          xpub derived and set. Mnemonic was cleared from memory.
        </p>
      </div>
    );
  }

  return (
    <div className="col-span-2 space-y-2 rounded-md border border-dashed border-muted-foreground/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Derive xpub from mnemonic</span>
        <span className="text-xs text-muted-foreground/60">Path: {path}</span>
      </div>
      <p className="text-xs text-muted-foreground/60">
        Your mnemonic never leaves this browser. Only the xpub (public key) is sent to the server.
      </p>
      <input
        type="password"
        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
        placeholder="word1 word2 word3 ... (12 or 24 words)"
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDerive}
        disabled={deriving || !mnemonic.trim()}
      >
        {deriving ? "Deriving..." : "Derive xpub"}
      </Button>
    </div>
  );
}

function AddMethodForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    token: "",
    chain: "",
    type: "erc20",
    contractAddress: "",
    decimals: 18,
    displayName: "",
    displayOrder: 0,
    iconUrl: "",
    confirmations: 1,
    rpcUrl: "",
    oracleAddress: "",
    xpub: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const id = `${form.token}:${form.chain}`;
    await adminUpsertPaymentMethod({
      id,
      type: form.type,
      token: form.token,
      chain: form.chain,
      contractAddress: form.contractAddress || null,
      decimals: form.decimals,
      displayName: form.displayName || `${form.token} on ${form.chain}`,
      enabled: true,
      displayOrder: form.displayOrder,
      iconUrl: form.iconUrl,
      rpcUrl: form.rpcUrl || null,
      oracleAddress: form.oracleAddress || null,
      xpub: form.xpub || null,
      confirmations: form.confirmations,
    });
    setSaving(false);
    setOpen(false);
    setForm({
      token: "",
      chain: "",
      type: "erc20",
      contractAddress: "",
      decimals: 18,
      displayName: "",
      displayOrder: 0,
      iconUrl: "",
      confirmations: 1,
      rpcUrl: "",
      oracleAddress: "",
      xpub: "",
    });
    onSaved();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add Payment Method
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Token</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="USDC"
            value={form.token}
            onChange={(e) => setForm({ ...form, token: e.target.value })}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Chain</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="base"
            value={form.chain}
            onChange={(e) => setForm({ ...form, chain: e.target.value })}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Type</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="erc20">ERC-20</option>
            <option value="native">Native</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Decimals</span>
          <input
            type="number"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={form.decimals}
            onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })}
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-muted-foreground">Icon URL</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="https://example.com/icon.svg"
            value={form.iconUrl}
            onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
            required
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-muted-foreground">Contract Address (empty for native)</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="0x..."
            value={form.contractAddress}
            onChange={(e) => setForm({ ...form, contractAddress: e.target.value })}
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-muted-foreground">RPC URL (chain node endpoint)</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="http://op-geth:8545"
            value={form.rpcUrl}
            onChange={(e) => setForm({ ...form, rpcUrl: e.target.value })}
          />
        </label>
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-muted-foreground">
            Oracle Address (Chainlink feed — empty for stablecoins)
          </span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="0x..."
            value={form.oracleAddress}
            onChange={(e) => setForm({ ...form, oracleAddress: e.target.value })}
          />
        </label>

        {/* --- xpub: paste directly or derive from mnemonic --- */}
        <MnemonicDeriveSection
          chain={form.chain}
          onXpubDerived={(xpub) => setForm((f) => ({ ...f, xpub }))}
        />
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-muted-foreground">
            xpub (auto-filled from mnemonic above, or paste directly)
          </span>
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-xs font-mono"
            placeholder="xpub6..."
            value={form.xpub}
            onChange={(e) => setForm({ ...form, xpub: e.target.value })}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Display Order</span>
          <input
            type="number"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Confirmations</span>
          <input
            type="number"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            value={form.confirmations}
            onChange={(e) => setForm({ ...form, confirmations: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function AdminPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethodAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await adminListPaymentMethods();
      setMethods(m);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(id: string, enabled: boolean) {
    await adminTogglePaymentMethod(id, enabled);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <AddMethodForm onSaved={load} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment methods configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Token</th>
                    <th className="pb-2 pr-4">Chain</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Contract</th>
                    <th className="pb-2 pr-4">xpub</th>
                    <th className="pb-2 pr-4">RPC</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{m.token}</td>
                      <td className="py-2 pr-4">{m.chain}</td>
                      <td className="py-2 pr-4">{m.type}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {m.contractAddress ? `${m.contractAddress.slice(0, 10)}...` : "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {m.xpub ? `${m.xpub.slice(0, 12)}...` : "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {m.rpcUrl ? `${m.rpcUrl.slice(0, 20)}...` : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            m.enabled
                              ? "text-xs font-medium text-green-500"
                              : "text-xs font-medium text-red-500"
                          }
                        >
                          {m.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggle(m.id, !m.enabled)}
                        >
                          {m.enabled ? "Disable" : "Enable"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
