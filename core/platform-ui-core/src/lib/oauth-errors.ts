const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Access was denied. Please try again.",
  account_already_linked:
    "An account with this email already exists. Sign in to link your account.",
  server_error: "The authentication server encountered an error. Please try again later.",
  temporarily_unavailable:
    "The authentication service is temporarily unavailable. Please try again later.",
  invalid_request: "The authentication request was invalid. Please try again.",
  unauthorized_client: "This application is not authorized. Please contact support.",
  unsupported_response_type: "Authentication configuration error. Please contact support.",
  invalid_scope: "Authentication configuration error. Please contact support.",
};

const GENERIC_FALLBACK = "Authentication failed. Please try again.";

export function getOAuthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? GENERIC_FALLBACK;
}
