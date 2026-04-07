import type OpenAI from "openai";
import { BaseResource } from "../base.js";

export type CompletionCreateParams = OpenAI.CompletionCreateParams;
export type Completion = OpenAI.Completion;

export class Completions extends BaseResource {
	/** Create a text completion. */
	async create(params: CompletionCreateParams): Promise<Completion> {
		return this.post<Completion>("/completions", params);
	}
}
