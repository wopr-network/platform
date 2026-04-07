import { type WOPRErrorBody, createError } from "./errors.js";

export interface ClientOptions {
	apiKey: string;
	baseURL: string;
	fetch?: typeof globalThis.fetch;
}

export class BaseResource {
	protected readonly apiKey: string;
	protected readonly baseURL: string;
	protected readonly fetch: typeof globalThis.fetch;

	constructor(opts: ClientOptions) {
		this.apiKey = opts.apiKey;
		this.baseURL = opts.baseURL.replace(/\/$/, ""); // strip trailing slash
		this.fetch = opts.fetch ?? globalThis.fetch;
	}

	/** Make a JSON POST request. Returns the parsed response body. */
	protected async post<T>(path: string, body: unknown): Promise<T> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return (await res.json()) as T;
	}

	/** Make a POST request that returns raw binary (e.g., audio/speech). */
	protected async postBinary(path: string, body: unknown): Promise<Response> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return res;
	}

	/** Make a POST request with multipart form data. */
	protected async postFormData<T>(path: string, formData: FormData): Promise<T> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				// Do NOT set Content-Type — fetch sets it automatically with boundary for FormData
			},
			body: formData,
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return (await res.json()) as T;
	}

	/** Make a POST request that returns an SSE stream. */
	protected async postStream(path: string, body: unknown): Promise<Response> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return res;
	}

	/** Make a GET request. */
	protected async get<T>(path: string): Promise<T> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
			},
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return (await res.json()) as T;
	}

	/** Make a DELETE request. */
	protected async delete<T>(path: string): Promise<T> {
		const res = await this.fetch(`${this.baseURL}${path}`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
			},
		});

		if (!res.ok) {
			throw createError(res.status, await parseErrorBody(res));
		}

		return (await res.json()) as T;
	}
}

async function parseErrorBody(res: Response): Promise<WOPRErrorBody> {
	try {
		return (await res.json()) as WOPRErrorBody;
	} catch {
		return {
			error: {
				message: `HTTP ${res.status}: ${res.statusText}`,
				type: "server_error",
				code: "unknown_error",
			},
		};
	}
}
