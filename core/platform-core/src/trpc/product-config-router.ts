import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ProductConfig } from "../product-config/repository-types.js";
import type { ProductConfigService } from "../product-config/service.js";
import { adminProcedure, publicProcedure, router } from "./init.js";

/** Mask Stripe secrets in admin responses — never send raw keys over the wire. */
function redactSecrets(config: ProductConfig): ProductConfig {
  if (!config.billing) return config;
  return {
    ...config,
    billing: {
      ...config.billing,
      stripeSecretKey: config.billing.stripeSecretKey ? "sk_...redacted" : null,
      stripeWebhookSecret: config.billing.stripeWebhookSecret ? "whsec_...redacted" : null,
    },
  };
}

export function createProductConfigRouter(getService: () => ProductConfigService, productSlug: string) {
  /** Resolve product id, throwing NOT_FOUND if the product doesn't exist. */
  async function resolveProductId(): Promise<string> {
    const config = await getService().getBySlug(productSlug);
    if (!config) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Product not found: ${productSlug}` });
    }
    return config.product.id;
  }

  return router({
    // -----------------------------------------------------------------------
    // Public endpoints
    // -----------------------------------------------------------------------

    getBrandConfig: publicProcedure.query(async () => {
      return getService().getBrandConfig(productSlug);
    }),

    getNavItems: publicProcedure.query(async () => {
      const config = await getService().getBySlug(productSlug);
      if (!config) return [];
      return config.navItems.filter((n) => n.enabled).map((n) => ({ label: n.label, href: n.href }));
    }),

    // -----------------------------------------------------------------------
    // Admin endpoints
    // -----------------------------------------------------------------------

    admin: router({
      get: adminProcedure.query(async () => {
        const config = await getService().getBySlug(productSlug);
        if (!config) return null;
        return redactSecrets(config);
      }),

      listAll: adminProcedure.query(async () => {
        const configs = await getService().listAll();
        return configs.map(redactSecrets);
      }),

      updateBrand: adminProcedure
        .input(
          z.object({
            brandName: z.string().min(1).optional(),
            productName: z.string().min(1).optional(),
            tagline: z.string().optional(),
            domain: z.string().min(1).optional(),
            appDomain: z.string().min(1).optional(),
            cookieDomain: z.string().optional(),
            companyLegal: z.string().optional(),
            priceLabel: z.string().optional(),
            defaultImage: z.string().optional(),
            emailSupport: z.string().optional(),
            emailPrivacy: z.string().optional(),
            emailLegal: z.string().optional(),
            fromEmail: z.string().optional(),
            homePath: z.string().optional(),
            storagePrefix: z.string().min(1).optional(),
          }),
        )
        .mutation(async ({ input }) => {
          await getService().upsertProduct(productSlug, input);
        }),

      updateNavItems: adminProcedure
        .input(
          z.array(
            z.object({
              label: z.string().min(1),
              href: z.string().min(1),
              icon: z.string().optional(),
              sortOrder: z.number().int().min(0),
              requiresRole: z.string().optional(),
              enabled: z.boolean().optional(),
            }),
          ),
        )
        .mutation(async ({ input }) => {
          const productId = await resolveProductId();
          await getService().replaceNavItems(productSlug, productId, input);
        }),

      updateFeatures: adminProcedure
        .input(
          z.object({
            chatEnabled: z.boolean().optional(),
            onboardingEnabled: z.boolean().optional(),
            onboardingDefaultModel: z.string().optional(),
            onboardingSystemPrompt: z.string().optional(),
            onboardingMaxCredits: z.number().int().min(0).optional(),
            onboardingWelcomeMsg: z.string().optional(),
            sharedModuleBilling: z.boolean().optional(),
            sharedModuleMonitoring: z.boolean().optional(),
            sharedModuleAnalytics: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const productId = await resolveProductId();
          await getService().upsertFeatures(productSlug, productId, input);
        }),

      updateFleet: adminProcedure
        .input(
          z.object({
            containerImage: z.string().optional(),
            containerPort: z.number().int().optional(),
            lifecycle: z.enum(["managed", "ephemeral"]).optional(),
            billingModel: z.enum(["monthly", "per_use", "none"]).optional(),
            maxInstances: z.number().int().min(1).optional(),
            imageAllowlist: z.array(z.string()).optional(),
            dockerNetwork: z.string().optional(),
            placementStrategy: z.string().optional(),
            fleetDataDir: z.string().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const productId = await resolveProductId();
          await getService().upsertFleetConfig(productSlug, productId, input);
        }),

      updateBilling: adminProcedure
        .input(
          z.object({
            stripePublishableKey: z.string().optional(),
            stripeSecretKey: z.string().optional(),
            stripeWebhookSecret: z.string().optional(),
            creditPrices: z.record(z.string(), z.number()).optional(),
            affiliateBaseUrl: z.string().optional(),
            affiliateMatchRate: z.number().min(0).optional(),
            affiliateMaxCap: z.number().int().min(0).optional(),
            dividendRate: z.number().min(0).optional(),
            marginConfig: z.unknown().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const productId = await resolveProductId();
          await getService().upsertBillingConfig(productSlug, productId, input);
        }),
    }),
  });
}
