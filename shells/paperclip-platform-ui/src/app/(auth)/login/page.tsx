"use client";

import { AuthError } from "@core/components/auth/auth-error";
import { AuthRedirect } from "@core/components/auth/auth-redirect";
import { ResendVerificationButton } from "@core/components/auth/resend-verification-button";
import { OAuthButtons } from "@core/components/oauth-buttons";
import { Button } from "@core/components/ui/button";
import { Checkbox } from "@core/components/ui/checkbox";
import { Input } from "@core/components/ui/input";
import { Label } from "@core/components/ui/label";
import { signIn, signUp } from "@core/lib/auth-client";
import { getBrandConfig } from "@core/lib/brand-config";
import { sanitizeRedirectUrl } from "@core/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

function getPasswordStrength(password: string): {
	score: number;
	label: string;
} {
	let score = 0;
	if (password.length >= 8) score++;
	if (password.length >= 12) score++;
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
	if (/\d/.test(password)) score++;
	if (/[^a-zA-Z0-9]/.test(password)) score++;
	const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
	return { score, label: labels[Math.min(score, labels.length) - 1] ?? "" };
}

const strengthColors = [
	"bg-red-500",
	"bg-red-500",
	"bg-indigo-400",
	"bg-indigo-500",
	"bg-emerald-500",
];
const strengthLabelColors = [
	"text-destructive",
	"text-destructive",
	"text-indigo-400",
	"text-indigo-300",
	"text-emerald-400",
];

function AuthForm() {
	const searchParams = useSearchParams();
	const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "signin";
	const [tab, setTab] = useState<"signin" | "signup">(defaultTab);
	const reason = searchParams.get("reason");

	// Shared state
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [errorType, setErrorType] = useState<
		"credentials" | "unverified" | "suspended" | "generic" | null
	>(null);
	const [loading, setLoading] = useState(false);

	// Signup-only state
	const [name, setName] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [agreedToTerms, setAgreedToTerms] = useState(false);
	const [signupSuccess, setSignupSuccess] = useState(false);
	const strength = getPasswordStrength(password);

	async function handleSignIn(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setErrorType(null);
		setLoading(true);
		try {
			const { error: authError } = await signIn.email({ email, password });
			if (authError) {
				if (authError.status === 403) {
					setErrorType("unverified");
					setError("Please verify your email address before signing in.");
				} else if (
					authError.code === "ACCOUNT_SUSPENDED" ||
					authError.code === "ACCOUNT_BANNED" ||
					authError.message?.toLowerCase().includes("suspended")
				) {
					setErrorType("suspended");
					setError("Your account has been suspended. Please contact support.");
				} else {
					setErrorType("credentials");
					setError("Invalid email or password. Please try again.");
				}
				return;
			}
			const callbackUrl = sanitizeRedirectUrl(searchParams.get("callbackUrl"));
			window.location.href = callbackUrl;
		} catch {
			setError("A network error occurred. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	async function handleSignUp(e: FormEvent) {
		e.preventDefault();
		setError(null);
		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		if (!agreedToTerms) {
			setError("You must agree to the terms of service");
			return;
		}
		setLoading(true);
		try {
			const { error: authError } = await signUp.email({
				name,
				email,
				password,
			});
			if (authError) {
				setError(authError.message ?? "Failed to create account");
				return;
			}
			setSignupSuccess(true);
		} catch {
			setError("A network error occurred. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	function switchTab(t: "signin" | "signup") {
		setTab(t);
		setError(null);
		setErrorType(null);
	}

	// Success state after signup
	if (signupSuccess) {
		return (
			<div
				className="flex min-h-dvh items-center justify-center px-4"
				style={{ background: "#09090b" }}
			>
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
							background: "linear-gradient(135deg, #818cf8, #6366f1)",
							boxShadow: "0 0 30px rgba(99,102,241,0.3)",
						}}
					>
						📎
					</div>
					<h1
						className="text-xl font-bold"
						style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
					>
						Check your email
					</h1>
					<p className="mt-3 text-sm text-zinc-400">
						We sent a verification link to{" "}
						<span className="font-medium text-white">{email}</span>
					</p>
					<p className="mt-4 text-sm text-zinc-500">
						Click the link to verify your account and receive your{" "}
						<span className="font-medium text-indigo-400">
							$5 signup credit
						</span>
						.
					</p>
					<div className="mt-6">
						<ResendVerificationButton email={email} />
					</div>
					<div className="mt-6">
						<button
							type="button"
							onClick={() => {
								setSignupSuccess(false);
								switchTab("signin");
							}}
							className="text-sm text-zinc-500 hover:text-indigo-400 transition-colors"
						>
							Back to sign in
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className="grid min-h-dvh lg:grid-cols-2"
			style={{ background: "#09090b" }}
		>
			{/* Left panel — pitch */}
			<div
				className="hidden lg:flex flex-col justify-center px-12 xl:px-16"
				style={{
					background:
						"linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))",
					borderRight: "1px solid rgba(129,140,248,0.08)",
				}}
			>
				<div
					className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl text-xl"
					style={{
						background: "linear-gradient(135deg, #818cf8, #6366f1)",
						boxShadow: "0 0 25px rgba(99,102,241,0.3)",
					}}
				>
					📎
				</div>
				<h1
					className="text-3xl font-bold"
					style={{
						fontFamily: "'Space Grotesk', system-ui, sans-serif",
						letterSpacing: "-0.03em",
						lineHeight: 1.2,
					}}
				>
					Deploy your AI workforce in seconds.
				</h1>
				<p
					className="mt-3 text-zinc-400"
					style={{ fontSize: "15px", lineHeight: 1.6 }}
				>
					Paperclip agents run your business while you sleep. No hiring. No
					managing. Just results.
				</p>
				<div className="mt-8 flex flex-col gap-3.5">
					{[
						"Agents that code, ship, and iterate",
						"Your data, your infrastructure",
						"Pay only for what they use",
					].map((perk) => (
						<div
							key={perk}
							className="flex items-center gap-3 text-sm text-zinc-200"
						>
							<div
								className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
								style={{
									background: "#818cf8",
									boxShadow: "0 0 8px rgba(129,140,248,0.5)",
								}}
							/>
							{perk}
						</div>
					))}
				</div>
				<div
					className="mt-8 flex items-center gap-3 rounded-xl px-5 py-4"
					style={{
						border: "1px solid rgba(129,140,248,0.12)",
						background: "rgba(99,102,241,0.06)",
					}}
				>
					<span
						className="text-xl font-bold"
						style={{
							fontFamily: "'Space Grotesk', sans-serif",
							color: "#818cf8",
						}}
					>
						$5
					</span>
					<span className="text-sm text-zinc-400">
						free credit to get started.
						<br />
						No card required.
					</span>
				</div>
			</div>

			{/* Right panel — form */}
			<div className="flex flex-col justify-center px-6 py-12 sm:px-12 xl:px-16">
				{/* Mobile brand */}
				<div className="mb-8 text-center lg:hidden">
					<div
						className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg"
						style={{
							background: "linear-gradient(135deg, #818cf8, #6366f1)",
							boxShadow: "0 0 20px rgba(99,102,241,0.3)",
						}}
					>
						📎
					</div>
					<h2
						className="text-lg font-bold"
						style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
					>
						Paperclip
					</h2>
				</div>

				<div className="mx-auto w-full max-w-sm">
					{/* Tab toggle */}
					<div
						className="mb-7 flex gap-0 rounded-xl p-1"
						style={{
							background: "rgba(9,9,11,0.6)",
							border: "1px solid rgba(129,140,248,0.08)",
						}}
					>
						<button
							type="button"
							onClick={() => switchTab("signin")}
							className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
								tab === "signin"
									? "text-white shadow-lg"
									: "text-zinc-500 hover:text-zinc-300"
							}`}
							style={
								tab === "signin"
									? {
											fontFamily: "'Space Grotesk', sans-serif",
											background: "linear-gradient(135deg, #818cf8, #6366f1)",
											boxShadow: "0 2px 10px rgba(99,102,241,0.25)",
										}
									: { fontFamily: "'Space Grotesk', sans-serif" }
							}
						>
							Sign in
						</button>
						<button
							type="button"
							onClick={() => switchTab("signup")}
							className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
								tab === "signup"
									? "text-white shadow-lg"
									: "text-zinc-500 hover:text-zinc-300"
							}`}
							style={
								tab === "signup"
									? {
											fontFamily: "'Space Grotesk', sans-serif",
											background: "linear-gradient(135deg, #818cf8, #6366f1)",
											boxShadow: "0 2px 10px rgba(99,102,241,0.25)",
										}
									: { fontFamily: "'Space Grotesk', sans-serif" }
							}
						>
							Create account
						</button>
					</div>

					{reason === "expired" && (
						<div className="mb-4 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-sm text-indigo-200">
							Your session has expired. Please sign in again.
						</div>
					)}

					{/* Sign In */}
					{tab === "signin" && (
						<form onSubmit={handleSignIn} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									placeholder={`you@${getBrandConfig().domain}`}
									autoComplete="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between">
									<Label htmlFor="password">Password</Label>
									<Link
										href="/forgot-password"
										className="text-xs text-indigo-400 no-underline hover:text-indigo-300"
									>
										Forgot password?
									</Link>
								</div>
								<Input
									id="password"
									type="password"
									placeholder="Your password"
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</div>
							{error && (
								<div className="flex flex-col gap-2">
									<AuthError message={error} />
									{errorType === "unverified" && (
										<ResendVerificationButton
											email={email}
											variant="outline"
											className="w-full"
										/>
									)}
									{errorType === "suspended" && (
										<p className="text-center text-xs text-zinc-500">
											Contact{" "}
											<a
												href={`mailto:${getBrandConfig().emails.support}`}
												className="text-indigo-400 no-underline underline-offset-4 hover:underline"
											>
												{getBrandConfig().emails.support}
											</a>
										</p>
									)}
								</div>
							)}
							<Button type="submit" className="w-full" disabled={loading}>
								{loading ? "Signing in..." : "Sign in"}
							</Button>
						</form>
					)}

					{/* Sign Up */}
					{tab === "signup" && (
						<form onSubmit={handleSignUp} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									type="text"
									placeholder="Your name"
									autoComplete="name"
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="signup-email">Email</Label>
								<Input
									id="signup-email"
									type="email"
									placeholder={`you@${getBrandConfig().domain}`}
									autoComplete="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="signup-password">Password</Label>
								<Input
									id="signup-password"
									type="password"
									placeholder="At least 12 characters"
									autoComplete="new-password"
									required
									minLength={8}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
								{password.length > 0 && (
									<div className="flex flex-col gap-1 mt-1">
										<div className="flex gap-1">
											{[0, 1, 2, 3, 4].map((i) => (
												<div
													key={i}
													className={`h-[3px] flex-1 rounded-full ${i < strength.score ? strengthColors[strength.score - 1] : "bg-zinc-800"}`}
												/>
											))}
										</div>
										<span
											className={`text-[11px] ${strength.score > 0 ? strengthLabelColors[strength.score - 1] : "text-muted-foreground"}`}
										>
											{strength.label}
										</span>
									</div>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="confirm-password">Confirm password</Label>
								<Input
									id="confirm-password"
									type="password"
									placeholder="Repeat your password"
									autoComplete="new-password"
									required
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
								/>
							</div>
							<div className="flex items-start gap-2.5 text-sm mt-1">
								<Checkbox
									id="agree-terms"
									checked={agreedToTerms}
									onCheckedChange={(checked) =>
										setAgreedToTerms(checked === true)
									}
									className="mt-0.5"
								/>
								<Label
									htmlFor="agree-terms"
									className="font-normal text-zinc-500 cursor-pointer leading-relaxed"
								>
									I agree to the{" "}
									<Link
										href="/terms"
										className="text-indigo-400 no-underline hover:underline"
									>
										Terms
									</Link>{" "}
									and{" "}
									<Link
										href="/privacy"
										className="text-indigo-400 no-underline hover:underline"
									>
										Privacy Policy
									</Link>
								</Label>
							</div>
							{error && <AuthError message={error} />}
							<Button type="submit" className="w-full" disabled={loading}>
								{loading ? "Creating account..." : "Create account"}
							</Button>
						</form>
					)}

					<OAuthButtons
						callbackUrl={sanitizeRedirectUrl(searchParams.get("callbackUrl"))}
					/>
				</div>
			</div>
		</div>
	);
}

export default function LoginPage() {
	return (
		<Suspense>
			<AuthRedirect />
			<AuthForm />
		</Suspense>
	);
}
