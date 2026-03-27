import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 90000,
	retries: 0,
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: "https://app.nemopod.com",
		headless: true,
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: "e2e/.auth/user.json",
			},
		},
	],
});
