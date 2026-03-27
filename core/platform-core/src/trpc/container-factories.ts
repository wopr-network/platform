/**
 * Container-based tRPC router factories.
 *
 * Each function accepts a PlatformContainer (plus any extra deps not yet on
 * the container) and returns a tRPC router by delegating to the existing
 * factory functions. This provides a single-call DI entry point for products
 * that have migrated to the container pattern, while the existing factory
 * functions and setter-based API remain fully functional for products that
 * haven't migrated yet.
 */

import type { INotificationTemplateRepository } from "../email/notification-template-repository.js";
import type { RolloutOrchestrator } from "../fleet/rollout-orchestrator.js";
import type { ITenantUpdateConfigRepository } from "../fleet/tenant-update-config-repository.js";
import type { ProductConfigService } from "../product-config/service.js";
import type { PlatformContainer } from "../server/container.js";
import { createAdminFleetUpdateRouter } from "./admin-fleet-update-router.js";
import { createFleetUpdateConfigRouter } from "./fleet-update-config-router.js";
import { setTrpcOrgMemberRepo } from "./init.js";
import { createNotificationTemplateRouter } from "./notification-template-router.js";
import {
  createOrgRemovePaymentMethodRouter,
  type OrgRemovePaymentMethodDeps,
} from "./org-remove-payment-method-router.js";
import { createProductConfigRouter } from "./product-config-router.js";

// ---------------------------------------------------------------------------
// Init / middleware wiring
// ---------------------------------------------------------------------------

/**
 * Wire the PlatformContainer's orgMemberRepo into the tRPC middleware layer.
 *
 * This replaces the manual `setTrpcOrgMemberRepo()` call. Products using the
 * container call this once at boot; the setter-based API remains for products
 * that haven't migrated yet.
 */
export function initTrpcFromContainer(container: PlatformContainer): void {
  setTrpcOrgMemberRepo(container.orgMemberRepo);
}

// ---------------------------------------------------------------------------
// Router factories — thin wrappers over existing factory functions
// ---------------------------------------------------------------------------

/**
 * Create the admin fleet-update router from a container.
 *
 * Requires additional fleet-specific deps (orchestrator + config repo) that
 * are constructed at boot when fleet is enabled and are not yet on the
 * PlatformContainer itself.
 */
export function createAdminFleetUpdateRouterFromContainer(
  _container: PlatformContainer,
  getOrchestrator: () => RolloutOrchestrator,
  getConfigRepo: () => ITenantUpdateConfigRepository,
) {
  return createAdminFleetUpdateRouter(getOrchestrator, getConfigRepo);
}

/**
 * Create the fleet-update-config router from a container.
 *
 * Requires the tenant-update-config repository getter (fleet-specific dep
 * not yet on PlatformContainer).
 */
export function createFleetUpdateConfigRouterFromContainer(
  _container: PlatformContainer,
  getConfigRepo: () => ITenantUpdateConfigRepository,
) {
  return createFleetUpdateConfigRouter(getConfigRepo);
}

/**
 * Create the notification-template router from a container.
 *
 * Requires a getter for the notification-template repository (not yet on
 * PlatformContainer).
 */
export function createNotificationTemplateRouterFromContainer(
  _container: PlatformContainer,
  getRepo: () => INotificationTemplateRepository,
) {
  return createNotificationTemplateRouter(getRepo);
}

/**
 * Create the org-remove-payment-method router from a container.
 *
 * The container's StripeServices.processor is typed narrowly (webhook-only),
 * so this still requires the full OrgRemovePaymentMethodDeps to be supplied
 * until the container's Stripe sub-container is widened to include
 * IPaymentProcessor.
 */
export function createOrgRemovePaymentMethodRouterFromContainer(
  _container: PlatformContainer,
  getDeps: () => OrgRemovePaymentMethodDeps,
) {
  return createOrgRemovePaymentMethodRouter(getDeps);
}

/**
 * Create the product-config router from a container.
 *
 * Requires a getter for ProductConfigService and the product slug, both of
 * which are product-specific and not on PlatformContainer.
 */
export function createProductConfigRouterFromContainer(
  _container: PlatformContainer,
  getService: () => ProductConfigService,
  productSlug: string,
) {
  return createProductConfigRouter(getService, productSlug);
}
