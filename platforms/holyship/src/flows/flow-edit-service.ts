/**
 * Flow Edit Service — AI edits an existing flow via natural language.
 *
 * Calls the gateway directly (no runner provisioning needed — flow editing is
 * a stateless prompt with no repo access required).
 */

import { logger } from "../logger.js";
import { type FlowEditResult, parseFlowEditOutput, renderFlowEditPrompt } from "./flow-edit-prompt.js";

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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.platformServiceKey}`,
    };
    if (attributeTenantId) {
      headers["X-Attribute-To"] = attributeTenantId;
    }

    const res = await fetch(`${this.gatewayUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
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
}
