import { randomUUID } from "node:crypto";
import { AbstractPaymentProvider } from "@medusajs/framework/utils";
import {
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

/**
 * Simulated payment provider for local staging only.
 *
 * This provider never calls an external gateway and never represents real money. It marks every
 * session/authorization with `test_data: true` and `payment_mode: "simulated"` so downstream
 * records remain clearly non-financial. It exists so the cart-complete flow can produce real
 * Medusa orders during staging without a live payment provider.
 *
 * Production must not register this provider (guarded by the Experience API and deployment config).
 */
class SimulatedPaymentProviderService extends AbstractPaymentProvider {
  static identifier = "simulated";

  constructor(container: Record<string, unknown>, config?: Record<string, unknown>) {
    super(container, config);
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return {
      id: `sim_${randomUUID()}`,
      data: {
        ...(input.data ?? {}),
        test_data: true,
        payment_mode: "simulated",
      },
    };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      status: "authorized",
      data: {
        ...(input.data ?? {}),
        test_data: true,
        payment_mode: "simulated",
        authorized_at: new Date().toISOString(),
      },
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...(input.data ?? {}),
        test_data: true,
        payment_mode: "simulated",
        captured_at: new Date().toISOString(),
      },
    };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { status: "authorized", data: input.data };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return {
      data: {
        ...(input.data ?? {}),
        test_data: true,
        payment_mode: "simulated",
        refunded_at: new Date().toISOString(),
      },
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data };
  }

  async getWebhookActionAndData(
    data: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return {
      action: "not_supported",
      data: { session_id: "", amount: 0 },
    };
  }
}

export default SimulatedPaymentProviderService;
