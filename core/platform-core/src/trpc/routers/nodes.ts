/**
 * tRPC nodes router — fleet node management.
 *
 * DI factory — no singletons.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";
import type { NodeConnectionRegistry } from "../../fleet/node-connection-registry.js";
import type { INodeRepository } from "../../fleet/node-repository.js";
import type { IRegistrationTokenRepository } from "../../fleet/registration-token-store.js";
import { protectedProcedure, router } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface NodesRouterDeps {
  getRegistrationTokenStore: () => IRegistrationTokenRepository;
  getNodeRepo: () => INodeRepository;
  getConnectionRegistry: () => NodeConnectionRegistry;
  getBotInstanceRepo: () => IBotInstanceRepository;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNodesRouter(deps: NodesRouterDeps) {
  return router({
    createRegistrationToken: protectedProcedure
      .input(
        z.object({
          label: z.string().max(100).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = deps.getRegistrationTokenStore();
        const { token, expiresAt } = await store.create(ctx.user.id, input.label);

        return {
          token,
          expiresAt,
          installCommand: `curl -sSL https://install.${process.env.PLATFORM_DOMAIN ?? "wopr.bot"}/agent | bash -s -- ${token}`,
          npmCommand: `REGISTRATION_TOKEN=${token} npx @wopr-network/node-agent`,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const nodeRepo = deps.getNodeRepo();
      const registry = deps.getConnectionRegistry();
      const allNodes = await nodeRepo.list();

      const isAdmin = ctx.user.roles.includes("platform_admin");
      const userNodes = isAdmin ? allNodes : allNodes.filter((n) => n.ownerUserId === ctx.user.id);

      return userNodes.map((node) => ({
        id: node.id,
        label: node.label ?? node.id,
        host: node.host,
        status: node.status,
        isConnected: registry.isConnected(node.id),
        capacityMb: node.capacityMb,
        usedMb: node.usedMb,
        agentVersion: node.agentVersion,
        lastHeartbeatAt: node.lastHeartbeatAt,
        registeredAt: node.registeredAt,
      }));
    }),

    get: protectedProcedure.input(z.object({ nodeId: z.string().min(1) })).query(async ({ input, ctx }) => {
      const nodeRepo = deps.getNodeRepo();
      const registry = deps.getConnectionRegistry();
      const botInstanceRepo = deps.getBotInstanceRepo();
      const node = await nodeRepo.getById(input.nodeId);

      if (!node) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Node not found" });
      }

      const isAdmin = ctx.user.roles.includes("platform_admin");
      if (!isAdmin && node.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Node not found" });
      }

      const now = Math.floor(Date.now() / 1000);
      const lastSeenAgo = node.lastHeartbeatAt != null ? now - node.lastHeartbeatAt : null;

      return {
        ...node,
        isConnected: registry.isConnected(input.nodeId),
        lastSeenAgoS: lastSeenAgo,
        tenants: await botInstanceRepo.listByNode(input.nodeId),
      };
    }),

    remove: protectedProcedure.input(z.object({ nodeId: z.string().min(1) })).mutation(async ({ input, ctx }) => {
      const nodeRepo = deps.getNodeRepo();
      const registry = deps.getConnectionRegistry();
      const botInstanceRepo = deps.getBotInstanceRepo();
      const node = await nodeRepo.getById(input.nodeId);

      if (!node) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Node not found" });
      }

      if (node.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your node" });
      }

      const tenants = await botInstanceRepo.listByNode(input.nodeId);
      if (tenants.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Node has ${tenants.length} active bot(s). Migrate them first.`,
        });
      }

      registry.close(input.nodeId);
      await nodeRepo.delete(input.nodeId);
      return { success: true };
    }),

    listTokens: protectedProcedure.query(async ({ ctx }) => {
      const store = deps.getRegistrationTokenStore();
      return store.listActive(ctx.user.id);
    }),
  });
}
