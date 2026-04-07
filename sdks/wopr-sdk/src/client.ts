import { Audio } from "./audio/index.js";
import type { ClientOptions } from "./base.js";
import { Chat } from "./chat/completions.js";
import { Completions } from "./completions/index.js";
import { Embeddings } from "./embeddings/index.js";
import { Images } from "./images/index.js";
import { Models } from "./models/index.js";
import { Phone } from "./phone/index.js";
import { Sms } from "./sms/index.js";
import { Video } from "./video/index.js";

export interface WOPRBotOptions {
	/** WOPR service key (e.g., "wopr_sk_...") */
	apiKey: string;
	/** Gateway base URL (default: "https://api.wopr.bot/v1") */
	baseURL?: string;
	/** Custom fetch implementation (for testing or edge runtimes) */
	fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = "https://api.wopr.bot/v1";

export class WOPRBot {
	readonly chat: Chat;
	readonly completions: Completions;
	readonly embeddings: Embeddings;
	readonly audio: Audio;
	readonly images: Images;
	readonly video: Video;
	readonly phone: Phone;
	readonly sms: Sms;
	readonly models: Models;

	constructor(options: WOPRBotOptions) {
		if (!options.apiKey) {
			throw new Error("apiKey is required. Get one at https://api.wopr.bot/settings");
		}

		const opts: ClientOptions = {
			apiKey: options.apiKey,
			baseURL: options.baseURL ?? DEFAULT_BASE_URL,
			fetch: options.fetch,
		};

		this.chat = new Chat(opts);
		this.completions = new Completions(opts);
		this.embeddings = new Embeddings(opts);
		this.audio = new Audio(opts);
		this.images = new Images(opts);
		this.video = new Video(opts);
		this.phone = new Phone(opts);
		this.sms = new Sms(opts);
		this.models = new Models(opts);
	}
}
