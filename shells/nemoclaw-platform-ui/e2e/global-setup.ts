import { setupAuth } from "./fixtures/auth";

export default async function globalSetup() {
	await setupAuth();
}
