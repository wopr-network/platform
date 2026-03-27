import * as http from "node:http";

export const E2E_ADMIN_TOKEN = "e2e-admin-token";

function parseSessionToken(cookieHeader: string | undefined): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(
		/(?:better-auth\.session_token|__Secure-better-auth\.session_token)=([^;]+)/,
	);
	return match?.[1] ?? null;
}

function handleGetSession(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): void {
	const token = parseSessionToken(req.headers.cookie);
	const isAdmin = token === E2E_ADMIN_TOKEN;

	const body = JSON.stringify(
		token
			? {
					user: {
						id: "e2e-user-id",
						name: isAdmin ? "E2E Admin User" : "E2E Test User",
						email: isAdmin ? "admin@wopr.test" : "e2e@wopr.test",
						emailVerified: true,
						twoFactorEnabled: false,
						role: isAdmin ? "platform_admin" : "user",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
					session: {
						id: "e2e-session-id",
						userId: "e2e-user-id",
						token,
						expiresAt: new Date(Date.now() + 86400000).toISOString(),
					},
				}
			: null,
	);

	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(body);
}

let server: http.Server | null = null;

export function startMockApiServer(port = 3001): Promise<http.Server> {
	return new Promise((resolve, reject) => {
		server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "/", `http://localhost:${port}`);

			if (url.pathname === "/api/auth/get-session" && req.method === "GET") {
				handleGetSession(req, res);
				return;
			}

			// Catch-all: 503 with descriptive error
			res.writeHead(503, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					error: `Mock API: no handler for ${req.method} ${url.pathname}`,
				}),
			);
		});

		server.on("error", reject);
		server.listen(port, () => resolve(server!));
	});
}

export function stopMockApiServer(): Promise<void> {
	return new Promise((resolve) => {
		if (!server) {
			resolve();
			return;
		}
		server.closeAllConnections();
		server.close(() => resolve());
		server = null;
	});
}
