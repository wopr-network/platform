// Main client
export { WOPRBot, type WOPRBotOptions } from "./client.js";

// Error classes
export {
	WOPRError,
	AuthenticationError,
	InsufficientCreditsError,
	RateLimitError,
	ProviderError,
	ServerError,
	type WOPRErrorBody,
} from "./errors.js";

// Streaming
export { Stream, type ChatCompletionChunk } from "./streaming.js";

// OpenAI-compatible types (re-exports from openai package)
export type {
	ChatCompletionCreateParams,
	ChatCompletionCreateParamsStreaming,
	ChatCompletion,
} from "./chat/completions.js";
export type { CompletionCreateParams, Completion } from "./completions/index.js";
export type { EmbeddingCreateParams, CreateEmbeddingResponse } from "./embeddings/index.js";
export type { TranscriptionCreateParams, Transcription, SpeechCreateParams } from "./audio/index.js";
export type { ImageGenerateParams, ImagesResponse } from "./images/index.js";

// WOPR-specific types
export type { VideoGenerateParams, VideoGenerateResponse } from "./video/index.js";
export { VideoGenerateParamsSchema } from "./video/index.js";
export type {
	PhoneCallParams,
	PhoneCallResponse,
	PhoneNumber,
	PhoneNumberProvisionParams,
} from "./phone/index.js";
export { PhoneCallParamsSchema, PhoneNumberProvisionParamsSchema } from "./phone/index.js";
export type { SmsSendParams, SmsSendResponse } from "./sms/index.js";
export { SmsSendParamsSchema } from "./sms/index.js";
export type { ModelInfo, ModelsListResponse } from "./models/index.js";
