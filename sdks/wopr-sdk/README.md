# @wopr-network/sdk

Typed TypeScript client for [WOPR](https://wopr.bot) — the programmable bot platform. Provides OpenAI-compatible APIs for chat, audio, images, video, phone, SMS, and embeddings, all routed through the WOPR gateway with credit-based billing.

## Install

```bash
npm install @wopr-network/sdk
```

Requires Node.js 18+ and `openai` as a peer dependency:

```bash
npm install @wopr-network/sdk openai
```

## Get an API Key

1. Sign up at [wopr.bot](https://wopr.bot)
2. Go to **Settings → API Keys**
3. Create a key — it starts with `wopr_sk_`

Your API key authenticates every request. Keep it secret; never commit it to source control.

## Quickstart

```typescript
import { WOPRBot } from "@wopr-network/sdk";

const bot = new WOPRBot({
  apiKey: process.env.WOPR_API_KEY!,
});

// Send a message and get a response
const response = await bot.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What is WOPR?" }],
});

console.log(response.choices[0].message.content);
```

## Core Concepts

**WOPRBot** — The main client. Instantiate it once with your API key. Each property on the client corresponds to a capability area (chat, audio, images, etc.).

**Gateway** — All requests go through `https://api.wopr.bot/v1`, which routes to the appropriate upstream provider (OpenAI, ElevenLabs, Twilio, etc.). You interact with one consistent API regardless of the underlying provider.

**Credits** — Hosted capabilities (voice, image generation, video, phone, SMS) are billed per use via credits. If your balance is insufficient, requests throw `InsufficientCreditsError` with a `topUpUrl` to add credits.

**OpenAI Compatibility** — Chat completions, text completions, embeddings, audio transcription/speech, and image generation all accept the same parameters as the OpenAI SDK. Existing OpenAI code can switch to WOPR by swapping the client.

## API Reference

### `new WOPRBot(options)`

```typescript
interface WOPRBotOptions {
  /** Your WOPR service key (wopr_sk_...) */
  apiKey: string;
  /** Override the gateway base URL (default: "https://api.wopr.bot/v1") */
  baseURL?: string;
  /** Custom fetch implementation for testing or edge runtimes */
  fetch?: typeof globalThis.fetch;
}
```

---

### `bot.chat.completions.create(params)`

OpenAI-compatible chat completions. Supports streaming.

```typescript
// Non-streaming
const completion = await bot.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
});
// completion.choices[0].message.content

// Streaming
const stream = await bot.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me a story." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

Types re-exported from `openai`: `ChatCompletionCreateParams`, `ChatCompletionCreateParamsStreaming`, `ChatCompletion`, `ChatCompletionChunk`.

---

### `bot.completions.create(params)`

Legacy text completions (OpenAI-compatible).

```typescript
const result = await bot.completions.create({
  model: "gpt-3.5-turbo-instruct",
  prompt: "The capital of France is",
  max_tokens: 10,
});
```

---

### `bot.embeddings.create(params)`

Generate vector embeddings (OpenAI-compatible).

```typescript
const result = await bot.embeddings.create({
  model: "text-embedding-3-small",
  input: "The quick brown fox",
});
// result.data[0].embedding — number[]
```

---

### `bot.audio.transcriptions.create(params)`

Transcribe audio to text (OpenAI Whisper-compatible).

```typescript
const audio = fs.createReadStream("recording.mp3");

const transcription = await bot.audio.transcriptions.create({
  model: "whisper-1",
  file: audio,
  language: "en", // optional
});
// transcription.text
```

---

### `bot.audio.speech.create(params)`

Generate speech from text (text-to-speech). Returns a `Response` with binary audio.

```typescript
const response = await bot.audio.speech.create({
  model: "tts-1",
  input: "Hello, welcome to WOPR.",
  voice: "alloy",
});

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync("speech.mp3", buffer);
```

---

### `bot.images.generate(params)`

Generate images from a text prompt (OpenAI DALL-E-compatible).

```typescript
const result = await bot.images.generate({
  model: "dall-e-3",
  prompt: "A futuristic cityscape at sunset",
  n: 1,
  size: "1024x1024",
});
// result.data[0].url — image URL
```

---

### `bot.video.generate(params)`

Generate short videos from a text prompt.

```typescript
const result = await bot.video.generate({
  prompt: "A cat walking through a garden",
  duration: 4, // seconds, 1–60, default 4
});
// result.data[0].url — video URL
```

---

### `bot.phone.call(params)`

Initiate an outbound phone call.

```typescript
const call = await bot.phone.call({
  to: "+15551234567",
  from: "+15559876543",      // your provisioned number
  webhook_url: "https://your-app.com/webhooks/call", // optional
});
// call.status, call.message
```

---

### `bot.phone.numbers.provision(params?)`

Provision a new phone number.

```typescript
const number = await bot.phone.numbers.provision({
  area_code: "415",
  country: "US",             // default
  capabilities: { sms: true, voice: true },
});
// number.phone_number, number.id
```

### `bot.phone.numbers.list()`

List all provisioned phone numbers.

```typescript
const { data } = await bot.phone.numbers.list();
for (const num of data) {
  console.log(num.phone_number, num.capabilities);
}
```

### `bot.phone.numbers.release(numberId)`

Release a provisioned phone number.

```typescript
await bot.phone.numbers.release(number.id);
```

---

### `bot.sms.send(params)`

Send an SMS or MMS message.

```typescript
const result = await bot.sms.send({
  to: "+15551234567",
  from: "+15559876543",      // your provisioned number
  body: "Hello from WOPR!",
  media_url: ["https://example.com/image.png"], // optional for MMS
});
// result.sid, result.status
```

---

### `bot.models.list()`

List all available models with capability and tier info.

```typescript
const { data } = await bot.models.list();
for (const model of data) {
  console.log(model.id, model.capability, model.tier);
}
```

```typescript
interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  capability: string;
  tier: "standard" | "premium" | "byok";
}
```

---

## Error Handling

All API errors extend `WOPRError`. Import the specific classes to handle them by type:

```typescript
import {
  WOPRError,
  AuthenticationError,
  InsufficientCreditsError,
  RateLimitError,
  ProviderError,
  ServerError,
} from "@wopr-network/sdk";

try {
  const result = await bot.images.generate({ prompt: "...", model: "dall-e-3" });
} catch (err) {
  if (err instanceof InsufficientCreditsError) {
    console.error("Out of credits. Top up at:", err.topUpUrl);
    console.error(`Balance: ${err.currentBalanceCents}¢, needed: ${err.requiredCents}¢`);
  } else if (err instanceof AuthenticationError) {
    console.error("Invalid API key");
  } else if (err instanceof RateLimitError) {
    console.error("Rate limit hit — back off and retry");
  } else if (err instanceof WOPRError) {
    console.error(`API error ${err.status}: ${err.message} (${err.code})`);
  } else {
    throw err;
  }
}
```

| Class | HTTP Status | Cause |
|-------|-------------|-------|
| `AuthenticationError` | 401 | Invalid or missing API key |
| `InsufficientCreditsError` | 402 | Account has insufficient credits |
| `RateLimitError` | 429 | Too many requests |
| `ProviderError` | 4xx | Upstream provider error |
| `ServerError` | 5xx | Gateway or upstream server error |

`InsufficientCreditsError` includes extra fields: `topUpUrl`, `currentBalanceCents`, `requiredCents`.

---

## Examples

### Discord Bot with LLM Responses

```typescript
import { WOPRBot } from "@wopr-network/sdk";
import { Client, Events, GatewayIntentBits } from "discord.js";

const wopr = new WOPRBot({ apiKey: process.env.WOPR_API_KEY! });
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.mentions.has(discord.user!)) return;

  const response = await wopr.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: message.content }],
  });

  await message.reply(response.choices[0].message.content ?? "I have no response.");
});

discord.login(process.env.DISCORD_TOKEN);
```

### Voice Alert via Phone Call

```typescript
import { WOPRBot } from "@wopr-network/sdk";

const bot = new WOPRBot({ apiKey: process.env.WOPR_API_KEY! });

async function alertOnCall(to: string, message: string) {
  // Generate speech audio
  const speech = await bot.audio.speech.create({
    model: "tts-1",
    input: message,
    voice: "nova",
  });

  // Initiate call (webhook handles audio playback)
  await bot.phone.call({
    to,
    from: process.env.WOPR_PHONE_NUMBER!,
    webhook_url: `https://your-app.com/voice?message=${encodeURIComponent(message)}`,
  });
}

await alertOnCall("+15551234567", "Alert: your server is down.");
```

### Image Generation Pipeline

```typescript
import { WOPRBot } from "@wopr-network/sdk";
import fs from "fs";

const bot = new WOPRBot({ apiKey: process.env.WOPR_API_KEY! });

async function generateAndDescribe(userPrompt: string) {
  // Generate image
  const image = await bot.images.generate({
    model: "dall-e-3",
    prompt: userPrompt,
    size: "1024x1024",
  });

  const imageUrl = image.data[0].url!;

  // Describe the result
  const description = await bot.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image in one sentence." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return {
    url: imageUrl,
    description: description.choices[0].message.content,
  };
}
```

---

## Streaming with `Stream<T>`

The `Stream` class wraps an `AsyncIterable<T>` and is returned when `stream: true` is passed to `chat.completions.create`. You can iterate it with `for await...of`:

```typescript
import { WOPRBot, type ChatCompletionChunk } from "@wopr-network/sdk";

const bot = new WOPRBot({ apiKey: process.env.WOPR_API_KEY! });

const stream = await bot.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Count from 1 to 10 slowly." }],
  stream: true,
});

let fullText = "";
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? "";
  fullText += delta;
  process.stdout.write(delta);
}
console.log("\nDone:", fullText);
```

---

## TypeScript

The SDK ships with full TypeScript declarations. All API parameters and responses are typed. OpenAI-compatible endpoints re-export types directly from the `openai` package so they integrate seamlessly with existing OpenAI-typed code.

```typescript
import type {
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionChunk,
  EmbeddingCreateParams,
  CreateEmbeddingResponse,
  TranscriptionCreateParams,
  SpeechCreateParams,
  ImageGenerateParams,
  ImagesResponse,
  VideoGenerateParams,
  VideoGenerateResponse,
  PhoneCallParams,
  PhoneCallResponse,
  SmsSendParams,
  SmsSendResponse,
  ModelInfo,
} from "@wopr-network/sdk";
```

---

## Plugin Development

Plugins extend WOPR bots with new capabilities. They are standalone npm packages that implement the `@wopr-network/plugin-types` interface.

- **Plugin types**: [`@wopr-network/plugin-types`](https://www.npmjs.com/package/@wopr-network/plugin-types)
- **Reference plugin**: [wopr-network/wopr-plugin-discord](https://github.com/wopr-network/wopr-plugin-discord)

Plugins receive a `WOPRPluginContext` at initialization time that includes the bot client, config, and lifecycle hooks. They live in separate repos under `wopr-network/wopr-plugin-<name>` and are installed independently.

---

## Links

- [wopr.bot](https://wopr.bot) — Sign up, manage bots, top up credits
- [Dashboard](https://app.wopr.bot) — API keys, usage, billing
- [GitHub](https://github.com/wopr-network/wopr-sdk) — Source code and issues
- [Plugin types](https://github.com/wopr-network/wopr-plugin-types) — Build your own plugin
- [Discord plugin](https://github.com/wopr-network/wopr-plugin-discord) — Reference plugin implementation

## License

MIT
