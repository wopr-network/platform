import { z } from "zod";
import { BaseResource, type ClientOptions } from "../base.js";

// --- Outbound Call ---
export const PhoneCallParamsSchema = z.object({
	to: z.string().min(1, "Phone number 'to' is required"),
	from: z.string().min(1, "Phone number 'from' is required"),
	webhook_url: z.string().url().optional(),
});

export type PhoneCallParams = z.input<typeof PhoneCallParamsSchema>;

export interface PhoneCallResponse {
	status: string;
	message: string;
}

// --- Phone Number Provisioning ---
export const PhoneNumberProvisionParamsSchema = z.object({
	area_code: z.string().optional(),
	country: z.string().optional().default("US"),
	capabilities: z
		.object({
			sms: z.boolean().optional(),
			voice: z.boolean().optional(),
			mms: z.boolean().optional(),
		})
		.optional(),
});

export type PhoneNumberProvisionParams = z.input<typeof PhoneNumberProvisionParamsSchema>;

export interface PhoneNumber {
	id: string;
	phone_number: string;
	friendly_name: string;
	capabilities: { sms: boolean; voice: boolean; mms: boolean };
}

export interface PhoneNumberListResponse {
	data: PhoneNumber[];
}

export interface PhoneNumberReleaseResponse {
	status: string;
	id: string;
}

export class PhoneNumbers extends BaseResource {
	/** Provision a new phone number. */
	async provision(params?: PhoneNumberProvisionParams): Promise<PhoneNumber> {
		const validated = PhoneNumberProvisionParamsSchema.parse(params ?? {});
		return this.post<PhoneNumber>("/phone/numbers", validated);
	}

	/** List all phone numbers owned by this tenant. */
	async list(): Promise<PhoneNumberListResponse> {
		return this.get<PhoneNumberListResponse>("/phone/numbers");
	}

	/** Release (delete) a phone number. */
	async release(numberId: string): Promise<PhoneNumberReleaseResponse> {
		return this.delete<PhoneNumberReleaseResponse>(`/phone/numbers/${numberId}`);
	}
}

export class Phone extends BaseResource {
	readonly numbers: PhoneNumbers;

	constructor(opts: ClientOptions) {
		super(opts);
		this.numbers = new PhoneNumbers(opts);
	}

	/** Initiate an outbound phone call. */
	async call(params: PhoneCallParams): Promise<PhoneCallResponse> {
		const validated = PhoneCallParamsSchema.parse(params);
		return this.post<PhoneCallResponse>("/phone/outbound", validated);
	}
}
