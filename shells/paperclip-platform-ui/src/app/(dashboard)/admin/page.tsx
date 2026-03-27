"use client";

import { trpc } from "@core/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function StatusBadge({ state }: { state: string | null }) {
  const colors: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    provisioning: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    created: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const label = state ?? "unknown";
  const cls = colors[label] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-indigo-500/10 p-6"
      style={{ background: "rgba(17,17,21,0.8)", backdropFilter: "blur(20px)" }}
    >
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-zinc-400 mb-4">{description}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main admin page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  // Gateway model (existing)
  const gatewayModel = trpc.admin.getGatewayModel.useQuery(undefined);
  const setModel = trpc.admin.setGatewayModel.useMutation({
    onSuccess: (data) => {
      toast.success(`Model updated to ${data.model}`);
      gatewayModel.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [modelInput, setModelInput] = useState("");

  const currentModel = gatewayModel.data?.model;
  const updatedAt = gatewayModel.data?.updatedAt;

  // Seed input with current value when loaded
  if (currentModel && !modelInput) {
    setModelInput(currentModel);
  }

  const handleSave = () => {
    const trimmed = modelInput.trim();
    if (!trimmed) return;
    setModel.mutate({ model: trimmed });
  };

  // Available models for dropdown
  const availableModels = trpc.admin.listAvailableModels.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const models = (availableModels.data?.models ?? []) as Array<{
    id: string;
    name: string;
    contextLength: number;
    promptPrice: string;
    completionPrice: string;
  }>;
  const [modelSearch, setModelSearch] = useState("");
  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  // New admin queries
  const allInstances = trpc.admin.listAllInstances.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const allOrgs = trpc.admin.listAllOrgs.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const billingOverview = trpc.admin.billingOverview.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (gatewayModel.error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-red-400">
          Access denied or error: {gatewayModel.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Platform Admin</h1>

      {/* ---- Gateway Model (existing) ---- */}
      <Section
        title="Gateway Model"
        description="All LLM requests are forced to this model. Clients cannot override it."
      >
        {gatewayModel.isLoading ? (
          <div className="text-zinc-500">Loading...</div>
        ) : (
          <>
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <label htmlFor="gateway-model" className="block text-xs text-zinc-500 mb-1">
                  OpenRouter Model ID
                </label>
                <input
                  id="gateway-model"
                  type="text"
                  value={modelInput}
                  onChange={(e) => {
                    setModelInput(e.target.value);
                    setModelSearch(e.target.value);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder={availableModels.isLoading ? "Loading models..." : "Search or type model ID..."}
                  className="w-full rounded-md border border-indigo-500/10 bg-indigo-500/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/40 focus:outline-none"
                  autoComplete="off"
                />
                {modelSearch && filteredModels.length > 0 && modelInput !== currentModel && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-indigo-500/10 bg-indigo-500/[0.03] shadow-lg">
                    {filteredModels.slice(0, 30).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModelInput(m.id);
                          setModelSearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-500/10 transition-colors ${m.id === modelInput ? "bg-indigo-500/10 text-indigo-400" : "text-zinc-200"}`}
                      >
                        <div className="font-mono text-xs">{m.id}</div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {m.name}
                          {m.contextLength > 0 && ` · ${Math.round(m.contextLength / 1000)}k ctx`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={setModel.isPending || modelInput.trim() === currentModel}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #818cf8, #6366f1)",
                  boxShadow: "0 2px 8px rgba(99,102,241,0.2)",
                }}
              >
                {setModel.isPending ? "Saving..." : "Save"}
              </button>
            </div>

            {updatedAt && (
              <p className="text-xs text-zinc-600 mt-2">Last changed: {new Date(updatedAt).toLocaleString()}</p>
            )}

            {!currentModel && (
              <p className="text-xs text-indigo-500 mt-2">
                No model set in database. Falling back to GATEWAY_DEFAULT_MODEL env var.
              </p>
            )}
          </>
        )}
      </Section>

      {/* ---- Billing Overview ---- */}
      <Section title="Billing Overview" description="Platform-wide billing summary across all tenants.">
        {billingOverview.isLoading ? (
          <div className="text-zinc-500">Loading...</div>
        ) : billingOverview.error ? (
          <div className="text-red-400 text-sm">Failed to load: {billingOverview.error.message}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/[0.03] p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Credits</p>
              <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {formatCents(billingOverview.data?.totalBalanceCents ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/[0.03] p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Organizations</p>
              <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">{billingOverview.data?.orgCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/[0.03] p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Active Service Keys</p>
              <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">
                {billingOverview.data?.activeKeyCount ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/[0.03] p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Payment Methods</p>
              <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">
                {billingOverview.data?.paymentMethodCount ?? 0}
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* ---- Instance Health ---- */}
      <Section title="Instance Health" description="All instances across all tenants with live status.">
        {allInstances.isLoading ? (
          <div className="text-zinc-500">Loading...</div>
        ) : allInstances.error ? (
          <div className="text-red-400 text-sm">Failed to load: {allInstances.error.message}</div>
        ) : !allInstances.data?.instances.length ? (
          <div className="text-zinc-500 text-sm">No instances found.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allInstances.data.instances.map(
              (inst: {
                id: string;
                name: string;
                state: string;
                health: string;
                containerId: string | null;
                startedAt: string | null;
                uptime: number | null;
                tenantId: string;
              }) => (
                <div
                  key={inst.id}
                  className="rounded-lg border border-indigo-500/10 bg-indigo-500/[0.03] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-zinc-100 truncate">{inst.name}</span>
                    <StatusBadge state={inst.state} />
                  </div>
                  <div className="space-y-1 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span>Container</span>
                      <span className="font-mono text-zinc-300">wopr-{inst.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uptime</span>
                      <span className="font-mono text-zinc-300">{formatUptime(inst.uptime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tenant</span>
                      <span className="font-mono text-zinc-500 truncate max-w-[160px]" title={inst.tenantId}>
                        {inst.tenantId.slice(0, 12)}
                        {inst.tenantId.length > 12 ? "..." : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Section>

      {/* ---- Tenant Overview ---- */}
      <Section
        title="Tenant Overview"
        description="All organizations with member counts, instances, and credit balances."
      >
        {allOrgs.isLoading ? (
          <div className="text-zinc-500">Loading...</div>
        ) : allOrgs.error ? (
          <div className="text-red-400 text-sm">Failed to load: {allOrgs.error.message}</div>
        ) : !allOrgs.data?.orgs.length ? (
          <div className="text-zinc-500 text-sm">No organizations found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-indigo-500/10 text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Organization</th>
                  <th className="pb-2 pr-4">Slug</th>
                  <th className="pb-2 pr-4 text-right">Members</th>
                  <th className="pb-2 pr-4 text-right">Instances</th>
                  <th className="pb-2 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-500/10">
                {allOrgs.data.orgs.map(
                  (org: {
                    id: string;
                    name: string;
                    slug: string | null;
                    memberCount: number;
                    instanceCount: number;
                    balanceCents: number;
                  }) => (
                    <tr key={org.id} className="text-zinc-300">
                      <td className="py-2.5 pr-4 font-medium">{org.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-zinc-500 text-xs">{org.slug ?? "--"}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{org.memberCount}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{org.instanceCount}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400">{formatCents(org.balanceCents)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
