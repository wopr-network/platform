import { apiFetch } from "@core/lib/api";

/** PUT /api/provision/budget — Update instance spending budget. */
export async function updateInstanceBudget(
	id: string,
	budgetCents: number,
	perAgentCents?: number,
): Promise<void> {
	await apiFetch("/api/provision/budget", {
		method: "PUT",
		body: JSON.stringify({ instanceId: id, budgetCents, perAgentCents }),
	});
}
