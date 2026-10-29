import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE || "/root", ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
const base = "https://api-staging.pinakaplay.cloud";
const buyer = "buyer.b2b01@buildkart.test";
const cartId = "cart_01M64F18EAP0P0QD1753N50W3E";

async function call(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status}: ${text}`);
  return json;
}

const challenge = await call("/v1/auth/otp/challenges", { method: "POST", body: { identifier: buyer } });
const verified = await call("/v1/auth/otp/verify", {
  method: "POST",
  body: { challenge_id: challenge.challenge_id, code: otp },
});
const token = verified.session_token;
const order = await call(`/v1/orders/${cartId}`, { token });
let history = null;
try {
  history = await call("/v1/me/orders", { token });
} catch (error) {
  history = { error: error.message };
}
const summary = {
  buyer,
  cart_id: cartId,
  order_id: order.order_id ?? null,
  order_group_id: order.medusa_order_group_id ?? null,
  order_number: order.order_number ?? null,
  status: order.status ?? null,
  subtotal_minor: order.subtotal_minor ?? null,
  shipping_minor: order.shipping_minor ?? null,
  discount_minor: order.discount_minor ?? null,
  total_minor: order.total_minor ?? null,
  currency_code: order.currency_code ?? null,
  payment_mode: order.payment_mode ?? null,
  shipment_status: order.shipments?.[0]?.status ?? null,
  shipment_tracking: order.shipments?.[0]?.trackingNumber ?? null,
  reservation_status: order.reservation_status ?? null,
  reconciled: order.reconciled ?? null,
  lines: order.lines ?? null,
  history_count: Array.isArray(history?.orders) ? history.orders.length : null,
  history_contains_order:
    Array.isArray(history?.orders) &&
    history.orders.some((entry) => JSON.stringify(entry).includes(cartId)),
};
fs.writeFileSync(path.join(__dirname, "b2b-customer-readback.json"), JSON.stringify({ summary, order, history }, null, 2));
console.log(JSON.stringify(summary, null, 2));
