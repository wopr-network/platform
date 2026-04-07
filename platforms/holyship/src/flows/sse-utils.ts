/**
 * SSE (Server-Sent Events) parsing utilities for streaming gateway responses.
 *
 * The gateway's streaming response uses OpenAI SSE format:
 *   data: {"choices":[{"delta":{"content":"chunk"}}]}
 *   ...
 *   data: [DONE]
 */

/**
 * Read an SSE stream from the gateway, accumulate all content, and call
 * onChunk for each text fragment as it arrives.
 *
 * @returns The full accumulated content string.
 */
export async function accumulateSSEContent(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let accumulated = "";
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from buffer
    const lines = buffer.split("\n");
    // Keep the last partial line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      if (!trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice("data: ".length);
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          accumulated += content;
          onChunk(content);
        }
      } catch {
        // Malformed JSON chunk — skip
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ") && trimmed.slice("data: ".length) !== "[DONE]") {
      try {
        const parsed = JSON.parse(trimmed.slice("data: ".length)) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          accumulated += content;
          onChunk(content);
        }
      } catch {
        // Malformed final chunk — skip
      }
    }
  }

  return accumulated;
}
