/** Raw error body shape from the gateway. */
export interface WOPRErrorBody {
	error: {
		message: string;
		type: string;
		code: string;
		/** Present on credit errors */
		needsCredits?: boolean;
		topUpUrl?: string;
		currentBalanceCents?: number;
		requiredCents?: number;
	};
}

/** Base error class for all SDK errors. */
export class WOPRError extends Error {
	readonly status: number;
	readonly type: string;
	readonly code: string;

	constructor(status: number, body: WOPRErrorBody) {
		super(body.error.message);
		this.name = "WOPRError";
		this.status = status;
		this.type = body.error.type;
		this.code = body.error.code;
	}
}

/** 401 — Invalid or missing API key */
export class AuthenticationError extends WOPRError {
	constructor(status: number, body: WOPRErrorBody) {
		super(status, body);
		this.name = "AuthenticationError";
	}
}

/** 402 — Insufficient credits */
export class InsufficientCreditsError extends WOPRError {
	readonly needsCredits: boolean;
	readonly topUpUrl?: string;
	readonly currentBalanceCents?: number;
	readonly requiredCents?: number;

	constructor(status: number, body: WOPRErrorBody) {
		super(status, body);
		this.name = "InsufficientCreditsError";
		this.needsCredits = body.error.needsCredits ?? true;
		this.topUpUrl = body.error.topUpUrl;
		this.currentBalanceCents = body.error.currentBalanceCents;
		this.requiredCents = body.error.requiredCents;
	}
}

/** 429 — Rate limit exceeded */
export class RateLimitError extends WOPRError {
	constructor(status: number, body: WOPRErrorBody) {
		super(status, body);
		this.name = "RateLimitError";
	}
}

/** 4xx — Upstream provider returned an error */
export class ProviderError extends WOPRError {
	constructor(status: number, body: WOPRErrorBody) {
		super(status, body);
		this.name = "ProviderError";
	}
}

/** 5xx — Server or upstream error */
export class ServerError extends WOPRError {
	constructor(status: number, body: WOPRErrorBody) {
		super(status, body);
		this.name = "ServerError";
	}
}

/** Map an HTTP status + body to the appropriate typed error. */
export function createError(status: number, body: WOPRErrorBody): WOPRError {
	if (status === 401) return new AuthenticationError(status, body);
	if (status === 402) return new InsufficientCreditsError(status, body);
	if (status === 429) return new RateLimitError(status, body);
	if (status >= 400 && status < 500) return new ProviderError(status, body);
	return new ServerError(status, body);
}
