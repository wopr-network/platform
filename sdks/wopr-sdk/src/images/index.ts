import type OpenAI from "openai";
import { BaseResource } from "../base.js";

export type ImageGenerateParams = OpenAI.ImageGenerateParams;
export type ImagesResponse = OpenAI.ImagesResponse;

export class Images extends BaseResource {
	/** Generate images from a prompt. */
	async generate(params: ImageGenerateParams): Promise<ImagesResponse> {
		return this.post<ImagesResponse>("/images/generations", params);
	}
}
