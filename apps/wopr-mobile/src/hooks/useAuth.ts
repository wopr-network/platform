import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../api/auth";
import { signIn as apiSignIn, signOut as apiSignOut, getSession } from "../api/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then((s) => setUser(s?.user ?? null))
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await apiSignIn(email, password);
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  return { user, isLoading, signIn, signOut };
}
