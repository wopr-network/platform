import { BaseResource } from "../base.js";

export interface ModelInfo {
	id: string;
	object: "model";
	created: number;
	owned_by: string;
	capability: string;
	tier: "standard" | "premium" | "byok";
}

export interface ModelsListResponse {
	object: "list";
	data: ModelInfo[];
}

export class Models extends BaseResource {
	/** List all available models. */
	async list(): Promise<ModelsListResponse> {
		return this.get<ModelsListResponse>("/models");
	}
}
