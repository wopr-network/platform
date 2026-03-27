/**
 * Better Auth — Platform auth source of truth.
 *
 * Provides email+password auth, session management, and cookie-based auth
 * for the platform UI. Uses PostgreSQL via pg.Pool for persistence.
 *
 * The auth instance is lazily initialized to avoid opening the database
 * at module import time (which breaks tests).
 */

import { randomBytes } from "node:crypto";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import type { Pool } from "pg";
import { RoleStore } from "../admin/role-store.js";
import { logger } from "../config/logger.js";
import { initTwoFactorSchema } from "../db/auth-user-repository.js";
import type { PlatformDb } from "../db/index.js";
import { getEmailClient } from "../email/client.js";
import { passwordResetEmailTemplate, verifyEmailTemplate } from "../email/templates.js";
import { generateVerificationToken, initVerificationSchema, PgEmailVerifier } from "../email/verification.js";
import { createUserCreator, type IUserCreator } from "./user-creator.js";

/** OAuth provider credentials. */
export interface OAuthProvider {
  clientId: string;
  clientSecret: string;
}

/** Rate limit rule for a specific auth endpoint. */
export interface AuthRateLimitRule {
  window: number;
  max: number;
}

/** Configuration for initializing Better Auth in platform-core. */
export interface BetterAuthConfig {
  pool: Pool;
  db: PlatformDb;

  // --- Required ---
  /** HMAC secret for session tokens. Falls back to BETTER_AUTH_SECRET env var. */
  secret?: string;
  /** Base URL for OAuth callbacks. Falls back to BETTER_AUTH_URL env var. */
  baseURL?: string;

  // --- Auth features ---
  /** Route prefix. Default: "/api/auth" */
  basePath?: string;
  /** Email+password config. Default: enabled with 12-char min. */
  emailAndPassword?: { enabled: boolean; minPasswordLength?: number };
  /** OAuth providers. Default: reads GITHUB/DISCORD/GOOGLE env vars. */
  socialProviders?: {
    github?: OAuthProvider;
    discord?: OAuthProvider;
    google?: OAuthProvider;
  };
  /** Trusted providers for account linking. Default: ["github", "google"] */
  trustedProviders?: string[];
  /** Enable 2FA plugin. Default: true */
  twoFactor?: boolean;

  // --- Session & cookies ---
  /** Cookie cache max age in seconds. Default: 300 (5 min) */
  sessionCacheMaxAge?: number;
  /** Cookie prefix. Default: "better-auth" */
  cookiePrefix?: string;
  /** Cookie domain (e.g., ".wopr.bot"). Falls back to COOKIE_DOMAIN env var. */
  cookieDomain?: string;

  // --- Rate limiting ---
  /** Global rate limit window in seconds. Default: 60 */
  rateLimitWindow?: number;
  /** Global rate limit max requests. Default: 100 */
  rateLimitMax?: number;
  /** Per-endpoint rate limit overrides. Default: sign-in/sign-up/reset limits. */
  rateLimitRules?: Record<string, AuthRateLimitRule>;

  // --- Origins ---
  /** Trusted origins for CORS. Falls back to UI_ORIGIN env var. */
  trustedOrigins?: string[];

  // --- Branding ---
  /** Brand name used in email templates. Default: "WOPR" */
  brandName?: string;

  // --- Lifecycle hooks ---
  /** Called after a new user signs up (e.g., create personal tenant). */
  onUserCreated?: (userId: string, userName: string, email: string) => Promise<void>;
}

const DEFAULT_RATE_LIMIT_RULES: Record<string, AuthRateLimitRule> = {
  "/sign-in/email": { window: 900, max: 5 },
  "/sign-up/email": { window: 3600, max: 10 },
  "/request-password-reset": { window: 3600, max: 3 },
};

let _config: BetterAuthConfig | null = null;
let _userCreator: IUserCreator | null = null;
let _userCreatorPromise: Promise<IUserCreator> | null = null;

// Ephemeral secret: generated once per process, reused across authOptions() calls.
// Hoisted to module scope so resetAuth() (which nulls _auth) does not invalidate sessions.
let _ephemeralSecret: string | null = null;

export async function getUserCreator(): Promise<IUserCreator> {
  if (_userCreator) return _userCreator;
  if (!_userCreatorPromise) {
    if (!_config) throw new Error("BetterAuth not initialized — call initBetterAuth() first");
    _userCreatorPromise = createUserCreator(new RoleStore(_config.db))
      .then((creator) => {
        _userCreator = creator;
        return creator;
      })
      .catch((err) => {
        _userCreatorPromise = null;
        throw err;
      });
  }
  return _userCreatorPromise;
}

/**
 * Fetch the primary verified email from GitHub's /user/emails API.
 * GitHub returns null for profile.email when the user's email is private.
 * The user:email scope grants access to this endpoint.
 */
async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const emails = (await res.json()) as { email: string; primary: boolean; verified: boolean }[];
    const primary = emails.find((e) => e.primary && e.verified);
    return primary?.email ?? emails.find((e) => e.verified)?.email ?? null;
  } catch (error) {
    logger.error("Failed to fetch GitHub primary email from /user/emails:", error);
    return null;
  }
}

/** Resolve OAuth providers from config or env vars. */
function resolveSocialProviders(cfg: BetterAuthConfig): BetterAuthOptions["socialProviders"] {
  if (cfg.socialProviders) return cfg.socialProviders;
  return {
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            getUserInfo: async (token) => {
              const accessToken = token.accessToken;
              if (!accessToken) return null;
              const res = await fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (!res.ok) return null;
              const profile = (await res.json()) as Record<string, unknown>;
              let email = profile.email as string | null;
              if (!email) {
                email = await fetchGitHubPrimaryEmail(accessToken);
              }
              if (!email) return null;
              return {
                user: {
                  id: String(profile.id),
                  name: (profile.name as string) || (profile.login as string),
                  email,
                  image: profile.avatar_url as string,
                  emailVerified: true,
                },
                data: profile,
              };
            },
          },
        }
      : {}),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? { discord: { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET } }
      : {}),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : {}),
  };
}

function authOptions(cfg: BetterAuthConfig): BetterAuthOptions {
  const pool = cfg.pool;
  const secret = cfg.secret || process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET is required in production");
    }
    logger.warn("BetterAuth secret not configured — sessions will be invalidated on restart");
  }
  _ephemeralSecret ??= randomBytes(32).toString("hex");
  const effectiveSecret = secret || _ephemeralSecret;
  const baseURL = cfg.baseURL || process.env.BETTER_AUTH_URL || "http://localhost:3100";
  const basePath = cfg.basePath || "/api/auth";
  const cookieDomain = cfg.cookieDomain || process.env.COOKIE_DOMAIN;
  const trustedOrigins =
    cfg.trustedOrigins ||
    (process.env.UI_ORIGIN || "http://localhost:3001")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  // Default minPasswordLength: 12 — caller must explicitly override, not accidentally omit
  const emailAndPassword = cfg.emailAndPassword
    ? { minPasswordLength: 12, ...cfg.emailAndPassword }
    : { enabled: true, minPasswordLength: 12 };

  return {
    database: pool,
    secret: effectiveSecret,
    baseURL,
    basePath,
    socialProviders: resolveSocialProviders(cfg),
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: cfg.trustedProviders ?? ["github", "google"],
      },
    },
    emailAndPassword: {
      ...emailAndPassword,
      sendResetPassword: async ({ user, url }) => {
        try {
          const emailClient = getEmailClient();
          const template = passwordResetEmailTemplate(url, user.email, cfg.brandName);
          await emailClient.send({
            to: user.email,
            ...template,
            userId: user.id,
            templateName: "password-reset",
          });
        } catch (error) {
          logger.error("Failed to send password reset email:", error);
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              const userCreator = await getUserCreator();
              await userCreator.createUser(user.id);
            } catch (error) {
              logger.error("Failed to run user creator:", error);
            }

            if (cfg.onUserCreated) {
              try {
                await cfg.onUserCreated(user.id, user.name || user.email, user.email);
              } catch (error) {
                logger.error("Failed to run onUserCreated callback:", error);
              }
            }

            if (user.emailVerified) return;

            if (process.env.SKIP_EMAIL_VERIFICATION === "true") {
              // raw SQL: better-auth manages the "user" table schema; Drizzle schema is not available in this auth hook context
              await pool.query('UPDATE "user" SET "emailVerified" = true WHERE id = $1', [user.id]);
              user.emailVerified = true;
              logger.info("Email verification skipped (SKIP_EMAIL_VERIFICATION=true)", { userId: user.id });
              return;
            }

            try {
              await initVerificationSchema(pool);
              const { token } = await generateVerificationToken(pool, user.id);
              const verifyUrl = `${baseURL}${basePath}/verify?token=${token}`;
              const emailClient = getEmailClient();
              const template = verifyEmailTemplate(verifyUrl, user.email, cfg.brandName);
              await emailClient.send({
                to: user.email,
                ...template,
                userId: user.id,
                templateName: "verify-email",
              });
            } catch (error) {
              logger.error("Failed to send verification email:", error);
            }
          },
        },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: cfg.sessionCacheMaxAge ?? 300 },
    },
    advanced: {
      cookiePrefix: cfg.cookiePrefix || "better-auth",
      cookies: {
        session_token: {
          attributes: cookieDomain ? { domain: cookieDomain } : {},
        },
        session_data: {
          attributes: cookieDomain ? { domain: cookieDomain } : {},
        },
      },
    },
    plugins: cfg.twoFactor !== false ? [twoFactor()] : [],
    rateLimit: {
      enabled: true,
      window: cfg.rateLimitWindow ?? 60,
      max: cfg.rateLimitMax ?? 100,
      customRules: { ...DEFAULT_RATE_LIMIT_RULES, ...cfg.rateLimitRules },
      storage: "memory",
    },
    trustedOrigins,
  };
}

/** The type of a better-auth instance. */
export type Auth = ReturnType<typeof betterAuth>;

/** Initialize Better Auth with the given config. Must be called before getAuth(). */
export function initBetterAuth(config: BetterAuthConfig): void {
  _config = config;
}

/**
 * Run better-auth migrations against the auth database.
 * Must be called after initBetterAuth().
 */
export async function runAuthMigrations(): Promise<void> {
  if (!_config) throw new Error("BetterAuth not initialized — call initBetterAuth() first");
  type DbModule = { getMigrations: (opts: BetterAuthOptions) => Promise<{ runMigrations: () => Promise<void> }> };
  // better-auth 1.5.x moved getMigrations from "better-auth/db" to "better-auth/db/migration"
  let getMigrations: DbModule["getMigrations"];
  try {
    ({ getMigrations } = (await import("better-auth/db/migration")) as unknown as DbModule);
  } catch (err: unknown) {
    // Only fall back if the module path doesn't exist (ERR_MODULE_NOT_FOUND / ERR_PACKAGE_PATH_NOT_EXPORTED)
    const code = (err as { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw err;
    ({ getMigrations } = (await import("better-auth/db")) as unknown as DbModule);
  }
  const { runMigrations } = await getMigrations(authOptions(_config));
  await runMigrations();
  if (_config.twoFactor !== false) {
    await initTwoFactorSchema(_config.pool);
  }
}

let _auth: Auth | null = null;

/**
 * Get or create the singleton better-auth instance.
 * Lazily initialized on first call. initBetterAuth() must be called first.
 */
export function getAuth(): Auth {
  if (!_auth) {
    if (!_config) throw new Error("BetterAuth not initialized — call initBetterAuth() first");
    _auth = betterAuth(authOptions(_config));
  }
  return _auth;
}

/** Get an IEmailVerifier backed by the auth database. */
export function getEmailVerifier(): PgEmailVerifier {
  if (!_config) throw new Error("BetterAuth not initialized — call initBetterAuth() first");
  return new PgEmailVerifier(_config.pool);
}

/** Replace the singleton auth instance (for testing). */
export function setAuth(auth: Auth): void {
  _auth = auth;
}

/** Reset the singleton (for testing cleanup). */
export function resetAuth(): void {
  _auth = null;
}

/** Reset the user creator singleton (for testing). */
export function resetUserCreator(): void {
  _userCreator = null;
  _userCreatorPromise = null;
}
