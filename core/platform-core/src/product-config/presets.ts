/**
 * Built-in product presets.
 * Used by platformBoot() for auto-seeding and by scripts/seed-products.ts.
 */

export interface NavItemPreset {
  label: string;
  href: string;
  sortOrder: number;
  requiresRole?: string;
}

export interface FleetPreset {
  containerImage: string;
  lifecycle: "managed" | "ephemeral";
  billingModel: "monthly" | "per_use" | "none";
  maxInstances: number;
}

export interface ProductPreset {
  brandName: string;
  productName: string;
  tagline: string;
  domain: string;
  appDomain: string;
  cookieDomain: string;
  companyLegal: string;
  priceLabel: string;
  defaultImage: string;
  emailSupport: string;
  emailPrivacy: string;
  emailLegal: string;
  fromEmail: string;
  homePath: string;
  storagePrefix: string;
  navItems: NavItemPreset[];
  fleet: FleetPreset;
}

export const PRODUCT_PRESETS: Record<string, ProductPreset> = {
  wopr: {
    brandName: "WOPR",
    productName: "WOPR Bot",
    tagline: "A $5/month supercomputer that manages your business.",
    domain: "wopr.bot",
    appDomain: "app.wopr.bot",
    cookieDomain: ".wopr.bot",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "$5/month",
    defaultImage: "ghcr.io/wopr-network/wopr:latest",
    emailSupport: "support@wopr.bot",
    emailPrivacy: "privacy@wopr.bot",
    emailLegal: "legal@wopr.bot",
    fromEmail: "noreply@wopr.bot",
    homePath: "/marketplace",
    storagePrefix: "wopr",
    navItems: [
      { label: "Dashboard", href: "/dashboard", sortOrder: 0 },
      { label: "Chat", href: "/chat", sortOrder: 1 },
      { label: "Marketplace", href: "/marketplace", sortOrder: 2 },
      { label: "Channels", href: "/channels", sortOrder: 3 },
      { label: "Plugins", href: "/plugins", sortOrder: 4 },
      { label: "Instances", href: "/instances", sortOrder: 5 },
      { label: "Changesets", href: "/changesets", sortOrder: 6 },
      { label: "Network", href: "/dashboard/network", sortOrder: 7 },
      { label: "Fleet Health", href: "/fleet/health", sortOrder: 8 },
      { label: "Credits", href: "/billing/credits", sortOrder: 9 },
      { label: "Billing", href: "/billing/plans", sortOrder: 10 },
      { label: "Settings", href: "/settings/profile", sortOrder: 11 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 12, requiresRole: "platform_admin" },
    ],
    fleet: {
      containerImage: "ghcr.io/wopr-network/wopr:latest",
      lifecycle: "managed",
      billingModel: "monthly",
      maxInstances: 5,
    },
  },
  paperclip: {
    brandName: "Paperclip",
    productName: "Paperclip",
    tagline: "AI agents that run your business.",
    domain: "runpaperclip.com",
    appDomain: "app.runpaperclip.com",
    cookieDomain: ".runpaperclip.com",
    companyLegal: "Paperclip AI Inc.",
    priceLabel: "$5/month",
    defaultImage: "ghcr.io/wopr-network/paperclip:managed",
    emailSupport: "support@runpaperclip.com",
    emailPrivacy: "privacy@runpaperclip.com",
    emailLegal: "legal@runpaperclip.com",
    fromEmail: "noreply@runpaperclip.com",
    homePath: "/instances",
    storagePrefix: "paperclip",
    navItems: [
      { label: "Instances", href: "/instances", sortOrder: 0 },
      { label: "Credits", href: "/billing/credits", sortOrder: 1 },
      { label: "Settings", href: "/settings/profile", sortOrder: 2 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 3, requiresRole: "platform_admin" },
    ],
    fleet: {
      containerImage: "ghcr.io/wopr-network/paperclip:managed",
      lifecycle: "managed",
      billingModel: "monthly",
      maxInstances: 5,
    },
  },
  holyship: {
    brandName: "Holy Ship",
    productName: "Holy Ship",
    tagline: "Ship it.",
    domain: "holyship.wtf",
    appDomain: "app.holyship.wtf",
    cookieDomain: ".holyship.wtf",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "",
    defaultImage: "ghcr.io/wopr-network/holyship:latest",
    emailSupport: "support@holyship.wtf",
    emailPrivacy: "privacy@holyship.wtf",
    emailLegal: "legal@holyship.wtf",
    fromEmail: "noreply@holyship.wtf",
    homePath: "/dashboard",
    storagePrefix: "holyship",
    navItems: [
      { label: "Dashboard", href: "/dashboard", sortOrder: 0 },
      { label: "Ship", href: "/ship", sortOrder: 1 },
      { label: "Approvals", href: "/approvals", sortOrder: 2 },
      { label: "Connect", href: "/connect", sortOrder: 3 },
      { label: "Credits", href: "/billing/credits", sortOrder: 4 },
      { label: "Settings", href: "/settings/profile", sortOrder: 5 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 6, requiresRole: "platform_admin" },
    ],
    fleet: {
      containerImage: "ghcr.io/wopr-network/holyship:latest",
      lifecycle: "ephemeral",
      billingModel: "none",
      maxInstances: 50,
    },
  },
  nemoclaw: {
    brandName: "NemoPod",
    productName: "NemoPod",
    tagline: "NVIDIA NeMo, one click away",
    domain: "nemopod.com",
    appDomain: "app.nemopod.com",
    cookieDomain: ".nemopod.com",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "$5 free credits",
    defaultImage: "ghcr.io/wopr-network/nemoclaw:latest",
    emailSupport: "support@nemopod.com",
    emailPrivacy: "privacy@nemopod.com",
    emailLegal: "legal@nemopod.com",
    fromEmail: "noreply@nemopod.com",
    homePath: "/instances",
    storagePrefix: "nemopod",
    navItems: [
      { label: "NemoClaws", href: "/instances", sortOrder: 0 },
      { label: "Credits", href: "/billing/credits", sortOrder: 1 },
      { label: "Settings", href: "/settings/profile", sortOrder: 2 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 3, requiresRole: "platform_admin" },
    ],
    fleet: {
      containerImage: "ghcr.io/wopr-network/nemoclaw:latest",
      lifecycle: "managed",
      billingModel: "monthly",
      maxInstances: 5,
    },
  },
};
