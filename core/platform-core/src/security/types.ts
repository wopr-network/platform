import { z } from "zod";

/**
 * Provider identifier — any non-empty string.
 * Consumers (e.g., wopr-platform) can narrow this with their own enum.
 */
export const providerSchema = z.string().min(1);
export type Provider = z.infer<typeof providerSchema>;

/** Request body for the encrypted key validation proxy. */
export const validateKeyRequestSchema = z.object({
  provider: providerSchema,
  encryptedKey: z.string().min(1, "Encrypted key payload is required"),
});
export type ValidateKeyRequest = z.infer<typeof validateKeyRequestSchema>;

/** Response from key validation. */
export interface ValidateKeyResponse {
  valid: boolean;
  error?: string;
}

/** Request body for writing secrets to a running instance. */
export const writeSecretsRequestSchema = z
  .record(z.string().min(1), z.string().min(1))
  .refine((obj) => Object.keys(obj).length > 0, { message: "At least one secret is required" });
export type WriteSecretsRequest = z.infer<typeof writeSecretsRequestSchema>;

/** Encrypted payload structure stored as secrets.enc. */
export interface EncryptedPayload {
  /** AES-256-GCM initialization vector (hex). */
  iv: string;
  /** AES-256-GCM auth tag (hex). */
  authTag: string;
  /** Encrypted ciphertext (hex). */
  ciphertext: string;
}

/** Provider validation endpoint configuration. */
export interface ProviderEndpoint {
  url: string;
  headers: (key: string) => Record<string, string>;
}
