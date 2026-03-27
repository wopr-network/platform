"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectCompletePage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const installationId = sessionStorage.getItem("holyship_installation_id");

    if (!installationId) {
      // No installation to link — they logged in directly
      router.replace("/dashboard");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    fetch(`${apiUrl}/api/github/link-installation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ installationId }),
    })
      .then((res) => {
        sessionStorage.removeItem("holyship_installation_id");
        if (res.ok) {
          router.replace("/dashboard");
        } else {
          setError(true);
        }
      })
      .catch(() => {
        setError(true);
      });
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-near-black">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold text-off-white mb-4">Almost there</h1>
          <p className="text-off-white/70 mb-8">
            GitHub App installed, but we couldn't link it to your account. This usually fixes itself — try logging in.
          </p>
          <a
            href="/login"
            className="px-6 py-3 bg-signal-orange text-near-black font-semibold rounded hover:opacity-90 transition-opacity"
          >
            Log in with GitHub
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-near-black">
      <p className="text-off-white/70 animate-pulse">Setting up your account...</p>
    </main>
  );
}
