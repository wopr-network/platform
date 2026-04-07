/**
 * Flow Design Service — AI designs a custom flow for a repo.
 *
 * Takes the RepoConfig from interrogation and calls the gateway directly
 * (same pattern as FlowEditService — no runner provisioning needed).
 * Produces a custom flow definition that can be provisioned into the flow engine.
 */

import { logger } from "../logger.js";
import type {
  CreateFlowInput,
  CreateGateInput,
  CreateStateInput,
  CreateTransitionInput,
} from "../repositories/interfaces.js";
import { type FlowDesignResult, parseFlowDesignOutput, renderFlowDesignPrompt } from "./flow-design-prompt.js";
import type { InterrogationService } from "./interrogation-service.js";
import { accumulateSSEContent } from "./sse-utils.js";

export interface FlowDesignServiceConfig {
  interrogationService: InterrogationService;
  gatewayUrl: string;
  platformServiceKey: string;
  model?: string;
}

export interface DesignedFlow {
  flow: CreateFlowInput;
  states: CreateStateInput[];
  gates: CreateGateInput[];
  transitions: CreateTransitionInput[];
  gateWiring: Record<string, { fromState: string; trigger: string }>;
  notes: string;
}

export class FlowDesignService {
  private readonly interrogationService: InterrogationService;
  private readonly gatewayUrl: string;
  private readonly platformServiceKey: string;
  private readonly model: string;

  constructor(config: FlowDesignServiceConfig) {
    this.interrogationService = config.interrogationService;
    this.gatewayUrl = config.gatewayUrl;
    this.platformServiceKey = config.platformServiceKey;
    this.model = config.model ?? "claude-sonnet-4-20250514";
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.platformServiceKey}`,
    };
  }

  private async getPromptForRepo(repoFullName: string): Promise<string> {
    const configResult = await this.interrogationService.getConfig(repoFullName);
    if (!configResult) {
      throw new Error(`No repo config found for ${repoFullName}. Run interrogation first.`);
    }
    return renderFlowDesignPrompt(repoFullName, configResult.config);
  }

  /**
   * Design a custom flow for a repo based on its interrogation config.
   */
  async designFlow(repoFullName: string): Promise<DesignedFlow> {
    const tag = "[flow-design]";

    const prompt = await this.getPromptForRepo(repoFullName);

    logger.info(`${tag} calling gateway`, { repo: repoFullName, promptLength: prompt.length });

    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gateway call failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      model?: string;
      choices: Array<{ message: { content: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = data.choices[0];
    const content = choice?.message?.content;

    logger.info(`${tag} gateway response`, {
      repo: repoFullName,
      model: data.model,
      finishReason: choice?.finish_reason,
      contentLength: content?.length ?? 0,
      usage: data.usage,
    });

    if (!content) {
      throw new Error("Gateway returned empty content");
    }
    const result = parseFlowDesignOutput(content);

    logger.info(`${tag} complete`, {
      repo: repoFullName,
      stateCount: result.design.states.length,
      gateCount: result.design.gates.length,
      transitionCount: result.design.transitions.length,
      notes: result.notes,
    });

    return this.toDesignedFlow(result);
  }

  /**
   * Streaming variant of designFlow. Calls onChunk with text fragments as they
   * arrive from the gateway, then returns the final parsed result.
   */
  async designFlowStreaming(repoFullName: string, onChunk: (text: string) => void): Promise<DesignedFlow> {
    const tag = "[flow-design-stream]";

    const prompt = await this.getPromptForRepo(repoFullName);

    logger.info(`${tag} calling gateway (streaming)`, { repo: repoFullName, promptLength: prompt.length });

    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gateway call failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
    }

    if (!res.body) {
      throw new Error("Gateway returned no response body for streaming request");
    }

    const content = await accumulateSSEContent(res.body, onChunk);

    if (!content) {
      throw new Error("Gateway returned empty content");
    }

    const result = parseFlowDesignOutput(content);

    logger.info(`${tag} complete`, {
      repo: repoFullName,
      stateCount: result.design.states.length,
      gateCount: result.design.gates.length,
      transitionCount: result.design.transitions.length,
      notes: result.notes,
    });

    return this.toDesignedFlow(result);
  }

  /**
   * Convert parsed FlowDesignResult into Create*Input shapes
   * ready for the flow provisioner.
   */
  private toDesignedFlow(result: FlowDesignResult): DesignedFlow {
    const { design, notes } = result;

    const flow: CreateFlowInput = {
      name: design.flow.name,
      description: design.flow.description,
      initialState: design.flow.initialState,
      maxConcurrent: design.flow.maxConcurrent,
      maxConcurrentPerRepo: design.flow.maxConcurrentPerRepo,
      affinityWindowMs: design.flow.affinityWindowMs,
      claimRetryAfterMs: design.flow.claimRetryAfterMs,
      gateTimeoutMs: design.flow.gateTimeoutMs,
      defaultModelTier: design.flow.defaultModelTier,
      maxInvocationsPerEntity: design.flow.maxInvocationsPerEntity,
      discipline: "engineering",
    };

    const states: CreateStateInput[] = design.states.map((s) => ({
      name: s.name,
      agentRole: s.agentRole,
      modelTier: s.modelTier,
      mode: s.mode as CreateStateInput["mode"],
      promptTemplate: s.promptTemplate,
    }));

    const gates: CreateGateInput[] = design.gates.map((g) => ({
      name: g.name,
      type: g.type,
      primitiveOp: g.primitiveOp,
      primitiveParams: g.primitiveParams,
      timeoutMs: g.timeoutMs,
      failurePrompt: g.failurePrompt,
      timeoutPrompt: g.timeoutPrompt,
      outcomes: g.outcomes,
    }));

    const transitions: CreateTransitionInput[] = design.transitions.map((t) => ({
      fromState: t.fromState,
      toState: t.toState,
      trigger: t.trigger,
      priority: t.priority ?? 0,
    }));

    return { flow, states, gates, transitions, gateWiring: design.gateWiring, notes };
  }
}
