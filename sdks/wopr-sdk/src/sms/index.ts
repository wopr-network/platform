import { z } from "zod";
import { BaseResource } from "../base.js";

export const SmsSendParamsSchema = z.object({
	to: z.string().min(1, "Phone number 'to' is required"),
	body: z.string().min(1, "Message body is required"),
	from: z.string().min(1, "Phone number 'from' is required"),
	media_url: z.array(z.string().url()).optional(),
});

export type SmsSendParams = z.input<typeof SmsSendParamsSchema>;

export interface SmsSendResponse {
	sid: string;
	status: string;
	capability: string;
}

export class Sms extends BaseResource {
	/** Send an SMS or MMS message. */
	async send(params: SmsSendParams): Promise<SmsSendResponse> {
		const validated = SmsSendParamsSchema.parse(params);
		return this.post<SmsSendResponse>("/messages/sms", validated);
	}
}
