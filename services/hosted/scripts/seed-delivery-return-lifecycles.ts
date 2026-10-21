/**
 * Populate hosted staging with deterministic delivery and return lifecycle examples.
 *
 * Usage:
 *   bun seed-delivery-return-lifecycles.ts <customerEmail> <sellerName>
 *
 * This script deliberately refuses non-staging hosts. It uses the real customer checkout API,
 * seller-scoped shipment updates, customer return initiation and admin decisions. Return decisions
 * remain evidence-only and create no Medusa money effect or Tryton stock effect.
 */

export {};

const CUSTOMER_BASE = (
  process.env.BASE ?? "https://api-staging.pinakaplay.cloud"
).replace(/\/+$/, "");
const OPS_BASE = (
  process.env.OPS_BASE ?? "https://ops-staging.pinakaplay.cloud"
).replace(/\/+$/, "");
const ADMIN_SECRET =
  process.env.BUILDKART_ADMIN_SERVICE_SECRET ??
  "buildkart-staging-dummy-admin-service-secret";

type Json = Record<string, any>;
type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type Scenario = {
  name: string;
  shipmentStatus?: "in_transit" | "delivery_failed" | "delivered";
  returnDecision?: "requested" | "approved" | "rejected";
  reasonCode?: "damaged" | "wrong_item" | "not_as_described";
};

const scenarios: Scenario[] = [
  { name: "booked" },
  { name: "in-transit", shipmentStatus: "in_transit" },
  { name: "delivery-failed", shipmentStatus: "delivery_failed" },
  {
    name: "return-requested",
    shipmentStatus: "delivered",
    returnDecision: "requested",
    reasonCode: "damaged",
  },
  {
    name: "return-approved",
    shipmentStatus: "delivered",
    returnDecision: "approved",
    reasonCode: "wrong_item",
  },
  {
    name: "return-rejected",
    shipmentStatus: "delivered",
    returnDecision: "rejected",
    reasonCode: "not_as_described",
  },
];

const [email, sellerName] = process.argv.slice(2);
if (!email || !sellerName) {
  console.error(
    "usage: bun seed-delivery-return-lifecycles.ts <customerEmail> <sellerName>",
  );
  process.exit(2);
}
if (!CUSTOMER_BASE.includes("staging") || !OPS_BASE.includes("staging")) {
  throw new Error(
    "Lifecycle fixtures are staging-only; both API hosts must contain 'staging'.",
  );
}

async function request(
  base: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; json: Json }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json: Json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: response.status, json };
}

function assertOk(
  result: { status: number; json: Json },
  operation: string,
  expected?: number,
): Json {
  const okay = expected ? result.status === expected : result.status < 300;
  if (!okay) {
    throw new Error(
      `${operation} failed (${result.status}): ${JSON.stringify(result.json).slice(0, 300)}`,
    );
  }
  return result.json;
}

async function login(): Promise<string> {
  const challenge = assertOk(
    await request(CUSTOMER_BASE, "/v1/auth/otp/challenges", {
      method: "POST",
      body: { identifier: email },
    }),
    "OTP challenge",
    201,
  );
  const verified = assertOk(
    await request(CUSTOMER_BASE, "/v1/auth/otp/verify", {
      method: "POST",
      body: { challenge_id: challenge.challenge_id, code: "123456" },
    }),
    "OTP verification",
    200,
  );
  return String(verified.session_token);
}

async function chooseOffer(): Promise<{
  id: string;
  sellerId: string;
  sku: string;
}> {
  const list = assertOk(
    await request(CUSTOMER_BASE, "/v1/products?limit=100"),
    "product list",
  );
  const products: Json[] = [...(list.products ?? [])].sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  );
  const matches: Array<{ id: string; sellerId: string; sku: string }> = [];
  for (const product of products) {
    const detail = assertOk(
      await request(
        CUSTOMER_BASE,
        `/v1/products/${encodeURIComponent(product.id)}`,
      ),
      `product ${product.id}`,
    );
    for (const offer of detail.offers ?? []) {
      if (offer.seller_name === sellerName) {
        matches.push({
          id: String(offer.id),
          sellerId: String(offer.seller_id),
          sku: String(offer.sku),
        });
      }
    }
  }
  matches.sort((a, b) => a.sku.localeCompare(b.sku));
  if (!matches[0])
    throw new Error(`No offer found for seller "${sellerName}".`);
  return matches[0];
}

async function createOrder(
  token: string,
  offer: { id: string; sellerId: string },
): Promise<{ orderId: string; orderGroupId: string }> {
  const cart = assertOk(
    await request(CUSTOMER_BASE, "/v1/carts", {
      method: "POST",
      token,
      body: {},
    }),
    "create cart",
  );
  const cartId = String(cart.id);
  assertOk(
    await request(CUSTOMER_BASE, `/v1/carts/${cartId}/lines`, {
      method: "POST",
      token,
      body: { offer_id: offer.id, quantity: 1 },
    }),
    "add cart line",
  );
  assertOk(
    await request(CUSTOMER_BASE, `/v1/carts/${cartId}/customer-details`, {
      method: "POST",
      token,
      body: {
        email,
        shipping_address: {
          first_name: "Lifecycle",
          last_name: "Fixture",
          address_1: "12 Industrial Estate Road",
          city: "Bengaluru",
          postal_code: "560001",
          country_code: "in",
        },
      },
    }),
    "set customer details",
  );
  const shipping = assertOk(
    await request(CUSTOMER_BASE, `/v1/carts/${cartId}/shipping-options`, {
      token,
    }),
    "shipping options",
  );
  const option =
    (shipping.shipping_options ?? []).find(
      (candidate: Json) => candidate.seller_id === offer.sellerId,
    ) ?? shipping.shipping_options?.[0];
  if (!option?.id) throw new Error(`No shipping option for cart ${cartId}.`);
  assertOk(
    await request(CUSTOMER_BASE, `/v1/carts/${cartId}/shipping-methods`, {
      method: "POST",
      token,
      body: { option_id: option.id },
    }),
    "set shipping method",
  );
  const completed = assertOk(
    await request(CUSTOMER_BASE, `/v1/checkouts/${cartId}/complete`, {
      method: "POST",
      token,
    }),
    "complete checkout",
  );
  const orderGroupId = String(completed.order_group?.id ?? "");
  if (!orderGroupId)
    throw new Error(`Checkout ${cartId} returned no order group.`);
  return { orderId: cartId, orderGroupId };
}

const adminHeaders = {
  "x-buildkart-admin-service-secret": ADMIN_SECRET,
  "x-operator-user-id": "staging-lifecycle-fixture",
};

async function waitForShipment(orderGroupId: string): Promise<Json> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = assertOk(
      await request(OPS_BASE, "/v1/admin/shipments?limit=200", {
        headers: adminHeaders,
      }),
      "shipment list",
    );
    const shipment = (response.items ?? []).find(
      (candidate: Json) => candidate.orderGroupId === orderGroupId,
    );
    if (shipment) return shipment;
    await Bun.sleep(1_000);
  }
  throw new Error(`Shipment booking timed out for ${orderGroupId}.`);
}

async function updateShipment(shipment: Json, status: string): Promise<Json> {
  const delivered = status === "delivered";
  const body: Json = { status };
  if (delivered) {
    body.proof_ref = `staging://fixture/${shipment.id}`;
    body.delivered_lines = (shipment.lines ?? []).map((line: Json) => ({
      line_key: line.lineKey,
      delivered_qty: line.orderedQty,
    }));
  }
  const result = assertOk(
    await request(
      OPS_BASE,
      `/v1/seller/shipments/${encodeURIComponent(shipment.id)}/status`,
      {
        method: "POST",
        headers: {
          "x-buildkart-admin-service-secret": ADMIN_SECRET,
          "x-buildkart-seller-id": String(shipment.sellerId),
          "x-operator-user-id": "staging-lifecycle-seller",
        },
        body,
      },
    ),
    `update shipment ${shipment.id}`,
  );
  return result.shipment;
}

async function requestReturn(
  token: string,
  orderId: string,
  reasonCode: string,
  scenario: string,
): Promise<Json> {
  const order = assertOk(
    await request(CUSTOMER_BASE, `/v1/orders/${encodeURIComponent(orderId)}`, {
      token,
    }),
    `read order ${orderId}`,
  );
  const eligible = (order.return_eligibility ?? []).find(
    (line: Json) => line.eligible && Number(line.returnable_qty ?? 0) > 0,
  );
  if (!eligible) throw new Error(`No return-eligible line for ${orderId}.`);
  const result = assertOk(
    await request(
      CUSTOMER_BASE,
      `/v1/orders/${encodeURIComponent(orderId)}/returns`,
      {
        method: "POST",
        token,
        headers: { "idempotency-key": `fixture-${scenario}-${orderId}` },
        body: {
          resolution: "refund",
          reason_code: reasonCode,
          customer_comment: `Staging lifecycle fixture: ${scenario}`,
          lines: [
            {
              line_key: eligible.line_key,
              requested_qty: 1,
              reason_code: reasonCode,
            },
          ],
        },
      },
    ),
    `request return for ${orderId}`,
  );
  return result.return;
}

async function decideReturn(record: Json, decision: "approved" | "rejected") {
  const body: Json = {
    comment: `Staging lifecycle fixture: ${decision}`,
  };
  if (decision === "approved") {
    body.approved_lines = (record.lines ?? []).map((line: Json) => ({
      line_key: line.lineKey,
      approved_qty: line.requestedQty,
    }));
  }
  const result = assertOk(
    await request(
      OPS_BASE,
      `/v1/admin/returns/${encodeURIComponent(record.id)}/${decision === "approved" ? "approve" : "reject"}`,
      { method: "POST", headers: adminHeaders, body },
    ),
    `${decision} return ${record.id}`,
  );
  return result.return;
}

const token = await login();
const offer = await chooseOffer();
console.log(`Using seller "${sellerName}" and SKU ${offer.sku}.`);

const summary: Json[] = [];
for (const [index, scenario] of scenarios.entries()) {
  console.log(
    `[${index + 1}/${scenarios.length}] ${scenario.name}: creating order`,
  );
  const order = await createOrder(token, offer);
  let shipment = await waitForShipment(order.orderGroupId);
  if (scenario.shipmentStatus) {
    shipment = await updateShipment(shipment, scenario.shipmentStatus);
  }
  let returnCase: Json | null = null;
  if (scenario.returnDecision) {
    returnCase = await requestReturn(
      token,
      order.orderId,
      scenario.reasonCode ?? "damaged",
      scenario.name,
    );
    if (scenario.returnDecision !== "requested") {
      returnCase = await decideReturn(returnCase, scenario.returnDecision);
    }
  }
  summary.push({
    scenario: scenario.name,
    order_id: order.orderId,
    order_group_id: order.orderGroupId,
    shipment_id: shipment.id,
    shipment_status: shipment.status,
    return_id: returnCase?.id ?? null,
    return_status: returnCase?.status ?? null,
  });
  console.log(
    `  ${order.orderGroupId}: shipment=${shipment.status} return=${returnCase?.status ?? "none"}`,
  );
}

console.log("Lifecycle fixtures complete:");
console.log(JSON.stringify(summary, null, 2));
