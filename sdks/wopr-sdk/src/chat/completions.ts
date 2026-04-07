import type OpenAI from "openai";
import { BaseResource, type ClientOptions } from "../base.js";
import { type ChatCompletionChunk, Stream, parseSSEStream } from "../streaming.js";

export type ChatCompletionCreateParams = OpenAI.ChatCompletionCreateParamsNonStreaming;
export type ChatCompletionCreateParamsStreaming = OpenAI.ChatCompletionCreateParamsStreaming;
export type ChatCompletion = OpenAI.ChatCompletion;

export class ChatCompletions extends BaseResource {
	/** Create a chat completion (non-streaming). */
	async create(params: ChatCompletionCreateParams): Promise<ChatCompletion>;
	/** Create a chat completion (streaming). */
	async create(params: ChatCompletionCreateParamsStreaming): Promise<Stream<ChatCompletionChunk>>;
	/** Create a chat completion. */
	async create(
		params: ChatCompletionCreateParams | ChatCompletionCreateParamsStreaming,
	): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
		if ("stream" in params && params.stream === true) {
			const response = await this.postStream("/chat/completions", params);
			return new Stream(parseSSEStream(response));
		}
		return this.post<ChatCompletion>("/chat/completions", params);
	}
}

/** Namespace object attached to WOPRBot as `bot.chat` */
export class Chat {
	readonly completions: ChatCompletions;

	constructor(opts: ClientOptions) {
		this.completions = new ChatCompletions(opts);
	}
}
