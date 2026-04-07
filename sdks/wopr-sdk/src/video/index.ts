import { z } from "zod";
import { BaseResource } from "../base.js";

/** Zod schema for video generation request. */
export const VideoGenerateParamsSchema = z.object({
	prompt: z.string().min(1, "Prompt is required"),
	duration: z.number().int().min(1).max(60).optional().default(4),
});

export type VideoGenerateParams = z.input<typeof VideoGenerateParamsSchema>;

/** Response from video generation. */
export interface VideoGenerateResponse {
	created: number;
	data: Array<{ url: string }>;
}

export class Video extends BaseResource {
	/** Generate a video from a prompt. */
	async generate(params: VideoGenerateParams): Promise<VideoGenerateResponse> {
		const validated = VideoGenerateParamsSchema.parse(params);
		return this.post<VideoGenerateResponse>("/video/generations", validated);
	}
}
