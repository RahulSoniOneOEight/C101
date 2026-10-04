import type {
  Money,
  PaymentAdapter,
  PaymentSession,
  PaymentState,
  SimulatorOutcome,
} from "./types.js";

interface Record {
  session: PaymentSession;
  state: PaymentState;
  // Operation keys already applied, to guarantee idempotent transitions.
  appliedOutcomes: Set<SimulatorOutcome>;
}

/**
 * In-memory simulated payment adapter.
 *
 * This adapter proves the checkout/payment orchestration and idempotency behaviour in
 * development/staging only. It never represents captured money; `simulated_accepted` and
 * `simulated_refund_*` are test evidence. Duplicate results are deduplicated by operation
 * key so a repeated webhook/result cannot produce a second effect.
 */
export class SimulatedPaymentAdapter implements PaymentAdapter {
  readonly mode = "simulated" as const;

  private readonly records = new Map<string, Record>();
  private sequence = 0;

  async createSession(checkoutId: string, amount: Money): Promise<PaymentSession> {
    const id = `pay_sim_${++this.sequence}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const session: PaymentSession = {
      id,
      checkout_id: checkoutId,
      status: "pending",
      amount,
      payment_mode: "simulated",
      test_data: true,
      provider: null,
      expires_at: expiresAt.toISOString(),
    };

    const state: PaymentState = {
      id,
      checkout_id: checkoutId,
      order_id: null,
      status: "pending",
      amount,
      payment_mode: "simulated",
      test_data: true,
      evidence_status: "pending",
      provider_reference: null,
      observed_at: now.toISOString(),
    };

    this.records.set(id, {
      session,
      state,
      appliedOutcomes: new Set(),
    });

    return session;
  }

  async recordOutcome(sessionId: string, outcome: SimulatorOutcome): Promise<PaymentState> {
    const record = this.records.get(sessionId);
    if (!record) {
      throw new Error(`Unknown payment session: ${sessionId}`);
    }

    // Duplicate delivery of the same outcome is idempotent: return prior state, no new effect.
    if (record.appliedOutcomes.has(outcome)) {
      return record.state;
    }

    const now = new Date().toISOString();
    switch (outcome) {
      case "success":
        record.session.status = "simulated_accepted";
        record.state.status = "simulated_accepted";
        record.state.evidence_status = "simulated_result";
        break;
      case "failure":
        record.session.status = "failed";
        record.state.status = "failed";
        record.state.evidence_status = "simulated_result";
        break;
      case "pending":
        record.session.status = "pending";
        record.state.status = "pending";
        record.state.evidence_status = "pending";
        break;
      case "duplicate":
        // A repeated success that arrives late: no state change beyond a marker refresh.
        record.state.observed_at = now;
        break;
      case "late":
        // Late acceptance after expiry is routed by the caller into re-reservation or refund
        // recovery. The adapter only records the simulated acceptance.
        record.session.status = "simulated_accepted";
        record.state.status = "simulated_accepted";
        record.state.evidence_status = "simulated_result";
        break;
      case "refund":
        record.session.status = "simulated_refunded";
        record.state.status = "simulated_refunded";
        record.state.evidence_status = "simulated_result";
        break;
    }

    record.state.observed_at = now;
    record.appliedOutcomes.add(outcome);
    return record.state;
  }

  async getState(paymentId: string): Promise<PaymentState | null> {
    const record = this.records.get(paymentId);
    return record ? record.state : null;
  }
}
