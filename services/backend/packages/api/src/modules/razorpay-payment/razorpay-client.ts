/**
 * Minimal Razorpay REST client for the Medusa payment provider.
 *
 * The key secret is supplied by the runtime environment and is never written to logs, source
 * control or the browser. Test keys (`rzp_test_...`) keep every record marked `test_data`.
 */

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  attempts: number;
  notes?: Record<string, string>;
  created_at: number;
}

export interface RazorpayPayment {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  method?: string;
  captured: boolean;
  amount_refunded?: number;
  notes?: Record<string, string>;
  created_at: number;
}

interface RazorpayCollection<T> {
  entity: string;
  count: number;
  items: T[];
}

export class RazorpayClient {
  private readonly auth: string;
  private readonly baseUrl = "https://api.razorpay.com/v1";

  constructor(
    private readonly keyId: string,
    keySecret: string,
  ) {
    if (!keyId || !keySecret) {
      throw new Error("Razorpay key id and secret are required.");
    }
    this.auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  }

  get publicKeyId(): string {
    return this.keyId;
  }

  get isTestMode(): boolean {
    return this.keyId.startsWith("rzp_test");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${this.auth}`,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      // Razorpay errors include a safe description; never include the request headers.
      let detail = `Razorpay request failed (${response.status}).`;
      try {
        const parsed = JSON.parse(text) as {
          error?: { description?: string; code?: string; reason?: string };
        };
        if (parsed.error?.description) detail = parsed.error.description;
      } catch {
        // Keep the generic message.
      }
      throw new Error(detail);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes ?? {},
        payment_capture: 1,
      }),
    });
  }

  async getOrder(orderId: string): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
  }

  async listOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
    const collection = await this.request<RazorpayCollection<RazorpayPayment>>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
    );
    return collection.items ?? [];
  }

  async getPayment(paymentId: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  }

  async capturePayment(
    paymentId: string,
    amount: number,
    currency: string,
  ): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      {
        method: "POST",
        body: JSON.stringify({ amount, currency }),
      },
    );
  }

  async refundPayment(
    paymentId: string,
    input: { amount: number; notes?: Record<string, string> },
  ): Promise<{ id: string; status: string; amount: number; payment_id: string }> {
    return this.request(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        notes: input.notes ?? {},
        speed: "normal",
      }),
    });
  }
}
