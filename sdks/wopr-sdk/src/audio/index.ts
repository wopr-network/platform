import type OpenAI from "openai";
import { BaseResource, type ClientOptions } from "../base.js";

export type TranscriptionCreateParams = OpenAI.Audio.TranscriptionCreateParams;
export type Transcription = OpenAI.Audio.Transcription;
export type SpeechCreateParams = OpenAI.Audio.SpeechCreateParams;

export class AudioTranscriptions extends BaseResource {
	/**
	 * Transcribe audio to text.
	 * Sends raw binary audio with Content-Type header as expected by the gateway.
	 */
	async create(params: TranscriptionCreateParams): Promise<Transcription> {
		const formData = new FormData();
		formData.append("file", params.file as unknown as Blob);
		formData.append("model", params.model);
		if (params.language) formData.append("language", params.language);
		if (params.response_format) formData.append("response_format", params.response_format);
		return this.postFormData<Transcription>("/audio/transcriptions", formData);
	}
}

export class AudioSpeech extends BaseResource {
	/**
	 * Generate speech from text.
	 * Returns a Response with binary audio body (audio/mpeg by default).
	 */
	async create(params: SpeechCreateParams): Promise<Response> {
		return this.postBinary("/audio/speech", params);
	}
}

/** Namespace object attached to WOPRBot as `bot.audio` */
export class Audio {
	readonly transcriptions: AudioTranscriptions;
	readonly speech: AudioSpeech;

	constructor(opts: ClientOptions) {
		this.transcriptions = new AudioTranscriptions(opts);
		this.speech = new AudioSpeech(opts);
	}
}
