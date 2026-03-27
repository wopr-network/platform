/**
 * OrgService — business logic for org member management, invite lifecycle,
 * role changes, and org CRUD. Depends on IOrgRepository (tenant data) and
 * IOrgMemberRepository (members/invites data).
 */

import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.js";
import type { IAuthUserRepository } from "../db/auth-user-repository.js";
import type { PlatformDb } from "../db/index.js";
import { organizationInvites, organizationMembers, tenants } from "../db/schema/index.js";
import type { IOrgRepository, Tenant } from "./drizzle-org-repository.js";
import type { IOrgMemberRepository, OrgInviteRow } from "./org-member-repository.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgWithMembers extends Tenant {
  members: OrgMemberWithUser[];
  invites: OrgInvitePublic[];
}

export interface OrgMemberWithUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface OrgInvitePublic {
  id: string;
  email: string;
  role: "admin" | "member";
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface OrgServiceOptions {
  /** Hook called inside deleteOrg transaction before members/invites/tenant rows are deleted. */
  onBeforeDeleteOrg?: (orgId: string, tx: PlatformDb) => Promise<void>;
  /** Optional user profile resolver for populating member name/email. */
  userRepo?: IAuthUserRepository;
}

export class OrgService {
  private readonly onBeforeDeleteOrg?: (orgId: string, tx: PlatformDb) => Promise<void>;
  private readonly userRepo?: IAuthUserRepository;

  constructor(
    private readonly orgRepo: IOrgRepository,
    private readonly memberRepo: IOrgMemberRepository,
    private readonly db: PlatformDb,
    options?: OrgServiceOptions,
  ) {
    this.onBeforeDeleteOrg = options?.onBeforeDeleteOrg;
    this.userRepo = options?.userRepo;
  }

  /**
   * Return the personal org for the user, creating it if it doesn't exist.
   * "Personal org" = the user's personal tenant (type="personal").
   */
  async getOrCreatePersonalOrg(userId: string, displayName: string): Promise<OrgWithMembers> {
    const tenant = await this.orgRepo.ensurePersonalTenant(userId, displayName);
    // Ensure the owner member row exists. Use addMember (which uses ON CONFLICT DO NOTHING)
    // unconditionally to handle concurrent calls that may race past findMember.
    await this.memberRepo.addMember({
      id: crypto.randomUUID(),
      orgId: tenant.id,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });
    return this.buildOrgWithMembers(tenant);
  }

  /**
   * Create a new team organization. The caller becomes the owner.
   * Returns the created org's id, name, and slug.
   */
  async createOrg(userId: string, name: string, slug?: string): Promise<{ id: string; name: string; slug: string }> {
    if (!name.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Org name cannot be blank or whitespace only" });
    }
    if (slug !== undefined) {
      this.validateSlug(slug);
      const existing = await this.orgRepo.getBySlug(slug);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
      }
    }
    const tenant = await this.orgRepo.createOrg(userId, name, slug);
    try {
      await this.memberRepo.addMember({
        id: crypto.randomUUID(),
        orgId: tenant.id,
        userId,
        role: "owner",
        joinedAt: Date.now(),
      });
    } catch (err) {
      // Compensating delete: remove the orphan tenant if member creation fails
      await this.db
        .delete(tenants)
        .where(eq(tenants.id, tenant.id))
        .catch((deleteErr) => {
          logger.error("Compensating org delete failed — orphaned tenant record", {
            err: deleteErr,
            tenantId: tenant.id,
          });
        });
      throw err;
    }
    return { id: tenant.id, name: tenant.name, slug: tenant.slug ?? "" };
  }

  /** Get an org's details, including member/invite lists. */
  async getOrg(orgId: string): Promise<OrgWithMembers> {
    const tenant = await this.requireOrg(orgId);
    return this.buildOrgWithMembers(tenant);
  }

  async updateOrg(
    orgId: string,
    actorUserId: string,
    data: { name?: string; slug?: string; billingEmail?: string | null },
  ): Promise<Tenant> {
    await this.requireAdminOrOwner(orgId, actorUserId);
    if (data.slug !== undefined) {
      this.validateSlug(data.slug);
      const existing = await this.orgRepo.getBySlug(data.slug);
      if (existing && existing.id !== orgId) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
      }
    }
    return this.orgRepo.updateOrg(orgId, data);
  }

  async deleteOrg(orgId: string, actorUserId: string): Promise<void> {
    const org = await this.requireOrg(orgId);
    if (org.ownerId !== actorUserId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete the organization" });
    }
    await this.db.transaction(async (tx) => {
      // Let consumer clean up domain-specific tables (e.g., bot instances, VPS subscriptions)
      if (this.onBeforeDeleteOrg) {
        await this.onBeforeDeleteOrg(orgId, tx as unknown as PlatformDb);
      }
      await tx.delete(organizationInvites).where(eq(organizationInvites.orgId, orgId));
      await tx.delete(organizationMembers).where(eq(organizationMembers.orgId, orgId));
      await tx.delete(tenants).where(eq(tenants.id, orgId));
    });
  }

  async inviteMember(
    orgId: string,
    actorUserId: string,
    email: string,
    role: "admin" | "member",
  ): Promise<OrgInviteRow> {
    await this.requireAdminOrOwner(orgId, actorUserId);
    const token = crypto.randomBytes(32).toString("hex");
    const invite: OrgInviteRow = {
      id: crypto.randomUUID(),
      orgId,
      email,
      role,
      invitedBy: actorUserId,
      token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      acceptedAt: null,
      revokedAt: null,
    };
    await this.memberRepo.createInvite(invite);
    return invite;
  }

  async revokeInvite(orgId: string, actorUserId: string, inviteId: string): Promise<void> {
    await this.requireAdminOrOwner(orgId, actorUserId);
    const invite = await this.memberRepo.findInviteById(inviteId);
    if (!invite || invite.orgId !== orgId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
    }
    await this.memberRepo.deleteInvite(inviteId);
  }

  async changeRole(
    orgId: string,
    actorUserId: string,
    targetUserId: string,
    newRole: "admin" | "member",
  ): Promise<void> {
    await this.requireAdminOrOwner(orgId, actorUserId);
    const org = await this.requireOrg(orgId);
    if (org.ownerId === targetUserId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot change the owner's role. Use transfer ownership instead.",
      });
    }
    const member = await this.memberRepo.findMember(orgId, targetUserId);
    if (!member) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    }
    await this.memberRepo.updateMemberRole(orgId, targetUserId, newRole);
  }

  async removeMember(orgId: string, actorUserId: string, targetUserId: string): Promise<void> {
    await this.requireAdminOrOwner(orgId, actorUserId);
    const org = await this.requireOrg(orgId);
    if (org.ownerId === targetUserId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the owner" });
    }
    const member = await this.memberRepo.findMember(orgId, targetUserId);
    if (!member) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    }
    if (member.role === "admin") {
      const count = await this.memberRepo.countAdminsAndOwners(orgId);
      if (count <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the last admin" });
      }
    }
    await this.memberRepo.removeMember(orgId, targetUserId);
  }

  async transferOwnership(orgId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const org = await this.requireOrg(orgId);
    if (org.ownerId !== actorUserId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can transfer ownership" });
    }
    const target = await this.memberRepo.findMember(orgId, targetUserId);
    if (!target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Target member not found" });
    }
    await this.memberRepo.updateMemberRole(orgId, targetUserId, "owner");
    await this.memberRepo.updateMemberRole(orgId, actorUserId, "admin");
    await this.orgRepo.updateOwner(orgId, targetUserId);
  }

  async acceptInvite(token: string, userId: string): Promise<{ orgId: string; role: string }> {
    const invite = await this.memberRepo.findInviteByToken(token);
    if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
    if (invite.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already accepted" });
    // revokedAt guard — currently no UI sets this field, but the schema supports it
    // for future use (e.g., admin revokes an outstanding invite).
    if (invite.revokedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has been revoked" });
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
    }

    // Guard: reject if user is already a member (prevents consuming the invite silently)
    const existing = await this.memberRepo.findMember(invite.orgId, userId);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "User is already a member of this organization" });
    }

    await this.memberRepo.addMember({
      id: crypto.randomUUID(),
      orgId: invite.orgId,
      userId,
      role: invite.role ?? "member",
      joinedAt: Date.now(),
    });
    await this.memberRepo.markInviteAccepted(invite.id);
    return { orgId: invite.orgId, role: invite.role ?? "member" };
  }

  async listOrgsForUser(userId: string): Promise<Array<{ orgId: string; role: string }>> {
    return this.memberRepo.listOrgsByUser(userId);
  }

  validateSlug(slug: string): void {
    if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Slug must be 3-48 characters, lowercase alphanumeric and hyphens, cannot start/end with a hyphen",
      });
    }
  }

  private async buildOrgWithMembers(tenant: Tenant): Promise<OrgWithMembers> {
    const members = await this.memberRepo.listMembers(tenant.id);
    const invites = await this.memberRepo.listInvites(tenant.id);

    // Batch-resolve user profiles when a userRepo is available.
    let profileMap: Map<string, { name: string; email: string }> | undefined;
    const userRepo = this.userRepo;
    if (userRepo) {
      const results = await Promise.allSettled(members.map((m) => userRepo.getUser(m.userId)));
      profileMap = new Map();
      for (let i = 0; i < members.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled" && result.value) {
          profileMap.set(members[i].userId, { name: result.value.name, email: result.value.email });
        }
      }
    }

    return {
      ...tenant,
      members: members.map((m) => {
        const resolved = profileMap?.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          name: resolved?.name ?? m.userId,
          email: resolved?.email ?? "",
          role: m.role,
          joinedAt: new Date(m.joinedAt).toISOString(),
        };
      }),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedBy: i.invitedBy,
        expiresAt: new Date(i.expiresAt).toISOString(),
        createdAt: new Date(i.createdAt).toISOString(),
      })),
    };
  }

  private async requireOrg(orgId: string): Promise<Tenant> {
    const org = await this.orgRepo.getById(orgId);
    if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
    return org;
  }

  async requireAdminOrOwner(orgId: string, userId: string): Promise<void> {
    const member = await this.memberRepo.findMember(orgId, userId);
    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner role required" });
    }
  }

  async requireOwner(orgId: string, userId: string): Promise<void> {
    const member = await this.memberRepo.findMember(orgId, userId);
    if (!member || member.role !== "owner") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Owner role required" });
    }
  }
}
