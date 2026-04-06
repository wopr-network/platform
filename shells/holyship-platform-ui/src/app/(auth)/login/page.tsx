"use client";

import { signIn, useSession } from "@core/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const callbackPath = searchParams.get("callbackUrl") ?? "/dashboard";
  const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}${callbackPath}` : callbackPath;

  useEffect(() => {
    if (!isPending && session) {
      router.replace(callbackUrl);
    }
  }, [isPending, session, router, callbackUrl]);

  const handleGitHubLogin = async () => {
    setLoading(true);
    try {
      await signIn.social({
        provider: "github",
        callbackURL: callbackUrl,
      });
    } catch {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-near-black">
      <div className="text-center max-w-sm px-6">
        <h1 className="text-3xl font-bold text-off-white mb-2">Holy Ship</h1>
        <p className="text-off-white/50 mb-10 italic">It's what you'll say when you see the results.</p>
        <button
          type="button"
          onClick={handleGitHubLogin}
          disabled={loading}
          className="w-full px-6 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Connecting..." : "Log in with GitHub"}
        </button>
      </div>
    </main>
  );
}
