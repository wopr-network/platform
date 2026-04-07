import { apiFetch } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Session {
  user: AuthUser;
}

export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const res = await apiFetch("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Sign in failed (${res.status})`);
  }
  return res.json() as Promise<Session>;
}

export async function getSession(): Promise<Session | null> {
  const res = await apiFetch("/api/auth/get-session");
  if (!res.ok) return null;
  const data = (await res.json()) as { session?: Session } | null;
  return data?.session ?? null;
}

export async function signOut(): Promise<void> {
  await apiFetch("/api/auth/sign-out", { method: "POST" });
}
