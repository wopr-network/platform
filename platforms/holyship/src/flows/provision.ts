/**
 * Provision the built-in engineering flow for a tenant.
 *
 * Called once when a tenant signs up. Inserts the flow, all states,
 * all gates, and all transitions with gates wired up.
 *
 * The flow is opinionated — gates are non-negotiable. Users customize
 * via the pipeline configurator (toggle stages, add approval checkpoints).
 */

import type { Flow, IFlowRepository, IGateRepository } from "../repositories/interfaces.js";
import { ENGINEERING_FLOW, GATE_WIRING, GATES, STATES, TRANSITIONS } from "./engineering.js";

export async function provisionEngineeringFlow(
  flowRepo: IFlowRepository,
  gateRepo: IGateRepository,
): Promise<{ flowId: string }> {
  // Check if already provisioned (idempotent)
  const existing = await flowRepo.getByName(ENGINEERING_FLOW.name);
  if (existing) {
    // Reconcile gate AND state definitions so primitiveOp/params, prompts,
    // and state prompt templates stay in sync with source. Without this,
    // any change in engineering.ts silently diverges from prod because
    // provision short-circuits on "already created". Only mutable fields
    // are touched; state/gate IDs (and therefore transition wiring) are
    // preserved.
    await reconcileGates(gateRepo);
    await reconcileStates(flowRepo, existing);
    return { flowId: existing.id };
  }

  // 1. Create the flow
  const flow = await flowRepo.create(ENGINEERING_FLOW);

  // 2. Add all states
  for (const state of STATES) {
    await flowRepo.addState(flow.id, state);
  }

  // 3. Create all gates
  const gateIds = new Map<string, string>();
  for (const gate of GATES) {
    const created = await gateRepo.create(gate);
    gateIds.set(gate.name, created.id);
  }

  // 4. Add all transitions, wiring gates where specified
  for (const transition of TRANSITIONS) {
    const wiring = Object.entries(GATE_WIRING).find(
      ([, w]) => w.fromState === transition.fromState && w.trigger === transition.trigger,
    );
    const gateId = wiring ? gateIds.get(wiring[0]) : undefined;
    await flowRepo.addTransition(flow.id, {
      ...transition,
      gateId,
    });
  }

  return { flowId: flow.id };
}

async function reconcileGates(gateRepo: IGateRepository): Promise<void> {
  for (const gate of GATES) {
    const existing = await gateRepo.getByName(gate.name);
    if (!existing) continue; // new gates get created on next clean provision
    await gateRepo.update(existing.id, {
      primitiveOp: gate.primitiveOp ?? null,
      primitiveParams: gate.primitiveParams ?? null,
      timeoutMs: gate.timeoutMs ?? null,
      failurePrompt: gate.failurePrompt ?? null,
      timeoutPrompt: gate.timeoutPrompt ?? null,
      outcomes: gate.outcomes ?? null,
    });
  }
}

async function reconcileStates(flowRepo: IFlowRepository, flow: Flow): Promise<void> {
  // `flow` comes from getByName(), which already hydrates states[] — no need
  // to re-fetch. Name isn't in the payload because byName matched on it and
  // the DB row's name already equals state.name; writing it back every boot
  // is pointless churn.
  const byName = new Map(flow.states.map((s) => [s.name, s]));
  for (const state of STATES) {
    const existing = byName.get(state.name);
    if (!existing) continue; // new states get created on next clean provision
    await flowRepo.updateState(existing.id, {
      agentRole: state.agentRole ?? null,
      modelTier: state.modelTier ?? null,
      mode: state.mode,
      promptTemplate: state.promptTemplate ?? null,
      constraints: state.constraints ?? null,
      onEnter: state.onEnter ?? null,
      onExit: state.onExit ?? null,
      retryAfterMs: state.retryAfterMs ?? null,
      meta: state.meta ?? null,
    });
  }
}
