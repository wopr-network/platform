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
}

/**
 * Build default config from NEXT_PUBLIC_BRAND_* env vars, falling
 * back to generic "Platform" values. Each brand deployment sets
 * its env vars in .env (or .env.local) and the config picks them up
 * at build time — no code changes required.
 */
/**
 * Parse NEXT_PUBLIC_BRAND_NAV_ITEMS env var.
 * Format: JSON array of {label, href} objects.
 * Example: '[{"label":"Home","href":"/"},{"label":"Settings","href":"/settings"}]'
 * Returns null if unset or invalid (falls back to defaults).
 */
function parseNavItems(raw: string | undefined): Array<{ label: string; href: string }> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { label?: unknown }).label === "string" &&
          typeof (item as { href?: unknown }).href === "string",
      )
    ) {
      return parsed as Array<{ label: string; href: string }>;
    }
  } catch {
    // Invalid JSON — fall back to defaults
  }
  return null;
}

/** Parse a JSON string array env var. Returns null if unset/invalid. */
function parseStringArray(raw: string | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === "string")) {
      return parsed as string[];
    }
  } catch {
    // Invalid JSON — fall back to defaults
  }
  return null;
}

function envDefaults(): BrandConfig {
  // Direct process.env.X access is required — Next.js Turbopack only inlines
  // NEXT_PUBLIC_* vars when accessed as literal dot-property references.
  // Dynamic access like process.env[key] is NOT inlined at build time.
  const productName = process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME || "Platform";
  const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "Platform";
  const storagePrefix = process.env.NEXT_PUBLIC_BRAND_STORAGE_PREFIX || "platform";
  const eventPrefix = process.env.NEXT_PUBLIC_BRAND_EVENT_PREFIX || storagePrefix;
  return {
    productName,
    brandName,
    domain: process.env.NEXT_PUBLIC_BRAND_DOMAIN || "localhost",
    appDomain: process.env.NEXT_PUBLIC_BRAND_APP_DOMAIN || "localhost:3000",
    tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Your platform, your rules.",
    emails: {
      privacy: process.env.NEXT_PUBLIC_BRAND_EMAIL_PRIVACY || "privacy@example.com",
      legal: process.env.NEXT_PUBLIC_BRAND_EMAIL_LEGAL || "legal@example.com",
      support: process.env.NEXT_PUBLIC_BRAND_EMAIL_SUPPORT || "support@example.com",
    },
    defaultImage: process.env.NEXT_PUBLIC_BRAND_DEFAULT_IMAGE || "",
    storagePrefix,
    eventPrefix,
    envVarPrefix: process.env.NEXT_PUBLIC_BRAND_ENV_PREFIX || storagePrefix.toUpperCase(),
    toolPrefix: process.env.NEXT_PUBLIC_BRAND_TOOL_PREFIX || storagePrefix,
    tenantCookieName: process.env.NEXT_PUBLIC_BRAND_TENANT_COOKIE || `${storagePrefix}_tenant_id`,
    companyLegalName: process.env.NEXT_PUBLIC_BRAND_COMPANY_LEGAL || "Platform Inc.",
    price: process.env.NEXT_PUBLIC_BRAND_PRICE || "",
    homePath: process.env.NEXT_PUBLIC_BRAND_HOME_PATH || "/marketplace",
    chatEnabled: process.env.NEXT_PUBLIC_BRAND_CHAT_ENABLED !== "false",
    dividendsEnabled: process.env.NEXT_PUBLIC_BRAND_DIVIDENDS_ENABLED === "true",
    planFeatures: parseStringArray(process.env.NEXT_PUBLIC_BRAND_PLAN_FEATURES) ?? [
      "Signup credit included",
      "All channels",
      "All plugins",
      "Hosted AI — no API keys needed",
    ],
    navItems: parseNavItems(process.env.NEXT_PUBLIC_BRAND_NAV_ITEMS) ?? [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Chat", href: "/chat" },
      { label: "Marketplace", href: "/marketplace" },
      { label: "Channels", href: "/channels" },
      { label: "Plugins", href: "/plugins" },
      { label: "Instances", href: "/instances" },
      { label: "Changesets", href: "/changesets" },
      { label: "Network", href: "/dashboard/network" },
      { label: "Fleet Health", href: "/fleet/health" },
      { label: "Credits", href: "/billing/credits" },
      { label: "Billing", href: "/billing/plans" },
      { label: "Settings", href: "/settings/profile" },
      { label: "Admin", href: "/admin/tenants" },
    ],
  };
}

let _config: BrandConfig = envDefaults();

/**
 * Set the brand configuration. Call once at app startup
 * (typically in the root layout or _app).
 *
 * If `storagePrefix` is overridden, derived fields (`envVarPrefix`,
 * `toolPrefix`, `eventPrefix`, `tenantCookieName`) are re-computed
 * from the new prefix unless explicitly provided.
 */
export function setBrandConfig(config: Partial<BrandConfig>): void {
  const base = { ...envDefaults(), ...config };
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
 * Fetch brand config from the platform API and apply it.
 * Call once in root layout server component.
 * Falls back to env var defaults if API unavailable.
 *
 * @param apiBaseUrl - The platform API base URL (e.g. from NEXT_PUBLIC_API_URL)
 */
export async function initBrandConfig(apiBaseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${apiBaseUrl}/trpc/product.getBrandConfig`, {
      credentials: "include",
      next: { revalidate: 60 },
    });
    if (!res.ok) return;
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return; // Non-JSON response (proxy error, HTML page, etc.)
    }
    const data = (json as { result?: { data?: unknown } })?.result?.data;
    if (data) {
      setBrandConfig(data as Partial<BrandConfig>);
    }
  } catch {
    // API unavailable — env var defaults remain active
  }
}
