"use client";

import { AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryFilter } from "@/components/marketplace/category-filter";
import { MarketplaceEmptyState } from "@/components/marketplace/empty-state";
import { FeaturedHeroes } from "@/components/marketplace/featured-heroes";
import { FirstVisitHero } from "@/components/marketplace/first-visit-hero";
import { MarketplaceTabs } from "@/components/marketplace/marketplace-tabs";
import { PluginCard } from "@/components/marketplace/plugin-card";
import { SuperpowerCard } from "@/components/marketplace/superpower-card";
import { TerminalSearch } from "@/components/marketplace/terminal-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BotStatusResponse } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { eventName, productName, storageKey } from "@/lib/brand-config";
import { toUserMessage } from "@/lib/errors";
import {
  listInstalledPlugins,
  listMarketplacePlugins,
  type MarketplaceTab,
  type PluginCategory,
  type PluginManifest,
} from "@/lib/marketplace-data";

const FIRST_VISIT_KEY = storageKey("marketplace-visited");

export default function MarketplacePage() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("superpower");
  const [showFirstVisit, setShowFirstVisit] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  const searchParams = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, bots] = await Promise.all([
        listMarketplacePlugins(),
        apiFetch<BotStatusResponse[]>("/fleet/bots").catch(() => [] as BotStatusResponse[]),
      ]);
      setPlugins(data);
      const activeBotId = bots[0]?.id;
      if (activeBotId) {
        try {
          const installed = await listInstalledPlugins(activeBotId);
          setInstalledIds(new Set(installed.map((p) => p.pluginId)));
        } catch {
          setInstalledIds(new Set());
        }
      }
    } catch (err) {
      setError(toUserMessage(err, "Failed to load marketplace plugins"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearch(q);
    }
  }, [searchParams]);

  useEffect(() => {
    function handleMarketplaceEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === "filter") {
        setSearch(detail.query ?? "");
      } else if (detail?.type === "clearFilter") {
        setSearch("");
      }
    }
    const evtName = eventName("marketplace");
    window.addEventListener(evtName, handleMarketplaceEvent);
    return () => window.removeEventListener(evtName, handleMarketplaceEvent);
  }, []);

  // Detect first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const visited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!visited) {
      setShowFirstVisit(true);
    }
  }, []);

  function handleDismissFirstVisit() {
    setShowFirstVisit(false);
    localStorage.setItem(FIRST_VISIT_KEY, "1");
  }

  // Superpower plugins
  const superpowers = useMemo(
    () => plugins.filter((p) => p.marketplaceTab === "superpower"),
    [plugins],
  );

  // Category counts for current tab
  const categoryCounts = useMemo(() => {
    const tabPlugins = plugins.filter((p) => (p.marketplaceTab ?? "utility") === activeTab);
    const counts: Record<string, number> = {};
    for (const p of tabPlugins) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [plugins, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plugins) {
      const tab = p.marketplaceTab ?? "utility";
      counts[tab] = (counts[tab] ?? 0) + 1;
    }
    return counts;
  }, [plugins]);

  // Filtered plugins by tab + category + search
  const filtered = useMemo(() => {
    let result = plugins.filter((p) => (p.marketplaceTab ?? "utility") === activeTab);
    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          (p.superpowerHeadline?.toLowerCase().includes(term) ?? false) ||
          (p.superpowerTagline?.toLowerCase().includes(term) ?? false) ||
          p.tags.some((t) => t.toLowerCase().includes(term)),
      );
    }
    return result;
  }, [plugins, activeTab, selectedCategory, search]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-7 w-52" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, n) => `fh-sk-${n}`).map((skId) => (
              <div key={skId} className="rounded-xl border border-border/50 p-6 space-y-3">
                <Skeleton className="h-14 w-14 rounded-xl" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="rounded-xl border border-border/50 p-6 space-y-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-8 w-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* First-visit cinematic overlay */}
      <AnimatePresence>
        {showFirstVisit && (
          <FirstVisitHero superpowers={superpowers} onDismiss={handleDismissFirstVisit} />
        )}
      </AnimatePresence>

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Browse Superpowers</h1>
          <p className="text-sm text-muted-foreground">
            Give your {productName()} abilities it was born to have.
          </p>
        </div>

        {/* Featured hero section — hidden during search */}
        {!search.trim() && <FeaturedHeroes superpowers={superpowers} />}

        {/* Search + tabs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <TerminalSearch value={search} onChange={setSearch} placeholder="Search superpowers..." />
        </div>

        <MarketplaceTabs
          selected={activeTab}
          onSelect={(tab) => {
            setActiveTab(tab);
            setSelectedCategory(null);
          }}
          counts={tabCounts}
        />

        {activeTab !== "superpower" && (
          <CategoryFilter
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            counts={categoryCounts}
          />
        )}

        {/* Plugin grid */}
        {filtered.length === 0 ? (
          <MarketplaceEmptyState hasSearch={search.trim().length > 0} searchTerm={search} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((plugin, i) =>
              activeTab === "superpower" ? (
                <SuperpowerCard
                  key={plugin.id}
                  plugin={plugin}
                  index={i}
                  installed={installedIds.has(plugin.id)}
                />
              ) : (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  index={i}
                  installed={installedIds.has(plugin.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
