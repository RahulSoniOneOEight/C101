/**
 * Payment domain types for the Experience API.
 *
 * Simulated states are intentionally distinct from provider states. `simulated_accepted`
 * is test evidence and never represents captured money. `captured`/`authorised` are reserved
 * for a future provider adapter and are never produced by the simulator.
 */

export type PaymentStatus =
  | "not_started"
  | "pending"
  | "simulated_accepted"
  | "simulated_refund_pending"
  | "simulated_refunded"
  | "authorised"
  | "captured"
  | "failed"
  | "unknown";

export type PaymentMode = "simulated" | "provider";

export type EvidenceStatus =
  | "simulated_result"
  | "verified_webhook"
  | "verified_query"
  | "conflicting"
  | "pending";

export interface Money {
  amount_minor: number;
  currency_code: string;
}

export interface PaymentSession {
  id: string;
  checkout_id: string;
  status: PaymentStatus;
  amount: Money;
  payment_mode: PaymentMode;
  test_data: boolean;
  provider: string | null;
  expires_at: string;
}

export interface PaymentState {
  id: string;
  checkout_id: string;
  order_id: string | null;
  status: PaymentStatus;
  amount: Money;
  payment_mode: PaymentMode;
  test_data: boolean;
  evidence_status: EvidenceStatus;
  provider_reference: string | null;
  observed_at: string;
}

export type SimulatorOutcome =
  | "success"
  | "failure"
  | "pending"
  | "duplicate"
  | "late"
  | "refund";

export interface PaymentAdapter {
  readonly mode: PaymentMode;
  createSession(checkoutId: string, amount: Money): Promise<PaymentSession>;
  recordOutcome(sessionId: string, outcome: SimulatorOutcome): Promise<PaymentState>;
  getState(paymentId: string): Promise<PaymentState | null>;
}
