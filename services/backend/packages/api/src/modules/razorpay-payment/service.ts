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
import { RazorpayClient } from "./razorpay-client";

type ProviderOptions = {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
};

/**
 * Razorpay payment provider for prepaid B2C/B2B checkout.
 *
 * The browser completes Razorpay Checkout; this provider verifies the paid order, captures it,
 * and returns provider evidence to Medusa. It never trusts a client-supplied amount or status.
 * Test keys remain marked `test_data` so staging records cannot be mistaken for real money.
 */
class RazorpayPaymentProviderService extends AbstractPaymentProvider {
  static identifier = "razorpay";

  private readonly client: RazorpayClient;
  private readonly webhookSecret: string;

  constructor(container: Record<string, unknown>, config?: ProviderOptions) {
    super(container, config);
    const keyId = config?.keyId ?? process.env.RAZORPAY_KEY_ID ?? "";
    const keySecret = config?.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? "";
    this.webhookSecret =
      config?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
    this.client = new RazorpayClient(keyId, keySecret);
  }

  private providerData(data: Record<string, unknown> | undefined): Record<string, unknown> {
    return {
      ...(data ?? {}),
      payment_mode: "provider",
      provider: "razorpay",
      test_data: this.client.isTestMode,
    };
  }

  private amountMinor(amount: unknown): number {
    return Math.round(Number(amount ?? 0) * 100);
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = this.amountMinor(input.amount);
    if (!Number.isInteger(amount) || amount < 100) {
      throw new Error("Razorpay requires an amount of at least 100 paise.");
    }
    const currency = String(input.currency_code ?? "INR").toUpperCase();
    const context = (input.context ?? {}) as Record<string, unknown>;
    const receipt =
      String(context.idempotency_key ?? context.cart_id ?? context.id ?? `rcpt_${Date.now()}`)
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 40) || `rcpt_${Date.now()}`;
    const order = await this.client.createOrder({
      amount,
      currency,
      receipt,
      notes: {
        cart_id: String(context.cart_id ?? ""),
        source: "bazarbee",
      },
    });
    return {
      id: order.id,
      data: {
        ...this.providerData(input.data as Record<string, unknown> | undefined),
        razorpay_order_id: order.id,
        razorpay_key_id: this.client.publicKeyId,
        razorpay_amount: amount,
        razorpay_currency: currency,
      },
    };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const orderId = String(data.razorpay_order_id ?? "");
    if (!orderId) throw new Error("Razorpay order id is missing from the payment session.");

    const payments = await this.client.listOrderPayments(orderId);
    const payment =
      payments.find((candidate) => candidate.status === "captured") ??
      payments.find((candidate) => candidate.status === "authorized");
    if (!payment) {
      return {
        status: "pending",
        data: this.providerData(data),
      };
    }

    let captured = payment;
    if (payment.status === "authorized") {
      captured = await this.client.capturePayment(
        payment.id,
        payment.amount,
        payment.currency,
      );
    }
    if (captured.status !== "captured") {
      return {
        status: "error",
        data: {
          ...this.providerData(data),
          razorpay_payment_id: captured.id,
          razorpay_status: captured.status,
        },
      };
    }
    return {
      status: "authorized",
      data: {
        ...this.providerData(data),
        razorpay_payment_id: captured.id,
        razorpay_order_id: orderId,
        razorpay_status: captured.status,
        razorpay_method: captured.method ?? null,
        captured_at: new Date().toISOString(),
      },
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const paymentId = String(data.razorpay_payment_id ?? "");
    if (!paymentId) throw new Error("Razorpay payment id is missing.");
    const payment = await this.client.getPayment(paymentId);
    if (payment.status === "captured") {
      return {
        data: {
          ...this.providerData(data),
          razorpay_status: payment.status,
          captured_at: data.captured_at ?? new Date().toISOString(),
        },
      };
    }
    const captured = await this.client.capturePayment(
      paymentId,
      payment.amount,
      payment.currency || "INR",
    );
    return {
      data: {
        ...this.providerData(data),
        razorpay_status: captured.status,
        captured_at: new Date().toISOString(),
      },
    };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const paymentId = String(data.razorpay_payment_id ?? "");
    if (!paymentId) return { status: "pending", data: this.providerData(data) };
    const payment = await this.client.getPayment(paymentId);
    if (payment.status === "captured") {
      return { status: "captured", data: this.providerData(data) };
    }
    if (payment.status === "authorized") {
      return { status: "authorized", data: this.providerData(data) };
    }
    if (payment.status === "failed") {
      return { status: "error", data: this.providerData(data) };
    }
    return { status: "pending", data: this.providerData(data) };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const paymentId = String(data.razorpay_payment_id ?? "");
    if (!paymentId) throw new Error("Razorpay payment id is missing.");
    const refund = await this.client.refundPayment(paymentId, {
      amount: this.amountMinor(input.amount),
      notes: { source: "bazarbee" },
    });
    return {
      data: {
        ...this.providerData(data),
        razorpay_refund_id: refund.id,
        razorpay_refund_status: refund.status,
        refunded_at: new Date().toISOString(),
      },
    };
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
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    // Synchronous verification is authoritative for checkout completion. The signed webhook
    // reconciliation endpoint is added separately once the provider is live in staging.
    void payload;
    void this.webhookSecret;
    return {
      action: "not_supported",
      data: { session_id: "", amount: 0 },
    };
  }
}

export default RazorpayPaymentProviderService;
