import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repo = process.argv[2];
const checkoutRef = process.argv[3];
if (!repo || !checkoutRef) throw new Error("usage: staging-order-read-proof.mjs <repo> <checkout-ref>");

const access = readFileSync(
  path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
if (!otp) throw new Error("PILOT_OTP_CODE is missing from the staging access file");

const base = "https://api-staging.pinakaplay.cloud";
const owner = "nihar1008.nj@gmail.com";
const call = async (pathname, init = {}, expected = 200) => {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${pathname} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

const challenge = await call(
  "/v1/auth/otp/challenges",
  { method: "POST", body: JSON.stringify({ identifier: owner }) },
  201,
);
const verified = await call("/v1/auth/otp/verify", {
  method: "POST",
  body: JSON.stringify({ challenge_id: challenge.challenge_id, code: otp }),
});
const order = await call(`/v1/orders/${encodeURIComponent(checkoutRef)}`, {
  headers: { authorization: `Bearer ${verified.session_token}` },
});

const proof = {
  generated_at: new Date().toISOString(),
  checkout_ref: checkoutRef,
  order_id: order.order_id ?? null,
  order_group_id: order.medusa_order_group_id ?? null,
  order_number: order.order_number ?? null,
  status: order.status ?? null,
  payment_mode: order.payment_mode ?? null,
  test_data: order.test_data ?? null,
  total_minor: order.total_minor ?? null,
  line_count: Array.isArray(order.lines) ? order.lines.length : null,
  lines: (order.lines ?? []).map((line) => ({
    sku: line.sku ?? null,
    title: line.title ?? null,
    quantity: line.quantity ?? null,
    unit_price_minor: line.unit_price ?? line.unit_price_minor ?? null,
  })),
  shipments: (order.shipments ?? []).map((shipment) => ({
    id: shipment.id,
    status: shipment.status,
    tracking_number: shipment.trackingNumber ?? null,
    provider: shipment.provider ?? null,
    logistics_mode: shipment.logisticsMode ?? null,
    test_data: shipment.testData ?? null,
    seller_id: shipment.seller_id,
  })),
  returns: (order.returns ?? []).length,
};

writeFileSync(
  path.join(repo, "client-projects/client101/evidence/CHG-094/staging-order-read-proof.json"),
  `${JSON.stringify(proof, null, 2)}\n`,
);
console.log(JSON.stringify(proof, null, 2));
