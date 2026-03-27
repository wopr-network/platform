import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { PLATFORM_BASE_URL } from "./api-config";

export const authClient = createAuthClient({
  baseURL: PLATFORM_BASE_URL,
  plugins: [twoFactorClient()],
});

export const { useSession, signIn, signUp, signOut, linkSocial, unlinkAccount, listAccounts } =
  authClient;
