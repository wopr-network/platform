import type OpenAI from "openai";
import { BaseResource } from "../base.js";

export type EmbeddingCreateParams = OpenAI.EmbeddingCreateParams;
export type CreateEmbeddingResponse = OpenAI.CreateEmbeddingResponse;

export class Embeddings extends BaseResource {
	/** Create embeddings. */
	async create(params: EmbeddingCreateParams): Promise<CreateEmbeddingResponse> {
		return this.post<CreateEmbeddingResponse>("/embeddings", params);
	}
}
