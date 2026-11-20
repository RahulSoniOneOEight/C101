import { randomUUID } from "node:crypto";
import { AbstractPaymentProvider } from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";

type ProviderOptions = {
  testData?: boolean;
};

/**
 * Cash-on-delivery provider for B2C and B2B.
 *
 * The seller delivers and collects cash, so Bazarbee never receives the goods money. This provider
 * therefore authorizes at order placement and captures only when the seller records the cash. An
 * authorized COD order is "cash due", not "paid".
 *
 * Refunds are rejected on purpose: a COD refund is the seller's credit note, not a Bazarbee refund.
 */
class CodPaymentProviderService extends AbstractPaymentProvider {
  static identifier = "cod";

  private readonly testData: boolean;

  constructor(container: Record<string, unknown>, config?: ProviderOptions) {
    super(container, config);
    const environment = (
      process.env.BUILDKART_ENVIRONMENT ??
      process.env.NODE_ENV ??
      "development"
    ).trim();
    this.testData = config?.testData ?? environment !== "production";
  }

  private providerData(data: Record<string, unknown> | undefined): Record<string, unknown> {
    return {
      ...(data ?? {}),
      payment_mode: "cod",
      provider: "cod",
      test_data: this.testData,
    };
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amountMinor = Math.round(Number(input.amount ?? 0) * 100);
    if (!Number.isInteger(amountMinor) || amountMinor < 1) {
      throw new Error("COD requires a positive order amount.");
    }
    return {
      id: `cod_${randomUUID()}`,
      data: {
        ...this.providerData(input.data as Record<string, unknown> | undefined),
        cod_amount_minor: amountMinor,
        cod_currency: String(input.currency_code ?? "inr").toUpperCase(),
        cod_status: "pending",
      },
    };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      status: "authorized",
      data: {
        ...this.providerData(input.data as Record<string, unknown> | undefined),
        cod_status: "pending",
        authorized_at: new Date().toISOString(),
      },
    };
  }

  async capturePayment(_input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    throw new Error(
      "COD capture is disabled. The seller records cash in the BazarBee seller portal; " +
        "capturing in Medusa would mark a cash order paid before collection.",
    );
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    if (typeof data.captured_at === "string" && data.captured_at) {
      return { status: "captured", data: this.providerData(data) };
    }
    return { status: "authorized", data: this.providerData(data) };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new Error(
      "COD refunds are recorded as a seller credit note; Bazarbee cannot refund cash it never collected.",
    );
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: this.providerData(input.data as Record<string, unknown> | undefined) };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: this.providerData(input.data as Record<string, unknown> | undefined) };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: this.providerData(input.data as Record<string, unknown> | undefined) };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: this.providerData(input.data as Record<string, unknown> | undefined) };
  }

  async getWebhookActionAndData(
    _data: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    return {
      action: "not_supported",
      data: { session_id: "", amount: 0 },
    };
  }
}

export default CodPaymentProviderService;
