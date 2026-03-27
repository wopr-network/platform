// Credential vault
export {
  type AuthType,
  auditCredentialEncryption,
  type CreateCredentialInput,
  type CredentialRow,
  type CredentialSummary,
  type CredentialSummaryRow,
  CredentialVaultStore,
  type DecryptedCredential,
  DrizzleCredentialRepository,
  DrizzleMigrationTenantKeyAccess,
  DrizzleSecretAuditRepository,
  getVaultEncryptionKey,
  type ICredentialMigrationAccess,
  type ICredentialRepository,
  type ICredentialVaultStore,
  type IMigrationTenantKeyAccess,
  type InsertCredentialRow,
  type ISecretAuditRepository,
  type MigrationResult,
  migratePlaintextCredentials,
  type PlaintextFinding,
  type RotateCredentialInput,
  type RotationResult,
  reEncryptAllCredentials,
  type SecretAuditEvent,
} from "./credential-vault/index.js";
export { assertNotPlaceholder, decrypt, deriveInstanceKey, encrypt, generateInstanceKey } from "./encryption.js";
export { validateNodeHost } from "./host-validation.js";
export type { KeyLeakMatch } from "./key-audit.js";
export { scanForKeyLeaks } from "./key-audit.js";
export { forwardSecretsToInstance, writeEncryptedSeed } from "./key-injection.js";
export { PROVIDER_ENDPOINTS, validateProviderKey } from "./key-validation.js";
export { assertSafeRedirectUrl } from "./redirect-allowlist.js";
// Tenant keys
export {
  ALL_CAPABILITIES,
  buildPooledKeysMap,
  type CapabilityName,
  CapabilitySettingsStore,
  DrizzleKeyResolutionRepository,
  DrizzleOrgMembershipRepository,
  type ICapabilitySettingsRepository,
  type IKeyResolutionRepository,
  type IOrgMembershipRepository,
  type ITenantKeyRepository,
  type OrgResolvedKey,
  type ResolvedKey,
  resolveApiKey,
  resolveApiKeyWithOrgFallback,
  type TenantApiKey,
  type TenantCapabilitySetting,
  TenantKeyRepository,
} from "./tenant-keys/index.js";
export type {
  EncryptedPayload,
  Provider,
  ProviderEndpoint,
  ValidateKeyRequest,
  ValidateKeyResponse,
  WriteSecretsRequest,
} from "./types.js";
export { providerSchema, validateKeyRequestSchema, writeSecretsRequestSchema } from "./types.js";
