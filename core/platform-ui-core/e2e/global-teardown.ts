import { stopMockApiServer } from "./mock-api-server";

export default async function globalTeardown() {
	await stopMockApiServer();
	console.log("[e2e] Mock API server stopped");
}
