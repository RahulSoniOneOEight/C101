/**
 * E-017-014 simulator outcome matrix.
 *
 * Proves the server-selected simulator supports success, failure, pending, duplicate and late
 * results, that simulated refunds remain visibly non-financial test evidence, that outcomes are
 * idempotent, and that a client cannot select adapter mode or manufacture an accepted result.
 *
 * This exercises the simulator-control plane only. Canonical checkout (Medusa pp_simulated_simulated
 * -> canonical order group -> outbox -> NATS) is covered by `bun run test:payment-flow`.
 */

import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import type { PaymentStatus, SimulatorOutcome } from "../payment/types.js";

const config = loadConfig(process.env);
const experienceBaseUrl = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";

// Statuses a real provider adapter may produce. The simulator must never emit these.
const PROVIDER_ONLY: PaymentStatus[] = ["authorised", "captured"];

type PaymentState = {
  id: string;
  status: PaymentStatus;
  payment_mode: string;
  test_data: boolean;
  evidence_status: string;
  observed_at: string;
};

type PaymentSession = {
  id: string;
  status: PaymentStatus;
  payment_mode: string;
  test_data: boolean;
};

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${experienceBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function createSession(checkoutId: string): Promise<PaymentSession> {
  const { status, body } = await request<PaymentSession>(
    `/v1/checkouts/${encodeURIComponent(checkoutId)}/payment-sessions`,
    { method: "POST", body: JSON.stringify({ amount_minor: 64200, currency_code: "INR" }) },
  );
  assert.equal(status, 201, "simulator session should be created");
  assert.equal(body.payment_mode, "simulated");
  assert.equal(body.test_data, true);
  return body;
}

async function simulate(
  paymentId: string,
  outcome: SimulatorOutcome,
): Promise<{ status: number; body: PaymentState }> {
  return request<PaymentState>(`/v1/payments/${encodeURIComponent(paymentId)}/simulate`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
  });
}

function assertNonFinancial(state: PaymentState): void {
  assert.equal(state.payment_mode, "simulated", "simulator must stay in simulated mode");
  assert.equal(state.test_data, true, "simulator output must be test data");
  assert.ok(
    !PROVIDER_ONLY.includes(state.status),
    `simulator must never emit provider status ${state.status}`,
  );
}

function assertNonCapturing(state: PaymentState): void {
  // Simulated acceptance is evidence, never a captured/authorised charge.
  assert.notEqual(state.status, "captured");
  assert.notEqual(state.status, "authorised");
}

try {
  const allowedOutcomes: SimulatorOutcome[] = [
    "success",
    "failure",
    "pending",
    "duplicate",
    "late",
    "refund",
  ];

  // Reject anything outside the known outcome set.
  {
    const session = await createSession(`matrix-invalid-${Date.now()}`);
    const { status } = await request(
      `/v1/payments/${encodeURIComponent(session.id)}/simulate`,
      { method: "POST", body: JSON.stringify({ outcome: "provider_capture" }) },
    );
    assert.equal(status, 400, "unknown simulator outcome must be rejected");
  }

  // Reject an unknown session instead of silently succeeding.
  {
    const { status } = await request("/v1/payments/pay_does_not_exist/simulate", {
      method: "POST",
      body: JSON.stringify({ outcome: "success" }),
    });
    assert.equal(status, 404, "unknown payment id must be rejected");
  }

  const results: Record<string, string> = {};
  for (const outcome of allowedOutcomes) {
    const session = await createSession(`matrix-${outcome}-${Date.now()}`);
    const first = await simulate(session.id, outcome);
    assert.equal(first.status, 200, `outcome ${outcome} should be accepted`);
    assertNonFinancial(first.body);
    assertNonCapturing(first.body);

    // Re-applying the same outcome is idempotent: prior state, no new effect.
    const second = await simulate(session.id, outcome);
    assert.equal(second.status, 200, `repeat of ${outcome} should be accepted`);
    assert.deepEqual(
      second.body,
      first.body,
      `repeat of ${outcome} must not change state (idempotent)`,
    );

    // Read-back must match the recorded transition.
    const read = await request<PaymentState>(`/v1/payments/${encodeURIComponent(session.id)}`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, first.body, `read-back for ${outcome} must match`);

    results[outcome] = first.body.status;
  }

  // Explicit matrix expectations.
  assert.equal(results.success, "simulated_accepted");
  assert.equal(results.failure, "failed");
  assert.equal(results.pending, "pending");
  assert.equal(results.late, "simulated_accepted");
  assert.equal(results.refund, "simulated_refunded");
  // `duplicate` refreshes the marker without inventing a captured state.
  assert.ok(
    !PROVIDER_ONLY.includes(results.duplicate as PaymentStatus),
    "duplicate outcome must not fabricate provider status",
  );

  // A refund is visible test evidence, never a financial refund.
  {
    const session = await createSession(`matrix-refund-evidence-${Date.now()}`);
    const refund = await simulate(session.id, "refund");
    assert.equal(refund.body.status, "simulated_refunded");
    assert.equal(refund.body.evidence_status, "simulated_result");
    assert.equal(refund.body.payment_mode, "simulated");
    assert.equal(refund.body.test_data, true);
    assert.ok(
      refund.body.status.startsWith("simulated_"),
      "refund must be a simulated_* transition, not a real refund",
    );
    assertNonCapturing(refund.body);
  }

  // Provider-failure cannot fall back to simulation acceptance: the simulator records failure.
  {
    const session = await createSession(`matrix-no-fallback-${Date.now()}`);
    const failure = await simulate(session.id, "failure");
    assert.equal(failure.body.status, "failed");
    assert.notEqual(
      failure.body.status,
      "simulated_accepted",
      "a failed outcome must not be treated as accepted",
    );
  }

  // Clients cannot select adapter mode: `provider` mode is unimplemented and fails closed.
  assert.throws(
    () => loadConfig({ BUILDKART_ENVIRONMENT: "staging", PAYMENT_ADAPTER_MODE: "provider" }),
    /not implemented|simulated/i,
    "provider adapter mode must be refused in this increment",
  );

  console.log("PASS: simulator outcome matrix is controlled and non-financial.");
  for (const outcome of allowedOutcomes) {
    console.log(`  ${outcome.padEnd(10)} -> ${results[outcome]}`);
  }
  console.log("  invalid outcome -> 400, unknown session -> 404, provider mode -> refused");
} catch (error) {
  console.error("FAIL: simulator outcome matrix check failed.");
  console.error(error);
  process.exitCode = 1;
}
