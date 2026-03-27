/**
 * Stream harness — proves tokens arrive incrementally, not buffered.
 *
 * Sends a streaming request through the gateway and timestamps every SSE token.
 * Shows the delta between first token and last token to prove streaming works.
 *
 * Usage: npx tsx scripts/stream-harness.ts <gateway-url> <service-key>
 * Example: npx tsx scripts/stream-harness.ts http://localhost:3001/v1 sk-test-xxx
 */

const gatewayUrl = process.argv[2] || "https://openrouter.ai/api/v1";
const serviceKey = process.argv[3] || process.env.OPENROUTER_API_KEY || "";

interface TokenEvent {
  index: number;
  token: string;
  timestampMs: number;
  deltaMs: number;
}

async function main() {
  const requestStart = performance.now();

  console.log(`Gateway: ${gatewayUrl}`);
  console.log(`Request sent: ${new Date().toISOString()}`);
  console.log("─".repeat(80));

  const res = await fetch(`${gatewayUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat-v3-0324",
      stream: true,
      messages: [
        { role: "user", content: "Count from 1 to 20, one number per line." },
      ],
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    console.error("No readable stream in response");
    process.exit(1);
  }

  const decoder = new TextDecoder();
  const tokens: TokenEvent[] = [];
  let buffer = "";
  let tokenIndex = 0;
  let firstTokenMs: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          const now = performance.now();
          if (firstTokenMs === null) firstTokenMs = now;

          const event: TokenEvent = {
            index: tokenIndex++,
            token: content,
            timestampMs: now - requestStart,
            deltaMs: tokens.length > 0 ? now - requestStart - tokens[tokens.length - 1].timestampMs : 0,
          };
          tokens.push(event);

          // Print each token with timestamp as it arrives
          const display = content.replace(/\n/g, "\\n");
          console.log(
            `  [${event.timestampMs.toFixed(0).padStart(6)}ms] +${event.deltaMs.toFixed(0).padStart(4)}ms  token[${String(event.index).padStart(3)}]: "${display}"`
          );
        }
      } catch {
        // Skip non-JSON SSE events
      }
    }
  }

  const totalMs = performance.now() - requestStart;
  const firstMs = firstTokenMs ? firstTokenMs - requestStart : 0;
  const lastMs = tokens.length > 0 ? tokens[tokens.length - 1].timestampMs : 0;

  console.log("─".repeat(80));
  console.log(`\nTotal tokens: ${tokens.length}`);
  console.log(`Time to first token: ${firstMs.toFixed(0)}ms`);
  console.log(`Time to last token:  ${lastMs.toFixed(0)}ms`);
  console.log(`Total request time:  ${totalMs.toFixed(0)}ms`);
  console.log(`Stream duration:     ${(lastMs - firstMs).toFixed(0)}ms (first → last)`);
  console.log(`\nIf first token << last token, streaming is PROVEN.`);
  console.log(`Ratio: first token arrived at ${((firstMs / totalMs) * 100).toFixed(1)}% of total request time`);
}

main().catch(console.error);
