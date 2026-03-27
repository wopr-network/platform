import { z } from "zod";

const platformConfigSchema = z.object({
  port: z.coerce.number().default(3100),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),

  /** Billing / affiliate / metering numeric env vars — validated at startup. */
  billing: z
    .object({
      affiliateBaseUrl: z.string().trim().url().optional(),
      affiliateMatchRate: z.coerce.number().min(0).max(10).default(1.0),
      affiliateMaxReferrals30d: z.coerce.number().int().min(0).default(20),
      affiliateMaxMatchCredits30d: z.coerce.number().int().min(0).default(20000),
      affiliateNewUserBonusRate: z.coerce.number().min(0).max(1).default(0.2),
      dividendMatchRate: z.coerce.number().min(0).max(10).default(1.0),
      meterMaxRetries: z.coerce.number().int().min(0).max(100).default(3),
    })
    .default({
      affiliateMatchRate: 1.0,
      affiliateMaxReferrals30d: 20,
      affiliateMaxMatchCredits30d: 20000,
      affiliateNewUserBonusRate: 0.2,
      dividendMatchRate: 1.0,
      meterMaxRetries: 3,
    }),
});

export const billingConfigSchema = platformConfigSchema.shape.billing;

export const config = platformConfigSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.LOG_LEVEL,
  billing: {
    affiliateBaseUrl: process.env.AFFILIATE_BASE_URL,
    affiliateMatchRate: process.env.AFFILIATE_MATCH_RATE,
    affiliateMaxReferrals30d: process.env.AFFILIATE_MAX_REFERRALS_30D,
    affiliateMaxMatchCredits30d: process.env.AFFILIATE_MAX_MATCH_CREDITS_30D,
    affiliateNewUserBonusRate: process.env.AFFILIATE_NEW_USER_BONUS_RATE,
    dividendMatchRate: process.env.DIVIDEND_MATCH_RATE,
    meterMaxRetries: process.env.METER_MAX_RETRIES,
  },
});

export type PlatformConfig = z.infer<typeof platformConfigSchema>;
