import type {
  CreditPriceMap,
  ITenantCustomerRepository,
  IWebhookSeenRepository,
} from "@wopr-network/platform-core/billing";
import { PaymentMethodOwnershipError } from "@wopr-network/platform-core/billing";
import type { ILedger, JournalEntry } from "@wopr-network/platform-core/credits";
import { Credit } from "@wopr-network/platform-core/credits";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAutoTopupEventLogRepository } from "../credits/auto-topup-event-log-repository.js";
import { StripePaymentProcessor } from "./stripe-payment-processor.js";

function makeTenantRow(
  overrides: Partial<{
    tenant: string;
    processor_customer_id: string;
  }> = {},
) {
  return {
    tenant: overrides.tenant ?? "tenant-1",
    processor_customer_id: overrides.processor_customer_id ?? "cus_123",
    processor: "stripe",
    tier: "free",
    billing_hold: 0,
    inference_mode: "byok",
    created_at: 0,
    updated_at: 0,
  };
}

function createMocks() {
  const stripe = {
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    setupIntents: { create: vi.fn() },
    customers: {
      listPaymentMethods: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
    },
    paymentMethods: {
      retrieve: vi.fn(),
      detach: vi.fn(),
    },
    paymentIntents: { create: vi.fn() },
    invoices: { list: vi.fn() },
  } as unknown as Stripe;

  const tenantRepo: ITenantCustomerRepository = {
    getByTenant: vi.fn(),
    getByProcessorCustomerId: vi.fn(),
    upsert: vi.fn(),
    setTier: vi.fn(),
    setBillingHold: vi.fn(),
    hasBillingHold: vi.fn(),
    getInferenceMode: vi.fn(),
    setInferenceMode: vi.fn(),
    list: vi.fn(),
    buildCustomerIdMap: vi.fn(),
    listMetered: vi.fn(),
  };

  const creditLedger: ILedger = {
    post: vi.fn(),
    credit: vi.fn(),
    debit: vi.fn(),
    balance: vi.fn(),
    hasReferenceId: vi.fn(),
    history: vi.fn(),
    tenantsWithBalance: vi.fn(),
    memberUsage: vi.fn(),
    expiredCredits: vi.fn(),
    lifetimeSpend: vi.fn(),
    lifetimeSpendBatch: vi.fn().mockResolvedValue(new Map()),
    trialBalance: vi.fn(),
    accountBalance: vi.fn(),
    seedSystemAccounts: vi.fn(),
    existsByReferenceIdLike: vi.fn(),
    sumPurchasesForPeriod: vi.fn(),
    getActiveTenantIdsInWindow: vi.fn(),
    debitCapped: vi.fn(),
  };

  const replayGuard: IWebhookSeenRepository = {
    isDuplicate: vi.fn(),
    markSeen: vi.fn(),
    purgeExpired: vi.fn(),
  };

  const autoTopupEventLog: IAutoTopupEventLogRepository = {
    writeEvent: vi.fn(),
  };

  return { stripe, tenantRepo, creditLedger, replayGuard, autoTopupEventLog };
}

describe("StripePaymentProcessor", () => {
  let mocks: ReturnType<typeof createMocks>;
  let processor: StripePaymentProcessor;

  beforeEach(() => {
    mocks = createMocks();
    processor = new StripePaymentProcessor({
      stripe: mocks.stripe,
      tenantRepo: mocks.tenantRepo,
      webhookSecret: "whsec_test",
      creditLedger: mocks.creditLedger,
      replayGuard: mocks.replayGuard,
      autoTopupEventLog: mocks.autoTopupEventLog,
    });
  });

  it("has name 'stripe'", () => {
    expect(processor.name).toBe("stripe");
  });

  it("supportsPortal returns true", () => {
    expect(processor.supportsPortal()).toBe(true);
  });

  // --- listPaymentMethods ---

  describe("listPaymentMethods", () => {
    it("returns empty array when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      const result = await processor.listPaymentMethods("tenant-1");
      expect(result).toEqual([]);
    });

    it("returns formatted payment methods with card label and reads actual Stripe default", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.listPaymentMethods).mockResolvedValue({
        data: [
          { id: "pm_1", card: { brand: "visa", last4: "4242" } },
          { id: "pm_2", card: { brand: "mastercard", last4: "5555" } },
        ],
      } as unknown as Stripe.Response<Stripe.ApiList<Stripe.PaymentMethod>>);
      vi.mocked(mocks.stripe.customers.retrieve).mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: "pm_1" },
      } as unknown as Stripe.Response<Stripe.Customer>);

      const result = await processor.listPaymentMethods("tenant-1");
      expect(result).toEqual([
        { id: "pm_1", label: "Visa ending 4242", isDefault: true },
        { id: "pm_2", label: "Mastercard ending 5555", isDefault: false },
      ]);
    });

    it("uses generic label for non-card payment methods", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.listPaymentMethods).mockResolvedValue({
        data: [{ id: "pm_bank", card: undefined }],
      } as unknown as Stripe.Response<Stripe.ApiList<Stripe.PaymentMethod>>);
      vi.mocked(mocks.stripe.customers.retrieve).mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: "pm_bank" },
      } as unknown as Stripe.Response<Stripe.Customer>);

      const result = await processor.listPaymentMethods("tenant-1");
      expect(result).toEqual([{ id: "pm_bank", label: "Payment method pm_bank", isDefault: true }]);
    });
  });

  // --- detachPaymentMethod ---

  describe("detachPaymentMethod", () => {
    it("throws when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      await expect(processor.detachPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(
        "No Stripe customer found for tenant: tenant-1",
      );
    });

    it("throws PaymentMethodOwnershipError when PM belongs to different customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: "cus_OTHER",
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);

      await expect(processor.detachPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(PaymentMethodOwnershipError);
    });

    it("throws PaymentMethodOwnershipError when PM has no customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: null,
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);

      await expect(processor.detachPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(PaymentMethodOwnershipError);
    });

    it("detaches payment method when ownership matches", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: "cus_123",
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);
      vi.mocked(mocks.stripe.paymentMethods.detach).mockResolvedValue(
        {} as unknown as Stripe.Response<Stripe.PaymentMethod>,
      );

      await processor.detachPaymentMethod("tenant-1", "pm_1");
      expect(mocks.stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_1");
    });
  });

  // --- setDefaultPaymentMethod ---

  describe("setDefaultPaymentMethod", () => {
    it("throws when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      await expect(processor.setDefaultPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(
        "No Stripe customer found for tenant: tenant-1",
      );
    });

    it("throws PaymentMethodOwnershipError when PM has no customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: null,
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);

      await expect(processor.setDefaultPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(PaymentMethodOwnershipError);
    });

    it("throws PaymentMethodOwnershipError when PM belongs to different customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: "cus_OTHER",
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);

      await expect(processor.setDefaultPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(PaymentMethodOwnershipError);
    });

    it("throws PaymentMethodOwnershipError when PM customer is an expanded object with different id", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: { id: "cus_OTHER", object: "customer" },
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);

      await expect(processor.setDefaultPaymentMethod("tenant-1", "pm_1")).rejects.toThrow(PaymentMethodOwnershipError);
    });

    it("sets default when ownership matches (string customer)", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: "cus_123",
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);
      vi.mocked(mocks.stripe.customers.update).mockResolvedValue({} as unknown as Stripe.Response<Stripe.Customer>);

      await processor.setDefaultPaymentMethod("tenant-1", "pm_1");
      expect(mocks.stripe.customers.update).toHaveBeenCalledWith("cus_123", {
        invoice_settings: { default_payment_method: "pm_1" },
      });
    });

    it("sets default when ownership matches (expanded Customer object)", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: { id: "cus_123", object: "customer" },
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);
      vi.mocked(mocks.stripe.customers.update).mockResolvedValue({} as unknown as Stripe.Response<Stripe.Customer>);

      await processor.setDefaultPaymentMethod("tenant-1", "pm_1");
      expect(mocks.stripe.customers.update).toHaveBeenCalledWith("cus_123", {
        invoice_settings: { default_payment_method: "pm_1" },
      });
    });

    it("propagates Stripe errors", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.paymentMethods.retrieve).mockResolvedValue({
        id: "pm_1",
        customer: "cus_123",
      } as unknown as Stripe.Response<Stripe.PaymentMethod>);
      vi.mocked(mocks.stripe.customers.update).mockRejectedValue(new Error("Stripe network error"));

      await expect(processor.setDefaultPaymentMethod("tenant-1", "pm_1")).rejects.toThrow("Stripe network error");
    });
  });

  // --- getCustomerEmail ---

  describe("getCustomerEmail", () => {
    it("returns empty string when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      expect(await processor.getCustomerEmail("tenant-1")).toBe("");
    });

    it("returns empty string when customer is deleted", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.retrieve).mockResolvedValue({
        deleted: true,
      } as unknown as Stripe.Response<Stripe.DeletedCustomer>);
      expect(await processor.getCustomerEmail("tenant-1")).toBe("");
    });

    it("returns customer email", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.retrieve).mockResolvedValue({
        deleted: false,
        email: "user@example.com",
      } as unknown as Stripe.Response<Stripe.Customer>);
      expect(await processor.getCustomerEmail("tenant-1")).toBe("user@example.com");
    });

    it("returns empty string when email is null", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.retrieve).mockResolvedValue({
        deleted: false,
        email: null,
      } as unknown as Stripe.Response<Stripe.Customer>);
      expect(await processor.getCustomerEmail("tenant-1")).toBe("");
    });
  });

  // --- updateCustomerEmail ---

  describe("updateCustomerEmail", () => {
    it("throws when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      await expect(processor.updateCustomerEmail("tenant-1", "a@b.com")).rejects.toThrow(
        "No Stripe customer found for tenant: tenant-1",
      );
    });

    it("calls stripe.customers.update with email", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.update).mockResolvedValue({} as unknown as Stripe.Response<Stripe.Customer>);

      await processor.updateCustomerEmail("tenant-1", "new@example.com");
      expect(mocks.stripe.customers.update).toHaveBeenCalledWith("cus_123", { email: "new@example.com" });
    });
  });

  // --- listInvoices ---

  describe("listInvoices", () => {
    it("returns empty array when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      expect(await processor.listInvoices("tenant-1")).toEqual([]);
    });

    it("maps Stripe invoices to Invoice shape", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.invoices.list).mockResolvedValue({
        data: [
          {
            id: "in_1",
            created: 1700000000,
            amount_due: 500,
            status: "paid",
            invoice_pdf: "https://stripe.com/invoice.pdf",
            hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
          },
          {
            id: "in_2",
            created: 1700086400,
            amount_due: 1000,
            status: "open",
            invoice_pdf: null,
            hosted_invoice_url: "https://invoice.stripe.com/i/in_2",
          },
        ],
      } as unknown as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>);

      const result = await processor.listInvoices("tenant-1");
      expect(result).toEqual([
        {
          id: "in_1",
          date: new Date(1700000000 * 1000).toISOString(),
          amountCents: 500,
          status: "paid",
          downloadUrl: "https://stripe.com/invoice.pdf",
          hostedUrl: "https://invoice.stripe.com/i/in_1",
        },
        {
          id: "in_2",
          date: new Date(1700086400 * 1000).toISOString(),
          amountCents: 1000,
          status: "open",
          downloadUrl: "",
          hostedUrl: "https://invoice.stripe.com/i/in_2",
        },
      ]);
      expect(mocks.stripe.invoices.list).toHaveBeenCalledWith({
        customer: "cus_123",
        limit: 24,
      });
    });

    it("uses 'unknown' when invoice status is null", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.invoices.list).mockResolvedValue({
        data: [
          {
            id: "in_3",
            created: 1700000000,
            amount_due: 100,
            status: null,
            invoice_pdf: null,
            hosted_invoice_url: null,
          },
        ],
      } as unknown as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>);

      const result = await processor.listInvoices("tenant-1");
      expect(result[0].status).toBe("unknown");
      expect(result[0].hostedUrl).toBe("");
    });
  });

  // --- charge ---

  describe("charge", () => {
    it("throws when autoTopupEventLog is not provided", async () => {
      const processorNoLog = new StripePaymentProcessor({
        stripe: mocks.stripe,
        tenantRepo: mocks.tenantRepo,
        webhookSecret: "whsec_test",
        creditLedger: mocks.creditLedger,
        replayGuard: mocks.replayGuard,
      });

      await expect(
        processorNoLog.charge({
          tenant: "tenant-1",
          amount: Credit.fromCents(500),
          source: "auto_topup_usage",
        }),
      ).rejects.toThrow("autoTopupEventLog is required for charge()");
    });

    it("delegates to chargeAutoTopup and returns success result", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.customers.listPaymentMethods).mockResolvedValue({
        data: [{ id: "pm_1" }],
      } as unknown as Stripe.Response<Stripe.ApiList<Stripe.PaymentMethod>>);
      vi.mocked(mocks.stripe.paymentIntents.create).mockResolvedValue({
        id: "pi_123",
        status: "succeeded",
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);
      vi.mocked(mocks.creditLedger.hasReferenceId).mockResolvedValue(false);
      vi.mocked(mocks.creditLedger.credit).mockResolvedValue({} as unknown as JournalEntry);
      vi.mocked(mocks.autoTopupEventLog.writeEvent).mockResolvedValue(undefined);

      const result = await processor.charge({
        tenant: "tenant-1",
        amount: Credit.fromCents(500),
        source: "auto_topup_usage",
      });

      expect(result.success).toBe(true);
      expect(result.paymentReference).toBe("pi_123");
    });

    it("returns failure when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      vi.mocked(mocks.autoTopupEventLog.writeEvent).mockResolvedValue(undefined);

      const result = await processor.charge({
        tenant: "tenant-1",
        amount: Credit.fromCents(500),
        source: "auto_topup_usage",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No Stripe customer");
    });
  });

  // --- setupPaymentMethod ---

  describe("setupPaymentMethod", () => {
    it("returns client secret from SetupIntent", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.setupIntents.create).mockResolvedValue({
        client_secret: "seti_secret_123",
      } as unknown as Stripe.Response<Stripe.SetupIntent>);

      const result = await processor.setupPaymentMethod("tenant-1");
      expect(result.clientSecret).toBe("seti_secret_123");
    });

    it("returns empty string when client_secret is null", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.setupIntents.create).mockResolvedValue({
        client_secret: null,
      } as unknown as Stripe.Response<Stripe.SetupIntent>);

      const result = await processor.setupPaymentMethod("tenant-1");
      expect(result.clientSecret).toBe("");
    });

    it("throws when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      await expect(processor.setupPaymentMethod("tenant-1")).rejects.toThrow(
        "No Stripe customer found for tenant: tenant-1",
      );
    });
  });

  // --- createPortalSession ---

  describe("createPortalSession", () => {
    it("returns portal URL", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.billingPortal.sessions.create).mockResolvedValue({
        url: "https://billing.stripe.com/session/abc",
      } as unknown as Stripe.Response<Stripe.BillingPortal.Session>);

      const result = await processor.createPortalSession({
        tenant: "tenant-1",
        returnUrl: "https://wopr.network/billing",
      });
      expect(result.url).toBe("https://billing.stripe.com/session/abc");
    });

    it("throws when tenant has no Stripe customer", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      await expect(
        processor.createPortalSession({
          tenant: "tenant-1",
          returnUrl: "https://wopr.network/billing",
        }),
      ).rejects.toThrow("No Stripe customer found for tenant: tenant-1");
    });
  });

  // --- createCheckoutSession ---

  describe("createCheckoutSession", () => {
    it("uses explicit priceId when provided", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(makeTenantRow());
      vi.mocked(mocks.stripe.checkout.sessions.create).mockResolvedValue({
        id: "cs_1",
        url: "https://checkout.stripe.com/cs_1",
      } as unknown as Stripe.Response<Stripe.Checkout.Session>);

      const result = await processor.createCheckoutSession({
        tenant: "tenant-1",
        priceId: "price_explicit",
        successUrl: "https://wopr.network/success",
        cancelUrl: "https://wopr.network/cancel",
      });

      expect(result).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });
    });

    it("looks up priceId from priceMap when not provided", async () => {
      const priceMap: CreditPriceMap = new Map([
        ["price_500", { creditCents: 500, amountCents: 500, label: "$5", bonusPercent: 0 }],
      ]);

      const processorWithPrices = new StripePaymentProcessor({
        stripe: mocks.stripe,
        tenantRepo: mocks.tenantRepo,
        webhookSecret: "whsec_test",
        creditLedger: mocks.creditLedger,
        replayGuard: mocks.replayGuard,
        priceMap,
      });

      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      vi.mocked(mocks.stripe.checkout.sessions.create).mockResolvedValue({
        id: "cs_2",
        url: "https://checkout.stripe.com/cs_2",
      } as unknown as Stripe.Response<Stripe.Checkout.Session>);

      const result = await processorWithPrices.createCheckoutSession({
        tenant: "tenant-1",
        amount: Credit.fromCents(500),
        successUrl: "https://wopr.network/success",
        cancelUrl: "https://wopr.network/cancel",
      });

      expect(result.id).toBe("cs_2");
      expect(mocks.stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([expect.objectContaining({ price: "price_500" })]),
        }),
      );
    });

    it("throws when no priceId and no matching price in map", async () => {
      await expect(
        processor.createCheckoutSession({
          tenant: "tenant-1",
          amount: Credit.fromCents(9999),
          successUrl: "https://wopr.network/success",
          cancelUrl: "https://wopr.network/cancel",
        }),
      ).rejects.toThrow(/No Stripe price tier matches amount/);
    });

    it("returns empty url when Stripe session url is null", async () => {
      vi.mocked(mocks.tenantRepo.getByTenant).mockResolvedValue(null);
      vi.mocked(mocks.stripe.checkout.sessions.create).mockResolvedValue({
        id: "cs_3",
        url: null,
      } as unknown as Stripe.Response<Stripe.Checkout.Session>);

      const result = await processor.createCheckoutSession({
        tenant: "tenant-1",
        priceId: "price_1",
        successUrl: "s",
        cancelUrl: "c",
      });

      expect(result.url).toBe("");
    });
  });

  // --- handleWebhook ---

  describe("handleWebhook", () => {
    it("throws when constructEvent fails with invalid signature", async () => {
      vi.mocked(mocks.stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      await expect(processor.handleWebhook(Buffer.from("body"), "bad_sig")).rejects.toThrow("Invalid signature");

      expect(mocks.stripe.webhooks.constructEvent).toHaveBeenCalledWith(Buffer.from("body"), "bad_sig", "whsec_test");
    });
  });
});
