import { startMockApiServer } from "./mock-api-server";

export default async function globalSetup() {
	await startMockApiServer(3001);
	console.log("[e2e] Mock API server started on port 3001");
}
