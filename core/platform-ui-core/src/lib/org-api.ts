import type { Organization, OrgInvite } from "./api";
import { trpcVanilla } from "./trpc";

interface OrgInviteRow {
  id: string;
  orgId: string;
  email: string;
  role: "admin" | "member";
  invitedBy: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

// ---- API calls ----

export async function getOrganization(): Promise<Organization> {
  return trpcVanilla.org.getOrganization.query(undefined);
}

export async function updateOrganization(
  orgId: string,
  data: { name?: string; slug?: string; billingEmail?: string },
): Promise<Organization> {
  return trpcVanilla.org.updateOrganization.mutate({ orgId, ...data });
}

export async function inviteMember(
  orgId: string,
  email: string,
  role: "admin" | "member",
): Promise<OrgInvite> {
  const row = await trpcVanilla.org.inviteMember.mutate({ orgId, email, role });
  const typed = row as OrgInviteRow;
  return {
    id: typed.id,
    email: typed.email,
    role: typed.role,
    invitedBy: typed.invitedBy,
    expiresAt: new Date(typed.expiresAt).toISOString(),
    createdAt: new Date(typed.createdAt).toISOString(),
  };
}

export async function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  await trpcVanilla.org.revokeInvite.mutate({ orgId, inviteId });
}

export async function changeRole(
  orgId: string,
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  await trpcVanilla.org.changeRole.mutate({ orgId, userId, role });
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await trpcVanilla.org.removeMember.mutate({ orgId, userId });
}

export async function transferOwnership(orgId: string, userId: string): Promise<void> {
  await trpcVanilla.org.transferOwnership.mutate({ orgId, userId });
}

export async function deleteOrganization(orgId: string): Promise<void> {
  await trpcVanilla.org.deleteOrganization.mutate({ orgId });
}

export async function createOrganization(data: {
  name: string;
  slug?: string;
}): Promise<{ id: string; name: string; slug: string }> {
  return trpcVanilla.org.createOrganization.mutate(data);
}

export async function listMyOrganizations(): Promise<
  Array<{ id: string; name: string; slug: string; role: "owner" | "admin" | "member" }>
> {
  return trpcVanilla.org.listMyOrganizations.query(undefined);
}

export async function acceptInvite(token: string): Promise<{ orgId: string; orgName: string }> {
  return trpcVanilla.org.acceptInvite.mutate({ token });
}
