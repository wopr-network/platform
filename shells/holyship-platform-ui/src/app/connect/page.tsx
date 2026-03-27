import { redirect } from "next/navigation";

const GITHUB_APP_URL =
	process.env.NEXT_PUBLIC_GITHUB_APP_URL ?? "https://github.com/apps/holy-ship";

export default function ConnectPage() {
	redirect(`${GITHUB_APP_URL}/installations/new`);
}
