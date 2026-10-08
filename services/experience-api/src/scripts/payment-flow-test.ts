import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../config.js";
import { NatsSubscriber } from "../events/nats-subscriber.js";
import {
  MedusaStoreClient,
  SIMULATED_PAYMENT_PROVIDER_ID,
} from "../medusa/store-client.js";
import { createPilotSession } from "./pilot-session.js";

type CheckoutResult = {
  type: "order_group" | "cart";
  order_group?: { id: string };
  payment?: {
    payment_collection_id: string;
    payment_session_id: string;
    provider_id: string;
    payment_mode: string;
    test_data: boolean;
  };
  detail?: string;
};

const config = loadConfig(process.env);
const medusa = new MedusaStoreClient(config);
const experienceBaseUrl = process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020";
const medusaDatabaseUrl = process.env.MEDUSA_DATABASE_URL ??
  "postgres://buildkart:buildkart@localhost:5433/buildkart";
const experiencePool = new pg.Pool({ connectionString: config.experienceDatabaseUrl, max: 2 });
const medusaPool = new pg.Pool({ connectionString: medusaDatabaseUrl, max: 2 });
let pilotToken: string | undefined;

async function experienceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${experienceBaseUrl}${path}`, {
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
    throw new Error(`Experience request failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

async function waitForPublishedOutbox(orderGroupId: string): Promise<{
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  published_at: Date;
}> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await experiencePool.query(
      `SELECT id, event_type, payload, published_at
       FROM domain_event
       WHERE aggregate_id = $1 AND event_type = 'order.confirmed'
       ORDER BY occurred_at DESC LIMIT 1`,
      [orderGroupId],
    );
    if (result.rows[0]?.published_at) return result.rows[0];
    await Bun.sleep(200);
  }
  throw new Error(`Published order.confirmed outbox entry not found for ${orderGroupId}`);
}

try {
  // Acceptance 4: both the Experience API and Medusa enforce the same production boundary.
  assert.throws(
    () => loadConfig({
      BUILDKART_ENVIRONMENT: "production",
      PAYMENT_ADAPTER_MODE: "simulated",
    }),
    /Refusing to start/,
  );

  const pilot = await createPilotSession(experienceBaseUrl);
  pilotToken = pilot.token;

  const regionLink = await medusaPool.query(
    `SELECT 1 FROM region_payment_provider
     WHERE region_id = $1 AND payment_provider_id = $2 AND deleted_at IS NULL`,
    [config.medusaRegionId, SIMULATED_PAYMENT_PROVIDER_ID],
  );
  assert.equal(regionLink.rowCount, 1, "simulated provider must be linked to the India region");

  const products = await medusa.listProducts(20, 0);
  const offers = await medusa.listOffersByProducts(products.map((product) => product.id));
  const offer = offers.find((candidate) => candidate.in_stock !== false);
  assert.ok(offer, "an in-stock pilot offer is required");

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
      shipping_address: {
        first_name: "Pilot",
        last_name: "Buyer",
        address_1: "101 Test Yard",
        city: "Jaipur",
        postal_code: "302001",
        country_code: "IN",
      },
    }),
  });
  const shipping = await experienceJson<{
    shipping_options: { id: string }[];
  }>(`/v1/carts/${encodeURIComponent(cart.id)}/shipping-options`);
  const shippingOption = shipping.shipping_options[0];
  assert.ok(shippingOption, "a seeded seller shipping option is required");
  await experienceJson(`/v1/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: shippingOption.id }),
  });

  // Acceptance: the staging test order carries a committed Tryton reservation before completion.
  assert.ok(offer.sku, "the selected offer must expose a SKU for reservation");
  await experienceJson(`/v1/admin/tryton/variants`, {
    method: "POST",
    body: JSON.stringify({
      sku: offer.sku,
      name: offer.sku,
      price: offer.calculated_price?.calculated_amount ?? 0,
    }),
  });
  const reserve = await experienceJson<{ status: string; tryton_move_id: number }>(
    `/v1/checkouts/${encodeURIComponent(cart.id)}/reserve`,
    { method: "POST", body: JSON.stringify({ sku: offer.sku, quantity: 1 }) },
  );
  assert.equal(reserve.status, "reserved");
  assert.ok(reserve.tryton_move_id, "reservation did not create a Tryton move");
  const commit = await experienceJson<{ status: string }>(
    `/v1/checkouts/${encodeURIComponent(cart.id)}/commit`,
    { method: "POST" },
  );
  assert.equal(commit.status, "committed");

  // Acceptance 1: bypassing Experience orchestration cannot create an order without a session.
  let blockedWithoutSession = false;
  try {
    const directResult = await medusa.completeCart(cart.id);
    blockedWithoutSession = directResult.type !== "order_group";
  } catch (error) {
    blockedWithoutSession = /payment collection|payment session|payment/i.test((error as Error).message);
  }
  assert.equal(blockedWithoutSession, true, "cart completed without a payment session");

  const correlationId = `payment-flow-${Date.now()}`;
  const response = await fetch(
    `${experienceBaseUrl}/v1/checkouts/${encodeURIComponent(cart.id)}/complete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pilot.token}`,
        "x-correlation-id": correlationId,
      },
    },
  );
  const checkout = await response.json() as CheckoutResult;
  assert.equal(response.ok, true, checkout.detail ?? `checkout returned ${response.status}`);
  assert.equal(checkout.type, "order_group", "simulated checkout did not create an order group");
  assert.ok(checkout.order_group?.id, "order group id is missing");
  assert.deepEqual(
    {
      provider_id: checkout.payment?.provider_id,
      payment_mode: checkout.payment?.payment_mode,
      test_data: checkout.payment?.test_data,
    },
    {
      provider_id: SIMULATED_PAYMENT_PROVIDER_ID,
      payment_mode: "simulated",
      test_data: true,
    },
  );

  const retryResponse = await fetch(
    `${experienceBaseUrl}/v1/checkouts/${encodeURIComponent(cart.id)}/complete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${pilot.token}`,
        "x-correlation-id": `${correlationId}-retry`,
      },
    },
  );
  const retryCheckout = await retryResponse.json() as CheckoutResult;
  assert.equal(retryResponse.ok, true, retryCheckout.detail ?? `retry returned ${retryResponse.status}`);
  assert.equal(retryCheckout.order_group?.id, checkout.order_group.id);
  assert.equal(retryCheckout.payment?.payment_session_id, checkout.payment?.payment_session_id);
  const orderGroupCount = await medusaPool.query(
    "SELECT count(*)::int AS count FROM order_group WHERE cart_id = $1 AND deleted_at IS NULL",
    [cart.id],
  );
  assert.equal(orderGroupCount.rows[0].count, 1, "duplicate completion created another order group");

  // Acceptance 2/3: canonical Medusa payment data uses only the local provider and test markers.
  const paymentResult = await medusaPool.query(
    `SELECT ps.id, ps.provider_id, ps.status, ps.data, pc.id AS payment_collection_id
     FROM cart_payment_collection cpc
     JOIN payment_collection pc ON pc.id = cpc.payment_collection_id AND pc.deleted_at IS NULL
     JOIN payment_session ps ON ps.payment_collection_id = pc.id AND ps.deleted_at IS NULL
     WHERE cpc.cart_id = $1 AND cpc.deleted_at IS NULL
     ORDER BY ps.created_at DESC LIMIT 1`,
    [cart.id],
  );
  const payment = paymentResult.rows[0];
  assert.ok(payment, "canonical Medusa payment session was not persisted");
  assert.equal(payment.provider_id, SIMULATED_PAYMENT_PROVIDER_ID);
  assert.equal(payment.data?.payment_mode, "simulated");
  assert.equal(payment.data?.test_data, true);
  const orderResult = await medusaPool.query(
    `SELECT o.id, o.metadata
     FROM order_group_order ogo
     JOIN "order" o ON o.id = ogo.order_id AND o.deleted_at IS NULL
     WHERE ogo.order_group_id = $1 AND ogo.deleted_at IS NULL`,
    [checkout.order_group.id],
  );
  assert.ok(orderResult.rowCount, "canonical seller order was not persisted");
  for (const order of orderResult.rows) {
    assert.equal(order.metadata?.payment_mode, "simulated");
    assert.equal(order.metadata?.test_data, true);
  }
  const allocationResult = await medusaPool.query(
    `SELECT DISTINCT seller_link.seller_id, offer_link.offer_id
     FROM order_group_order ogo
     JOIN order_order_seller_seller seller_link
       ON seller_link.order_id = ogo.order_id AND seller_link.deleted_at IS NULL
     JOIN order_item item ON item.order_id = ogo.order_id AND item.deleted_at IS NULL
     JOIN order_order_line_item_offer_offer offer_link
       ON offer_link.order_line_item_id = item.item_id AND offer_link.deleted_at IS NULL
     WHERE ogo.order_group_id = $1 AND ogo.deleted_at IS NULL`,
    [checkout.order_group.id],
  );
  assert.ok(allocationResult.rowCount, "Mercur seller allocation was not persisted");
  for (const allocation of allocationResult.rows) {
    assert.equal(allocation.offer_id, offer.id, "selected offer was silently substituted");
    assert.equal(allocation.seller_id, offer.seller_id, "selected seller was silently substituted");
  }

  // Acceptance 6: canonical event -> durable outbox -> JetStream -> Mercur durable consumer.
  const orderGroupId = checkout.order_group.id;
  const outbox = await waitForPublishedOutbox(orderGroupId);
  assert.equal(outbox.event_type, "order.confirmed");
  assert.equal((outbox.payload.payment as Record<string, unknown>)?.test_data, true);
  const eventCount = await experiencePool.query(
    `SELECT count(*)::int AS count FROM domain_event
     WHERE aggregate_id = $1 AND event_type = 'order.confirmed'`,
    [orderGroupId],
  );
  assert.equal(eventCount.rows[0].count, 1, "duplicate completion emitted another order.confirmed");

  // Acceptance: order, allocation and committed reservation reconcile with no production effect.
  const reconciliation = await experienceJson<{
    reconciled: boolean;
    accounting_treatment: string;
    bank_receipt_claimed: boolean;
    reservation: { status: string };
    allocation: { status: string };
  }>(`/v1/admin/orders/${encodeURIComponent(cart.id)}/reconciliation`);
  assert.equal(reconciliation.reconciled, true, "order/allocation/reservation did not reconcile");
  assert.equal(reconciliation.reservation.status, "committed");
  assert.equal(reconciliation.allocation.status, "confirmed");
  assert.equal(reconciliation.accounting_treatment, "staging_test_clearing");
  assert.equal(reconciliation.bank_receipt_claimed, false, "staging must not claim a bank receipt");

  let mercurDelivered = false;
  const subscriber = new NatsSubscriber(config.natsUrl);
  await subscriber.connect();
  await subscriber.consume(
    "mercur-allocation",
    "commerce.>",
    async (event, subject) => {
      if (subject === "commerce.order.created.v1" && event.aggregate_id === orderGroupId) {
        mercurDelivered = true;
      }
    },
    { maxMessages: 100, expiresMs: 5000 },
  );
  await subscriber.close();
  assert.equal(mercurDelivered, true, "Mercur allocation consumer did not receive the order event");

  console.log("PASS: simulated payment flow created a canonical test order.");
  console.log(`  cart=${cart.id}`);
  console.log(`  payment_collection=${payment.payment_collection_id}`);
  console.log(`  payment_session=${payment.id} (${payment.status})`);
  console.log(`  order_group=${orderGroupId}`);
  console.log(`  outbox=${outbox.id} -> commerce.order.created.v1 -> mercur-allocation`);
} finally {
  await Promise.all([experiencePool.end(), medusaPool.end()]);
}
