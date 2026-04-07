import type OpenAI from "openai";

/** A single chunk from a streaming chat completion. */
export type ChatCompletionChunk = OpenAI.ChatCompletionChunk;

/**
 * Parse an SSE response body into an async iterable of ChatCompletionChunk objects.
 *
 * Handles the standard SSE format:
 *   data: {"id":"...","choices":[...]}\n\n
 *   data: [DONE]\n\n
 */
export async function* parseSSEStream(response: Response): AsyncIterable<ChatCompletionChunk> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Response body is null");

	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			// Keep incomplete last line in buffer
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6).trim();
					if (data === "[DONE]") return;

					try {
						yield JSON.parse(data) as ChatCompletionChunk;
					} catch {
						// Skip malformed chunks
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/** Wrapper that provides Symbol.asyncIterator for the stream. */
export class Stream<T> implements AsyncIterable<T> {
	private iterator: AsyncIterable<T>;

	constructor(iterator: AsyncIterable<T>) {
		this.iterator = iterator;
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return this.iterator[Symbol.asyncIterator]();
	}
}
