/**
 * Flow Edit Service — AI edits an existing flow via natural language.
 *
 * Calls the gateway directly (no runner provisioning needed — flow editing is
 * a stateless prompt with no repo access required).
 */

import { logger } from "../logger.js";
import { type FlowEditResult, parseFlowEditOutput, renderFlowEditPrompt } from "./flow-edit-prompt.js";
import { accumulateSSEContent } from "./sse-utils.js";

export interface FlowEditServiceConfig {
  gatewayUrl: string;
  platformServiceKey: string;
  model?: string;
}

export class FlowEditService {
  private readonly gatewayUrl: string;
  private readonly platformServiceKey: string;
  private readonly model: string;

  constructor(config: FlowEditServiceConfig) {
    this.gatewayUrl = config.gatewayUrl;
    this.platformServiceKey = config.platformServiceKey;
    this.model = config.model ?? "claude-sonnet-4-20250514";
  }

  private buildHeaders(attributeTenantId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.platformServiceKey}`,
    };
    if (attributeTenantId) {
      headers["X-Attribute-To"] = attributeTenantId;
    }
    return headers;
  }

  /**
   * Edit a flow via natural language. Calls the gateway directly and returns
   * the updated YAML with explanation and diff.
   */
  async editFlow(
    repoFullName: string,
    message: string,
    currentYaml: string,
    attributeTenantId?: string,
  ): Promise<FlowEditResult> {
    const tag = "[flow-edit]";
    logger.info(`${tag} starting`, { repo: repoFullName });

    const prompt = renderFlowEditPrompt(currentYaml, message);

    logger.info(`${tag} calling gateway`, { repo: repoFullName, promptLength: prompt.length });

    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(attributeTenantId),
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gateway call failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Gateway returned empty content");
    }

    logger.info(`${tag} parsing output`, { repo: repoFullName, outputLength: content.length });
    const result = parseFlowEditOutput(content);

    logger.info(`${tag} complete`, { repo: repoFullName, diffCount: result.diff.length });
    return result;
  }

  /**
   * Streaming variant of editFlow. Calls onChunk with text fragments as they
   * arrive from the gateway, then returns the final parsed result.
   */
  async editFlowStreaming(
    repoFullName: string,
    message: string,
    currentYaml: string,
    onChunk: (text: string) => void,
    attributeTenantId?: string,
  ): Promise<FlowEditResult> {
    const tag = "[flow-edit-stream]";
    logger.info(`${tag} starting`, { repo: repoFullName });

    const prompt = renderFlowEditPrompt(currentYaml, message);

    logger.info(`${tag} calling gateway (streaming)`, { repo: repoFullName, promptLength: prompt.length });

    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(attributeTenantId),
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

    logger.info(`${tag} parsing output`, { repo: repoFullName, outputLength: content.length });
    const result = parseFlowEditOutput(content);

    logger.info(`${tag} complete`, { repo: repoFullName, diffCount: result.diff.length });
    return result;
  }
}
