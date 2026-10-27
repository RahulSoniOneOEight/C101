import assert from "node:assert/strict";

const baseUrl = (process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020").replace(/\/$/, "");
const otpCode = process.env.PILOT_OTP_CODE ?? "123456";

function configuredIdentifier(predicate: (roles: string[]) => boolean): string | undefined {
  if (!process.env.PILOT_USERS_JSON || !process.env.PILOT_ROLE_ASSIGNMENTS_JSON) return undefined;
  const users = JSON.parse(process.env.PILOT_USERS_JSON) as Array<{ id: string; email: string }>;
  const assignments = JSON.parse(process.env.PILOT_ROLE_ASSIGNMENTS_JSON) as Array<{
    userId: string;
    roles: string[];
  }>;
  const assignment = assignments.find((candidate) => predicate(candidate.roles));
  return users.find((candidate) => candidate.id === assignment?.userId)?.email;
}

const tradeIdentifier = process.env.PILOT_TEST_IDENTIFIER ?? configuredIdentifier(
  (roles) => roles.includes("b2b_buyer"),
);
const nonTradeIdentifier = process.env.PILOT_NON_TRADE_IDENTIFIER ?? configuredIdentifier(
  (roles) => roles.includes("customer") && !roles.some((role) => role.startsWith("b2b_")),
);

assert.ok(tradeIdentifier, "PILOT_TEST_IDENTIFIER must identify a B2B Trade Customers member");
assert.ok(nonTradeIdentifier, "PILOT_NON_TRADE_IDENTIFIER must identify a non-trade pilot customer");

interface Session {
  token: string;
  email: string;
}

interface Product {
  title: string;
  categories?: Array<{ name: string }>;
  best_price?: {
    id: string;
    selling_amount_minor?: number | null;
    unit_amount_minor?: number | null;
  } | null;
}

interface Cart {
  id: string;
  customer_id?: string | null;
  metadata?: Record<string, unknown> | null;
  promotions?: Array<{ code: string; is_automatic?: boolean }>;
  discount_total?: number;
  item_subtotal?: number;
  shipping_discount_total?: number;
  total?: number;
  items?: Array<{ unit_price: number; quantity?: number }>;
}

async function jsonRequest<T>(
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${path}: ${text}`);
  return text ? JSON.parse(text) as T : {} as T;
}

async function session(identifier: string): Promise<Session> {
  const challenge = await jsonRequest<{ challenge_id: string }>(
    "/v1/auth/otp/challenges",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier }),
    },
    201,
  );
  const verified = await jsonRequest<{
    session_token: string;
    user: { email: string };
  }>("/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.challenge_id, code: otpCode }),
  });
  return { token: verified.session_token, email: verified.user.email };
}

function authenticated(token: string, body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  };
}

async function createCart(actor: Session, channel: "b2c_app" | "b2b_app"): Promise<Cart> {
  const cart = await jsonRequest<Cart>(
    "/v1/carts",
    authenticated(actor.token, { channel }),
    201,
  );
  assert.ok(cart.customer_id, "new cart must be associated with the canonical Medusa customer");
  return cart;
}

async function addOffer(actor: Session, cartId: string, offerId: string): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/lines`,
    authenticated(actor.token, { offer_id: offerId, quantity: 1 }),
  );
}

async function addAddressAndShipping(actor: Session, cartId: string): Promise<Cart> {
  await jsonRequest(
    `/v1/carts/${encodeURIComponent(cartId)}/customer-details`,
    authenticated(actor.token, {
      email: actor.email,
      shipping_address: {
        first_name: "Staging",
        last_name: "Buyer",
        address_1: "1 Pilot Market Road",
        city: "Bengaluru",
        province: "Karnataka",
        postal_code: "560001",
        country_code: "in",
        phone: "+919000000001",
      },
    }),
  );
  const shipping = await jsonRequest<{
    shipping_options: Array<{ id: string }>;
  }>(`/v1/carts/${encodeURIComponent(cartId)}/shipping-options`, {
    headers: { authorization: `Bearer ${actor.token}` },
  });
  assert.ok(shipping.shipping_options.length > 0, "cart must resolve a seller shipping option");
  return jsonRequest(
    `/v1/carts/${encodeURIComponent(cartId)}/shipping-methods`,
    authenticated(actor.token, { option_id: shipping.shipping_options[0].id }),
  );
}

async function applyPromotion(
  actor: Session,
  cartId: string,
  code: string,
  expectedStatus = 200,
): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/promotions`,
    authenticated(actor.token, { code }),
    expectedStatus,
  );
}

function offerFor(products: Product[], category: string): {
  id: string;
  sellingAmount: number;
} {
  const product = products.find(
    (candidate) => candidate.categories?.some((item) => item.name === category) && candidate.best_price?.id,
  );
  assert.ok(product?.best_price?.id, `no live offer found for ${category}`);
  const sellingAmount = product.best_price.selling_amount_minor ?? product.best_price.unit_amount_minor;
  assert.ok(typeof sellingAmount === "number", `no selling amount found for ${category}`);
  return { id: product.best_price.id, sellingAmount };
}

function hasPromotion(cart: Cart, code: string): boolean {
  return Boolean(cart.promotions?.some((promotion) => promotion.code === code));
}

function subtotalOf(cart: Cart): number {
  return (
    cart.item_subtotal ??
    (cart.items ?? []).reduce(
      (sum, item) => sum + item.unit_price * (item.quantity ?? 1),
      0,
    )
  );
}

/** Exact discount for an order-level percentage, in minor units. */
function expectPercentDiscount(cart: Cart, percent: number, label: string): void {
  const expected = Math.round((subtotalOf(cart) * percent) / 100);
  assert.equal(
    cart.discount_total ?? 0,
    expected,
    `${label}: expected ${percent}% of ${subtotalOf(cart)} = ${expected}, got ${cart.discount_total ?? 0}`,
  );
}

async function removePromotion(actor: Session, cartId: string, code: string): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/promotions`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${actor.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code }),
    },
  );
}

const [trade, nonTrade] = await Promise.all([
  session(tradeIdentifier),
  session(nonTradeIdentifier),
]);
const catalogue = await jsonRequest<{ products: Product[] }>(
  "/v1/products?limit=250&catalogue_import=CHG-049",
  { headers: { authorization: `Bearer ${trade.token}` } },
);

const basinOffer = offerFor(catalogue.products, "Basin Mixers & Taps");
const pliersOffer = offerFor(catalogue.products, "Pliers & Cutters");
const plywoodOffer = offerFor(catalogue.products, "Plywood & Boards");

// --- B2C: the store-applied Flat5% offer and code replacement (U-003) -------------------------
const b2cCart = await createCart(nonTrade, "b2c_app");
const b2cLine = await addOffer(nonTrade, b2cCart.id, basinOffer.id);
assert.equal(b2cLine.items?.[0]?.unit_price, basinOffer.sellingAmount);
assert.ok(hasPromotion(b2cLine, "FLAT5"), "a new cart must receive FLAT5 without user action");
assert.equal(
  b2cLine.promotions?.find((promotion) => promotion.code === "FLAT5")?.is_automatic,
  true,
  "FLAT5 must carry the automatic marker",
);
expectPercentDiscount(b2cLine, 5, "FLAT5 on a new B2C cart");

const order10 = await applyPromotion(nonTrade, b2cCart.id, "ORDER10");
assert.ok(hasPromotion(order10, "ORDER10"));
assert.ok(!hasPromotion(order10, "FLAT5"), "ORDER10 must replace FLAT5, never stack");
expectPercentDiscount(order10, 10, "ORDER10 replaces FLAT5");

const order5 = await applyPromotion(nonTrade, b2cCart.id, "ORDER5");
assert.ok(hasPromotion(order5, "ORDER5"));
assert.ok(!hasPromotion(order5, "ORDER10"), "ORDER5 must replace ORDER10");
expectPercentDiscount(order5, 5, "ORDER5 replaces ORDER10");

const cleared = await removePromotion(nonTrade, b2cCart.id, "ORDER5");
assert.ok(!hasPromotion(cleared, "ORDER5"));
assert.equal(cleared.discount_total ?? 0, 0, "removing the active offer must leave 0%");

// --- B2B: Flat5% applies, then trade codes replace it ------------------------------------------
const tradeCart = await createCart(trade, "b2b_app");
const tradeLine = await addOffer(trade, tradeCart.id, basinOffer.id);
assert.equal(tradeLine.items?.[0]?.unit_price, basinOffer.sellingAmount);
assert.ok(hasPromotion(tradeLine, "FLAT5"), "B2B carts receive Flat5% too (U-003 D3)");
expectPercentDiscount(tradeLine, 5, "FLAT5 on a new B2B cart");

const tradeDiscount = await applyPromotion(trade, tradeCart.id, "TRADE7");
assert.ok(hasPromotion(tradeDiscount, "TRADE7"));
assert.ok(!hasPromotion(tradeDiscount, "FLAT5"), "TRADE7 must replace Flat5%");
expectPercentDiscount(tradeDiscount, 7, "TRADE7 replaces Flat5%");

await addAddressAndShipping(trade, tradeCart.id);
const tradeShipping = await applyPromotion(trade, tradeCart.id, "TRADEVIP");
assert.ok(hasPromotion(tradeShipping, "TRADEVIP"));
assert.ok(!hasPromotion(tradeShipping, "TRADE7"), "one offer at a time");
assert.ok((tradeShipping.shipping_discount_total ?? 0) > 0);

// Non-trade buyers stay rejected, and the current offer is kept after the rejection.
const nonTradeCart = await createCart(nonTrade, "b2c_app");
await addOffer(nonTrade, nonTradeCart.id, basinOffer.id);
await applyPromotion(nonTrade, nonTradeCart.id, "TRADE7", 422);
await addAddressAndShipping(nonTrade, nonTradeCart.id);
await applyPromotion(nonTrade, nonTradeCart.id, "TRADEVIP", 422);

const toolsCart = await createCart(nonTrade, "b2c_app");
await addOffer(nonTrade, toolsCart.id, pliersOffer.id);
const toolsDiscount = await applyPromotion(nonTrade, toolsCart.id, "TOOLS200");
assert.ok(hasPromotion(toolsDiscount, "TOOLS200"));
// Known defect C-07: TOOLS200 is worth INR 2, not INR 200. Out of scope for U-003.
assert.ok((toolsDiscount.discount_total ?? 0) > 0);

// Retired automatic offer: PLY5 is inactive and cannot be applied by anyone.
const plywoodCart = await createCart(nonTrade, "b2c_app");
const plywoodLine = await addOffer(nonTrade, plywoodCart.id, plywoodOffer.id);
assert.ok(!hasPromotion(plywoodLine, "PLY5"), "PLY5 must not auto-apply after retirement");
assert.ok(hasPromotion(plywoodLine, "FLAT5"), "Flat5% applies to any category");
await applyPromotion(nonTrade, plywoodCart.id, "PLY5", 422);

// A new cart auto-applies Flat5% again after another cart opted out.
const freshCart = await createCart(nonTrade, "b2c_app");
const freshLine = await addOffer(nonTrade, freshCart.id, basinOffer.id);
assert.ok(hasPromotion(freshLine, "FLAT5"), "a new cart receives Flat5% again");

console.log(
  "promotion acceptance passed: Flat5% auto (B2C+B2B), ORDER10/ORDER5 replacement, remove=0%, " +
    "TRADE7/TRADEVIP replacement, non-trade rejection, PLY5 retired, TOOLS200, fresh cart re-apply",
);
