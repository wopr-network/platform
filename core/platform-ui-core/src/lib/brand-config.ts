/**
 * Brand Configuration — the shape every brand deployment must provide.
 *
 * platform-ui-core is brand-agnostic. All product names, domains,
 * copy, and visual identity come from the brand config set at boot.
 * Consumers (wopr-platform-ui, paperclip-dashboard, etc.) call
 * `setBrandConfig()` in their root layout before anything renders.
 */

export interface BrandDomain {
  /** The hostname (e.g. "holyship.wtf", "holyship.dev") */
  host: string;
  /** Role: "canonical" is the real site, "redirect" 301s to canonical */
  role: "canonical" | "redirect";
}

export interface BrandConfig {
  /** Product name shown to users (e.g. "WOPR Bot", "Paperclip") */
  productName: string;

  /** Short brand identifier (e.g. "WOPR", "Paperclip") */
  brandName: string;

  /**
   * Primary domain (e.g. "wopr.bot", "runpaperclip.com").
   * When `domains` is set, this returns the canonical domain's host.
   */
  domain: string;

  /**
   * All brand domains with roles. Optional — when unset, `domain` is
   * used as the sole canonical domain.
   *
   * Example:
   * ```
   * domains: [
   *   { host: "holyship.wtf", role: "canonical" },
   *   { host: "holyship.dev", role: "redirect" },
   * ]
   * ```
   */
  domains?: BrandDomain[];

  /** App subdomain (e.g. "app.wopr.bot", "app.runpaperclip.com") */
  appDomain: string;

  /** One-line tagline */
  tagline: string;

  /** Contact emails */
  emails: {
    privacy: string;
    legal: string;
    support: string;
  };

  /** Default container image for new instances */
  defaultImage: string;

  /** Prefix for local storage keys (e.g. "wopr", "paperclip") */
  storagePrefix: string;

  /** Prefix for custom DOM events (e.g. "wopr", "paperclip") */
  eventPrefix: string;

  /** Prefix for container env vars (e.g. "WOPR" → WOPR_LLM_MODEL) */
  envVarPrefix: string;

  /** Prefix for WebMCP tool names (e.g. "wopr" → wopr_list_instances) */
  toolPrefix: string;

  /** Cookie name for tenant ID */
  tenantCookieName: string;

  /** Company legal name for legal pages */
  companyLegalName: string;

  /** Base pricing display string (e.g. "$5/month") */
  price: string;

  /**
   * Post-auth redirect path (default "/marketplace").
   *
   * The Next.js middleware reads this from NEXT_PUBLIC_BRAND_HOME_PATH
   * at build time. setBrandConfig({ homePath }) only affects client-side
   * redirects. Brand shells must set the env var AND call setBrandConfig
   * to keep both paths in sync.
   */
  homePath: string;

  /** Sidebar navigation items. Each has a label and href. */
  navItems: Array<{ label: string; href: string }>;

  /** Whether the embedded chat widget is enabled (default true). */
  chatEnabled: boolean;

  /** Whether dividend features are shown in billing (default false). */
  dividendsEnabled: boolean;

  /** Feature bullet points shown on the billing plans page. */
  planFeatures: string[];

  /** Instance detail tabs to hide for this brand (e.g. ["plugins", "channels", "friends"]). */
  hiddenInstanceTabs: string[];
}

/**
 * Static defaults used before initBrandConfig() fetches from the core API.
 * These are intentionally minimal — the real config comes from the DB.
 * No process.env references. Brand shells call setBrandConfig() or
 * initBrandConfig() to populate from the core API.
 */
function staticDefaults(): BrandConfig {
  return {
    productName: "Platform",
    brandName: "Platform",
    domain: "localhost",
    appDomain: "localhost:3000",
    tagline: "",
    emails: { privacy: "", legal: "", support: "" },
    defaultImage: "",
    storagePrefix: "platform",
    eventPrefix: "platform",
    envVarPrefix: "PLATFORM",
    toolPrefix: "platform",
    tenantCookieName: "platform_tenant_id",
    companyLegalName: "",
    price: "",
    homePath: "/",
    chatEnabled: true,
    dividendsEnabled: false,
    planFeatures: [],
    hiddenInstanceTabs: [],
    navItems: [],
  };
}

let _config: BrandConfig = staticDefaults();

/**
 * Set the brand configuration. Call once at app startup
 * (typically in the root layout or _app).
 *
 * If `storagePrefix` is overridden, derived fields (`envVarPrefix`,
 * `toolPrefix`, `eventPrefix`, `tenantCookieName`) are re-computed
 * from the new prefix unless explicitly provided.
 */
export function setBrandConfig(config: Partial<BrandConfig>): void {
  const base = { ...staticDefaults(), ...config };
  // Re-derive prefix-dependent fields when storagePrefix is overridden
  // but the dependent fields were not explicitly provided.
  if (config.storagePrefix) {
    const sp = config.storagePrefix;
    if (!config.envVarPrefix) base.envVarPrefix = sp.toUpperCase();
    if (!config.toolPrefix) base.toolPrefix = sp;
    if (!config.eventPrefix) base.eventPrefix = sp;
    if (!config.tenantCookieName) base.tenantCookieName = `${sp}_tenant_id`;
  }
  // When domains[] is provided, derive domain from the canonical entry.
  if (config.domains?.length) {
    const canonical = config.domains.find((d) => d.role === "canonical");
    if (canonical) {
      base.domain = canonical.host;
    }
  }
  _config = base;
}

/** Get all redirect domains (non-canonical). Empty if domains[] not set. */
export function getRedirectDomains(): BrandDomain[] {
  return (_config.domains ?? []).filter((d) => d.role === "redirect");
}

/** Get the canonical domain entry, or synthesize one from `domain`. */
export function getCanonicalDomain(): BrandDomain {
  const canonical = (_config.domains ?? []).find((d) => d.role === "canonical");
  return canonical ?? { host: _config.domain, role: "canonical" };
}

/** Get the current brand configuration. */
export function getBrandConfig(): BrandConfig {
  return _config;
}

/** Shorthand — get brand name. */
export function brandName(): string {
  return _config.brandName;
}

/** Shorthand — get product name. */
export function productName(): string {
  return _config.productName;
}

/** Build a storage key with the brand prefix. */
export function storageKey(key: string): string {
  return `${_config.storagePrefix}-${key}`;
}

/** Build a custom event name with the brand prefix. */
export function eventName(event: string): string {
  return `${_config.eventPrefix}-${event}`;
}

/** Construct a brand-aware environment variable key (e.g. envKey("LLM_MODEL") → "WOPR_LLM_MODEL"). */
export function envKey(suffix: string): string {
  return `${_config.envVarPrefix}_${suffix}`;
}

/**
 * Fetch brand config from core server and apply it.
 * Call once in root layout server component with the product slug.
 * Falls back to env var defaults if core is unavailable.
 *
 * Uses INTERNAL_API_URL (server-side, private network) with service token auth.
 * The slug determines which product config is returned from the product table.
 *
 * @param slug - Product slug (e.g. "paperclip", "wopr", "nemoclaw", "holyship")
 */
export async function initBrandConfig(slug?: string): Promise<void> {
  const productSlug = slug ?? process.env.PRODUCT_SLUG ?? process.env.NEXT_PUBLIC_PRODUCT_SLUG;
  if (!productSlug) return; // No slug — env var defaults remain active

  const coreUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const serviceToken = process.env.CORE_SERVICE_TOKEN ?? "";

  try {
    const headers: Record<string, string> = {
      "X-Product": productSlug,
    };
    if (serviceToken) {
      headers.Authorization = `Bearer ${serviceToken}`;
    }

    const res = await fetch(`${coreUrl}/api/products/${encodeURIComponent(productSlug)}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) return;
    const data = (await res.json()) as Partial<BrandConfig>;
    if (data) {
      setBrandConfig(data);
    }
  } catch {
    // Core unavailable — env var defaults remain active
  }
}
