import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import { MedusaStoreClient } from "../medusa/store-client.js";
import { createPilotSession } from "./pilot-session.js";

/**
 * E-017-018 cross-system staging reconciliation evidence.
 *
 * Proves a canonical checkout, its Mercur allocation and its Tryton reservation/movement share one
 * correlation reference; that a missing reservation is visible as a mismatch; and that the mismatch is
 * recoverable through the API (no direct database edits), with simulated/test markers preserved in
 * every projection.
 */

const config = loadConfig(process.env);
const medusa = new MedusaStoreClient(config);
const base = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";
let pilotToken: string | undefined;

async function experienceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(pilotToken ? { authorization: `Bearer ${pilotToken}` } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Experience request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

type Reconciliation = {
  reconciled: boolean;
  mismatch_codes: string[];
  recovery_actions: string[];
  accounting_treatment: string;
  bank_receipt_claimed: boolean;
  test_data: boolean;
  reservation: { status: string; test_data: boolean };
  allocation: { status: string; test_data: boolean };
  movement: { status: string; test_data: boolean };
  accounting: { test_data: boolean };
};

try {
  const pilot = await createPilotSession(base);
  pilotToken = pilot.token;
  const products = await medusa.listProducts(20, 0);
  const offers = await medusa.listOffersByProducts(products.map((p) => p.id));
  const offer = offers.find((candidate) => candidate.in_stock !== false);
  assert.ok(offer?.sku, "an in-stock pilot offer with a SKU is required");

  await experienceJson("/v1/admin/tryton/variants", {
    method: "POST",
    body: JSON.stringify({ sku: offer.sku, name: offer.sku, price: offer.calculated_price?.calculated_amount ?? 0 }),
  });

  const cart = await experienceJson<{ id: string }>("/v1/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: config.medusaRegionId, currency_code: "inr" }),
  });
  await experienceJson(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
    method: "POST",
    body: JSON.stringify({ offer_id: offer.id, quantity: 1 }),
  });
  await experienceJson(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
    body: JSON.stringify({
      email: pilot.user.email,
      shipping_address: { first_name: "Pilot", last_name: "Buyer", address_1: "101 Test Yard", city: "Jaipur", postal_code: "302001", country_code: "IN" },
    }),
  });
  const shipping = await experienceJson<{ shipping_options: { id: string }[] }>(
    `/v1/carts/${encodeURIComponent(cart.id)}/shipping-options`,
  );
  await experienceJson(`/v1/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: shipping.shipping_options[0].id }),
  });

  const completion = await experienceJson<{ type: string; order_group?: { id: string } }>(
    `/v1/checkouts/${encodeURIComponent(cart.id)}/complete`,
    { method: "POST" },
  );
  assert.equal(completion.type, "order_group", "checkout should produce a canonical order group");

  // Before reservation: the order exists but the reservation is missing -> visible mismatch.
  const before = await experienceJson<Reconciliation>(
    `/v1/admin/orders/${encodeURIComponent(cart.id)}/reconciliation`,
  );
  assert.equal(before.reconciled, false, "order without a reservation must not be reconciled");
  assert.ok(before.mismatch_codes.includes("RESERVATION_OR_ORDER_MISSING"), "mismatch code required");
  assert.ok(before.recovery_actions.length > 0, "recovery actions must be offered");

  // Recover through the API (no direct DB edits): reserve + commit on the same cart reference.
  const reserve = await experienceJson<{ status: string; tryton_move_id: number }>(
    `/v1/checkouts/${encodeURIComponent(cart.id)}/reserve`,
    { method: "POST", body: JSON.stringify({ sku: offer.sku, quantity: 1 }) },
  );
  assert.equal(reserve.status, "reserved");
  const commit = await experienceJson<{ status: string }>(
    `/v1/checkouts/${encodeURIComponent(cart.id)}/commit`,
    { method: "POST" },
  );
  assert.equal(commit.status, "committed");

  const after = await experienceJson<Reconciliation>(
    `/v1/admin/orders/${encodeURIComponent(cart.id)}/reconciliation`,
  );
  assert.equal(after.reconciled, true, "recovery must reconcile the order");
  assert.deepEqual(after.mismatch_codes, []);
  assert.deepEqual(after.recovery_actions, []);
  assert.equal(after.reservation.status, "committed");
  assert.equal(after.allocation.status, "confirmed");
  assert.equal(after.movement.status, "staging-posted");
  assert.equal(after.accounting_treatment, "staging_test_clearing");
  assert.equal(after.bank_receipt_claimed, false);
  for (const projection of [after.reservation, after.allocation, after.movement, after.accounting]) {
    assert.equal(projection.test_data, true, "test markers must be preserved in every projection");
  }

  console.log("PASS: cross-system reconciliation is visible, recoverable and test-marked.");
  console.log(`  cart=${cart.id} order_group=${completion.order_group?.id}`);
  console.log("  mismatch (before) -> reserve+commit -> reconciled (after)");
} catch (error) {
  console.error("FAIL: reconciliation check failed.");
  console.error(error);
  process.exitCode = 1;
}
