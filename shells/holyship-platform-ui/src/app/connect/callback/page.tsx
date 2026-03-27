"use client";

import { signIn } from "@core/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectCallbackPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [status, setStatus] = useState<"loading" | "requesting" | "error">(
		"loading",
	);

	const installationId = searchParams.get("installation_id");
	const setupAction = searchParams.get("setup_action");

	useEffect(() => {
		if (setupAction === "request") {
			setStatus("requesting");
			return;
		}

		if (setupAction === "update") {
			router.replace("/dashboard");
			return;
		}

		// Store installation_id for post-auth linking
		if (installationId) {
			sessionStorage.setItem("holyship_installation_id", installationId);
		}

		// Trigger GitHub OAuth via better-auth
		signIn
			.social({
				provider: "github",
				callbackURL: "/connect/complete",
			})
			.catch(() => {
				setStatus("error");
			});
	}, [installationId, setupAction, router]);

	if (status === "requesting") {
		return (
			<main className="min-h-screen flex items-center justify-center bg-near-black">
				<div className="text-center max-w-md px-6">
					<h1 className="text-2xl font-bold text-off-white mb-4">
						Waiting for approval
					</h1>
					<p className="text-off-white/70">
						Your organization admin needs to approve the Holy Ship installation.
						We'll be ready when they are.
					</p>
				</div>
			</main>
		);
	}

	if (status === "error") {
		return (
			<main className="min-h-screen flex items-center justify-center bg-near-black">
				<div className="text-center max-w-md px-6">
					<h1 className="text-2xl font-bold text-off-white mb-4">
						Something went wrong
					</h1>
					<p className="text-off-white/70 mb-8">
						GitHub authorization failed. Let's try again.
					</p>
					<a
						href="/connect"
						className="px-6 py-3 bg-signal-orange text-near-black font-semibold rounded hover:opacity-90 transition-opacity"
					>
						Try again
					</a>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen flex items-center justify-center bg-near-black">
			<p className="text-off-white/70 animate-pulse">Connecting to GitHub...</p>
		</main>
	);
}
