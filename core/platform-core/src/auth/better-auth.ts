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
  /** Sender email address for this product. */
  fromEmail?: string;

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

/** Resolve OAuth providers from config. No env var fallback — pass providers explicitly. */
function resolveSocialProviders(cfg: BetterAuthConfig): BetterAuthOptions["socialProviders"] {
  if (!cfg.socialProviders) return {};
  const providers: BetterAuthOptions["socialProviders"] = {};
  if (cfg.socialProviders.github) {
    const gh = cfg.socialProviders.github;
    providers.github = {
      clientId: gh.clientId,
      clientSecret: gh.clientSecret,
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
    };
  }
  if (cfg.socialProviders.discord) {
    providers.discord = cfg.socialProviders.discord;
  }
  if (cfg.socialProviders.google) {
    providers.google = cfg.socialProviders.google;
  }
  return providers;
}

function authOptions(cfg: BetterAuthConfig): BetterAuthOptions {
  const pool = cfg.pool;
  const secret = cfg.secret;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET is required in production");
    }
    logger.warn("BetterAuth secret not configured — sessions will be invalidated on restart");
  }
  _ephemeralSecret ??= randomBytes(32).toString("hex");
  const effectiveSecret = secret || _ephemeralSecret;
  const baseURL = cfg.baseURL || "http://localhost:3100";
  const basePath = cfg.basePath || "/api/auth";
  const cookieDomain = cfg.cookieDomain;
  const trustedOrigins = cfg.trustedOrigins || ["http://localhost:3001"];
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
            from: cfg.fromEmail,
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
                from: cfg.fromEmail,
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
  const secretHash = config.secret ? `${config.secret.slice(0, 4)}...${config.secret.slice(-4)}` : "(none)";
  logger.info("initBetterAuth called", {
    baseURL: config.baseURL ?? "(undefined)",
    cookieDomain: config.cookieDomain ?? "(undefined)",
    secretHash,
    trustedOrigins: config.trustedOrigins?.slice(0, 6),
    socialProviders: Object.keys(config.socialProviders ?? {}),
  });
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

// ---------------------------------------------------------------------------
// Per-product auth registry — one BetterAuth instance per product slug
// ---------------------------------------------------------------------------

const _productAuths = new Map<string, Auth>();
let _productAuthManager: import("./product-auth-manager.js").ProductAuthManager | null = null;

/** Set the ProductAuthManager for per-product OAuth resolution. */
export function setAuthProductManager(manager: import("./product-auth-manager.js").ProductAuthManager): void {
  _productAuthManager = manager;
}

/**
 * Get a BetterAuth instance for a specific product.
 * Creates lazily with product-specific OAuth creds, baseURL, and cookieDomain.
 * Falls back to the global singleton if no per-product config exists.
 */
export async function getAuthForProduct(slug: string): Promise<Auth> {
  const cached = _productAuths.get(slug);
  if (cached) {
    logger.debug(`BetterAuth [${slug}]: using cached instance`);
    return cached;
  }

  if (!_config) throw new Error("BetterAuth not initialized — call initBetterAuth() first");
  if (!_productAuthManager) {
    logger.warn(`BetterAuth [${slug}]: no productAuthManager — falling back to global`);
    return getAuth(); // Fallback to global
  }

  const providers = await _productAuthManager.getSocialProviders(slug);

  // Resolve product domain for baseURL + cookieDomain
  const socialProviders: BetterAuthConfig["socialProviders"] = {};
  if (providers.github) socialProviders.github = providers.github;
  if (providers.google) socialProviders.google = providers.google;

  // Look up the product's domain + branding from the config service
  let baseURL = _config.baseURL;
  let cookieDomain = _config.cookieDomain;
  let brandName = _config.brandName;
  let fromEmail: string | undefined;
  let productFound = false;
  try {
    const pc = await _productAuthManager.productConfigService.getBySlug(slug);
    if (pc?.product?.domain) {
      baseURL = `https://api.${pc.product.domain}`;
      cookieDomain = `.${pc.product.domain}`;
      productFound = true;
    }
    if (pc?.product?.brandName) brandName = pc.product.brandName;
    if (pc?.product?.fromEmail) fromEmail = pc.product.fromEmail;
  } catch {
    // Use defaults
  }

  // Fall back to global only if we can't find a product domain to build the
  // correct baseURL/cookieDomain. Having zero OAuth providers is fine — the
  // product may use email/password auth only.
  if (!productFound) {
    logger.warn(`BetterAuth [${slug}]: no product domain found — falling back to global`);
    return getAuth();
  }

  // Log the config for this product instance (hash secret for safety)
  const secretHash = _config.secret ? `${_config.secret.slice(0, 4)}...${_config.secret.slice(-4)}` : "(ephemeral)";
  logger.info(`BetterAuth [${slug}]: creating instance`, {
    baseURL,
    cookieDomain,
    secretHash,
    globalBaseURL: _config.baseURL ?? "(undefined → localhost)",
    globalCookieDomain: _config.cookieDomain ?? "(undefined → none)",
    providers: Object.keys(providers),
  });

  const productConfig: BetterAuthConfig = {
    ..._config,
    baseURL,
    cookieDomain,
    socialProviders,
    brandName,
    fromEmail,
  };

  const auth = betterAuth(authOptions(productConfig));
  _productAuths.set(slug, auth);
  return auth;
}

/** Invalidate a cached per-product auth instance (call after config changes). */
export function invalidateProductAuth(slug: string): void {
  _productAuths.delete(slug);
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
