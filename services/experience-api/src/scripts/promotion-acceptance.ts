import assert from "node:assert/strict";

const baseUrl = (process.env.EXPERIENCE_BASE_URL ?? "http://localhost:9020").replace(/\/$/, "");
const tradeIdentifier = process.env.PILOT_TEST_IDENTIFIER;
const nonTradeIdentifier = process.env.PILOT_NON_TRADE_IDENTIFIER;
const otpCode = process.env.PILOT_OTP_CODE ?? "123456";

assert.ok(tradeIdentifier, "PILOT_TEST_IDENTIFIER must identify a B2B Trade Customers member");
assert.ok(nonTradeIdentifier, "PILOT_NON_TRADE_IDENTIFIER must identify a non-trade pilot customer");

interface Session {
  token: string;
  email: string;
}

interface Product {
  title: string;
  categories?: Array<{ name: string }>;
  best_price?: { id: string } | null;
}

interface Cart {
  id: string;
  customer_id?: string | null;
  promotions?: Array<{ code: string }>;
  discount_total?: number;
  shipping_discount_total?: number;
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

async function createCart(actor: Session): Promise<Cart> {
  const cart = await jsonRequest<Cart>(
    "/v1/carts",
    authenticated(actor.token, { channel: "b2b_app" }),
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

function offerFor(products: Product[], category: string): string {
  const product = products.find(
    (candidate) => candidate.categories?.some((item) => item.name === category) && candidate.best_price?.id,
  );
  assert.ok(product?.best_price?.id, `no live offer found for ${category}`);
  return product.best_price.id;
}

function hasPromotion(cart: Cart, code: string): boolean {
  return Boolean(cart.promotions?.some((promotion) => promotion.code === code));
}

const [trade, nonTrade, catalogue] = await Promise.all([
  session(tradeIdentifier),
  session(nonTradeIdentifier),
  jsonRequest<{ products: Product[] }>("/v1/products?limit=250&catalogue_import=CHG-049"),
]);

const basinOffer = offerFor(catalogue.products, "Basin Mixers & Taps");
const pliersOffer = offerFor(catalogue.products, "Pliers & Cutters");
const plywoodOffer = offerFor(catalogue.products, "Plywood & Boards");

const tradeCart = await createCart(trade);
await addOffer(trade, tradeCart.id, basinOffer);
const tradeDiscount = await applyPromotion(trade, tradeCart.id, "TRADE7");
assert.ok(hasPromotion(tradeDiscount, "TRADE7"));
assert.ok((tradeDiscount.discount_total ?? 0) > 0);

await jsonRequest(
  `/v1/carts/${encodeURIComponent(tradeCart.id)}/customer-details`,
  authenticated(trade.token, {
    email: trade.email,
    shipping_address: {
      first_name: "Staging",
      last_name: "Buyer",
      address_1: "1 Pilot Market Road",
      city: "Bengaluru",
      province: "Karnataka",
      postal_code: "560001",
      country_code: "IN",
      phone: "+919000000001",
    },
  }),
);
const shipping = await jsonRequest<{
  shipping_options: Array<{ id: string }>;
}>(`/v1/carts/${encodeURIComponent(tradeCart.id)}/shipping-options`, {
  headers: { authorization: `Bearer ${trade.token}` },
});
assert.ok(shipping.shipping_options.length > 0);
await jsonRequest(
  `/v1/carts/${encodeURIComponent(tradeCart.id)}/shipping-methods`,
  authenticated(trade.token, { option_id: shipping.shipping_options[0].id }),
);
const tradeShipping = await applyPromotion(trade, tradeCart.id, "TRADEVIP");
assert.ok(hasPromotion(tradeShipping, "TRADEVIP"));
assert.ok((tradeShipping.shipping_discount_total ?? 0) > 0);

const nonTradeCart = await createCart(nonTrade);
await addOffer(nonTrade, nonTradeCart.id, basinOffer);
await applyPromotion(nonTrade, nonTradeCart.id, "TRADE7", 422);

const toolsCart = await createCart(nonTrade);
await addOffer(nonTrade, toolsCart.id, pliersOffer);
const toolsDiscount = await applyPromotion(nonTrade, toolsCart.id, "TOOLS200");
assert.ok(hasPromotion(toolsDiscount, "TOOLS200"));
assert.ok((toolsDiscount.discount_total ?? 0) > 0);

const plywoodCart = await createCart(nonTrade);
const plywoodDiscount = await addOffer(nonTrade, plywoodCart.id, plywoodOffer);
assert.ok(hasPromotion(plywoodDiscount, "PLY5"));
assert.ok((plywoodDiscount.discount_total ?? 0) > 0);

console.log("promotion acceptance passed: TRADE7, TRADEVIP, non-trade rejection, TOOLS200, PLY5");
