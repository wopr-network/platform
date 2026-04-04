import Link from "next/link";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reason?: string }>;
}) {
  const { status, reason } = await searchParams;
  const success = status === "success";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4" style={{ background: "#09090b" }}>
      <div
        className="w-full max-w-md rounded-2xl p-10 text-center"
        style={{
          background: "rgba(17,17,21,0.8)",
          border: "1px solid rgba(129,140,248,0.1)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
          style={{
            background: success
              ? "linear-gradient(135deg, #34d399, #10b981)"
              : "linear-gradient(135deg, #f87171, #ef4444)",
            boxShadow: success ? "0 0 30px rgba(52,211,153,0.3)" : "0 0 30px rgba(248,113,113,0.3)",
          }}
        >
          {success ? "\u2713" : "\u2717"}
        </div>
        <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          {success ? "Email verified" : "Verification failed"}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          {success
            ? "Your account is active and you've been granted $5.00 in free credits to get started."
            : reason === "missing_token"
              ? "No verification token was provided."
              : "This link is invalid or has expired. Please request a new verification email."}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center rounded-xl px-8 py-2.5 text-sm font-semibold text-white no-underline transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #818cf8, #6366f1)",
            boxShadow: "0 2px 10px rgba(99,102,241,0.25)",
          }}
        >
          {success ? "Sign in" : "Back to login"}
        </Link>
      </div>
    </div>
  );
}
