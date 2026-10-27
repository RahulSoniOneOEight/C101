/**
 * U-003 — promo-code QC (B002).
 *
 * Runtime proof for R1-R10 against a deployed staging Experience API. Every money assertion is an
 * exact minor-unit amount, not "> 0": the TOOLS200 INR-2 defect passed the old test.
 *
 * Run after the human deploy gate and after `configure:staging-merchandising`:
 *   EXPERIENCE_BASE_URL=https://<staging> bun run src/scripts/promo-code-qc.ts
 *
 * Test data: one B2C cart, one B2B cart and one simulated order. No real money, no stock.
 */
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

interface PromotionView {
  code: string;
  label?: string;
  is_automatic?: boolean;
}

interface CartItem {
  id: string;
  unit_price: number;
  quantity: number;
}

interface Cart {
  id: string;
  customer_id?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  items?: CartItem[];
  item_subtotal?: number;
  discount_total?: number;
  shipping_total?: number;
  shipping_discount_total?: number;
  total?: number;
  promotions?: PromotionView[];
  auto_offer?: { code: string; label?: string; removable?: boolean } | null;
}

interface CompletedOrder {
  type: "order_group" | "cart";
  order_group?: { id: string; cart_id: string; total: number };
  payment?: {
    payment_mode?: string;
    test_data?: boolean;
    provider_id?: string;
  };
  error?: { message?: string };
}

interface OrderRead {
  order_id: string;
  status: string;
  payment_mode: string;
  test_data: boolean;
  reservation_status: string;
  reconciled: boolean;
}

const ledger: Array<{ id: string; status: "PASS" | "FAIL"; detail: string }> = [];

/** Medusa computes percentage discounts as decimals; compare to the exact minor-unit value. */
const AMOUNT_TOLERANCE = 1e-6;
/** Let Medusa's promotion workflow settle between user-style actions (not a bulk API loop). */
const SETTLE_MS = Number(process.env.U003_QC_SETTLE_MS ?? 1200);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function inr(minor: number | null | undefined): string {
  return `INR ${((minor ?? 0) / 100).toFixed(2)}`;
}

function percentOf(subtotal: number, percent: number): number {
  return (subtotal * percent) / 100;
}

function amountsEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < AMOUNT_TOLERANCE;
}

function subtotalOf(cart: Cart): number {
  if (typeof cart.item_subtotal === "number" && cart.item_subtotal >= 0) return cart.item_subtotal;
  return (cart.items ?? []).reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  );
}

function hasPromotion(cart: Cart, code: string): boolean {
  return Boolean(cart.promotions?.some((promotion) => promotion.code === code));
}

function promotionOf(cart: Cart, code: string): PromotionView | undefined {
  return cart.promotions?.find((promotion) => promotion.code === code);
}

function assertSingleOffer(cart: Cart, code: string, label: string): void {
  assert.equal(
    cart.promotions?.length ?? 0,
    1,
    `${label}: expected exactly one offer, got ${JSON.stringify(cart.promotions)}`,
  );
  assert.ok(hasPromotion(cart, code), `${label}: expected ${code}, got ${JSON.stringify(cart.promotions)}`);
}

/** Exact percentage assertion in minor units; also pins the discount-rate ceiling. */
function assertDiscount(cart: Cart, percent: number, label: string): string {
  const subtotal = subtotalOf(cart);
  const expected = percentOf(subtotal, percent);
  const actual = cart.discount_total ?? 0;
  assert.ok(
    amountsEqual(actual, expected),
    `${label}: expected ${percent}% of ${inr(subtotal)} = ${inr(expected)}, got ${inr(actual)}`,
  );
  const rate = subtotal === 0 ? 0 : (actual * 100) / subtotal;
  assert.ok(
    rate <= 10 + AMOUNT_TOLERANCE,
    `${label}: discount rate ${rate.toFixed(2)}% exceeds the 10% ceiling`,
  );
  return `${percent}% of ${inr(subtotal)} = ${inr(actual)}`;
}

async function jsonRequest<T>(
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${path}: ${response.status} ${text}`);
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

function authenticated(token: string, body?: unknown, method = "POST"): RequestInit {
  return {
    method,
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

async function getCart(actor: Session, cartId: string): Promise<Cart> {
  return jsonRequest<Cart>(`/v1/carts/${encodeURIComponent(cartId)}`, {
    headers: { authorization: `Bearer ${actor.token}` },
  });
}

/**
 * Wait for the promotion workflow to settle, then read the cart. The storefront blocks while an
 * apply/remove is in flight; the QC must not fire the next mutation before Medusa has recalculated.
 */
async function settle(actor: Session, cartId: string): Promise<Cart> {
  await sleep(SETTLE_MS);
  return getCart(actor, cartId);
}

async function addOffer(actor: Session, cartId: string, offerId: string, quantity = 1): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/lines`,
    authenticated(actor.token, { offer_id: offerId, quantity }),
  );
}

async function updateQuantity(actor: Session, cartId: string, lineId: string, quantity: number): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
    authenticated(actor.token, { quantity }),
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

async function removePromotion(
  actor: Session,
  cartId: string,
  code: string,
  expectedStatus = 200,
): Promise<Cart> {
  return jsonRequest<Cart>(
    `/v1/carts/${encodeURIComponent(cartId)}/promotions`,
    authenticated(actor.token, { code }, "DELETE"),
    expectedStatus,
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
    shipping_options: Array<{ id: string; seller_id: string }>;
  }>(
    `/v1/carts/${encodeURIComponent(cartId)}/shipping-options`,
    { headers: { authorization: `Bearer ${actor.token}` } },
  );
  assert.ok(shipping.shipping_options.length > 0, "cart must resolve a seller shipping option");
  // One delivery selection per seller; a multi-seller cart needs one method for each.
  const optionBySeller = new Map<string, { id: string; seller_id: string }>();
  for (const option of shipping.shipping_options) {
    if (!optionBySeller.has(option.seller_id)) optionBySeller.set(option.seller_id, option);
  }
  let cart: Cart | null = null;
  for (const option of optionBySeller.values()) {
    cart = await jsonRequest<Cart>(
      `/v1/carts/${encodeURIComponent(cartId)}/shipping-methods`,
      authenticated(actor.token, { option_id: option.id }),
    );
  }
  assert.ok(cart, "shipping method selection must return the cart");
  return cart;
}

async function completeCheckout(actor: Session, cartId: string): Promise<CompletedOrder> {
  return jsonRequest<CompletedOrder>(
    `/v1/checkouts/${encodeURIComponent(cartId)}/complete`,
    authenticated(actor.token),
  );
}

async function readOrder(actor: Session, cartId: string): Promise<OrderRead> {
  return jsonRequest<OrderRead>(`/v1/orders/${encodeURIComponent(cartId)}`, {
    headers: { authorization: `Bearer ${actor.token}` },
  });
}

function offerFor(
  products: Product[],
  predicate: (product: Product) => boolean,
  label: string,
): { id: string; sellingAmount: number; category: string } {
  const product = products.find((candidate) => {
    const amount = candidate.best_price?.selling_amount_minor ?? candidate.best_price?.unit_amount_minor;
    return Boolean(candidate.best_price?.id) && typeof amount === "number" && predicate(candidate);
  });
  assert.ok(product?.best_price?.id, `no live offer found for ${label}`);
  const sellingAmount = product.best_price.selling_amount_minor ?? product.best_price.unit_amount_minor;
  assert.ok(typeof sellingAmount === "number", `no selling amount found for ${label}`);
  return {
    id: product.best_price.id,
    sellingAmount,
    category: product.categories?.map((category) => category.name).join(", ") ?? label,
  };
}

/** The catalogue is paginated; read enough pages to find two distinct categories. */
async function loadCatalogue(actor: Session): Promise<Product[]> {
  const products: Product[] = [];
  for (let offset = 0; offset < 1500; offset += 250) {
    const page = await jsonRequest<{ products: Product[] }>(
      `/v1/products?limit=250&offset=${offset}`,
      { headers: { authorization: `Bearer ${actor.token}` } },
    );
    products.push(...page.products);
    if (page.products.length < 250) break;
  }
  return products;
}

async function requirement(id: string, label: string, run: () => Promise<string>): Promise<boolean> {
  try {
    const detail = await run();
    ledger.push({ id, status: "PASS", detail: `${label} — ${detail}` });
    console.log(`[${id}] PASS ${label} — ${detail}`);
    return true;
  } catch (error) {
    const detail = `${label} — ${(error as Error).message}`;
    ledger.push({ id, status: "FAIL", detail });
    console.error(`[${id}] FAIL ${detail}`);
    return false;
  }
}

const [trade, nonTrade] = await Promise.all([
  session(tradeIdentifier),
  session(nonTradeIdentifier),
]);
const products = await loadCatalogue(trade);
const plywoodOffer = offerFor(
  products,
  (product) => product.categories?.some((category) => category.name === "Plywood & Boards") === true,
  "Plywood & Boards",
);
const otherOffer = offerFor(
  products,
  (product) => product.categories?.some((category) => category.name !== "Plywood & Boards") === true,
  "a second category",
);
console.log(
  `U-003 QC against ${baseUrl}: offer A ${otherOffer.id} (${otherOffer.category}, ` +
    `${inr(otherOffer.sellingAmount)}), offer B ${plywoodOffer.id} (${plywoodOffer.category}, ` +
    `${inr(plywoodOffer.sellingAmount)})`,
);

// --- B2C cart ---------------------------------------------------------------------------------
let b2cCart = await createCart(nonTrade, "b2c_app");
const b2cFirstLine = await addOffer(nonTrade, b2cCart.id, otherOffer.id);
b2cCart = b2cFirstLine;

/** R4 — Flat5% arrives on the first line with no user action and carries the automatic marker. */
await requirement("R4", "new cart receives Flat5% automatically", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  assert.ok(b2cCart.customer_id, "cart must be canonical");
  assertSingleOffer(b2cCart, "FLAT5", "first line");
  const flat5 = promotionOf(b2cCart, "FLAT5");
  assert.equal(flat5?.is_automatic, true, "FLAT5 must carry the automatic marker");
  assert.equal(flat5?.label, "Flat5%", "the UI label must be Flat5% (D5)");
  assert.equal(b2cCart.auto_offer?.code, "FLAT5", "cart view must expose the store-applied offer");
  assert.equal(b2cCart.auto_offer?.removable, true, "the store-applied offer must be removable");
  const detail = assertDiscount(b2cCart, 5, "Flat5%");
  return `${detail}; marker is_automatic=true; cart ${b2cCart.id}`;
});

/** R1 — one store-wide 5% offer across two different categories (no category/sales-channel rule). */
await requirement("R1", "FLAT5 is a store-wide 5% order offer", async () => {
  assert.ok(otherOffer.sellingAmount > 0 && plywoodOffer.sellingAmount > 0, "offers must be priced");
  b2cCart = await settle(nonTrade, b2cCart.id);
  b2cCart = await addOffer(nonTrade, b2cCart.id, plywoodOffer.id);
  assertSingleOffer(b2cCart, "FLAT5", "two categories");
  const detail = assertDiscount(b2cCart, 5, "Flat5% across two categories");
  return `${detail}; ${otherOffer.category} + ${plywoodOffer.category}; code-based (no category, group or channel rule)`;
});

/** R2 - PLY5 is retired: absent from a new plywood cart and rejected when typed. */
await requirement("R2", "PLY5 is inactive and cannot be applied", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  assert.ok(!hasPromotion(b2cCart, "PLY5"), "PLY5 must not auto-apply after retirement");
  assertSingleOffer(b2cCart, "FLAT5", "plywood line");
  await applyPromotion(nonTrade, b2cCart.id, "PLY5", 422);
  const restored = await settle(nonTrade, b2cCart.id);
  assertSingleOffer(restored, "FLAT5", "offer kept after the PLY5 rejection");
  b2cCart = restored;
  return "no PLY5 on a new plywood cart; applying PLY5 is rejected (422); Flat5% kept";
});

/** R5 - removal is honoured and sticky across re-fetch, quantity change and address/shipping. */
await requirement("R5", "Flat5% is removable and stays removed", async () => {
  const before = await settle(nonTrade, b2cCart.id);
  const afterRemove = await removePromotion(nonTrade, b2cCart.id, "FLAT5");
  assert.equal(afterRemove.discount_total ?? 0, 0, "removal must leave a zero discount");
  assert.ok(!hasPromotion(afterRemove, "FLAT5"), "removal must drop the code");
  const rise = (afterRemove.total ?? 0) - (before.total ?? 0);
  assert.ok(
    amountsEqual(rise, before.discount_total ?? 0),
    `total must rise by the discount ${inr(before.discount_total)}, rose ${inr(rise)}`,
  );

  const refetched = await settle(nonTrade, b2cCart.id);
  assert.equal(refetched.discount_total ?? 0, 0, "the offer must not return on re-fetch");

  const line = refetched.items?.[0];
  assert.ok(line, "cart must still have a line");
  const requantified = await updateQuantity(nonTrade, b2cCart.id, line.id, line.quantity + 1);
  assert.equal(requantified.discount_total ?? 0, 0, "the offer must not return on quantity change");

  const addressed = await addAddressAndShipping(nonTrade, b2cCart.id);
  assert.equal(addressed.discount_total ?? 0, 0, "the offer must not return on address/shipping update");
  b2cCart = await settle(nonTrade, b2cCart.id);

  return `discount ${inr(before.discount_total)} released; 0% after re-fetch, quantity change and address/shipping`;
});

/** R3 - ORDER10 exists, is code-based and grants exactly 10% (config read in evidence). */
await requirement("R3", "ORDER10 is a code-based 10% offer", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const order10 = await applyPromotion(nonTrade, b2cCart.id, "ORDER10");
  assertSingleOffer(order10, "ORDER10", "ORDER10");
  assert.equal(promotionOf(order10, "ORDER10")?.label, "ORDER10", "ORDER10 label");
  const detail = assertDiscount(order10, 10, "ORDER10");
  await sleep(SETTLE_MS);
  const cleared = await removePromotion(nonTrade, b2cCart.id, "ORDER10");
  assert.equal(cleared.discount_total ?? 0, 0, "control cleanup must return to 0%");
  b2cCart = await settle(nonTrade, b2cCart.id);
  return `${detail}; applied only by code; usage limit recorded in the configure output`;
});

/** R6 - ORDER10 applied after removal is exactly 10% and Flat5% is absent. */
await requirement("R6", "ORDER10 applies at exactly 10% after removal", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const order10 = await applyPromotion(nonTrade, b2cCart.id, "ORDER10");
  assertSingleOffer(order10, "ORDER10", "ORDER10 after removal");
  assert.ok(!hasPromotion(order10, "FLAT5"), "Flat5% must be absent");
  const detail = assertDiscount(order10, 10, "ORDER10 after removal");
  b2cCart = order10;
  return `${detail}; Flat5% absent; single offer (no 15% cart)`;
});

/** R7 - ORDER10 -> ORDER5 -> ORDER10 replaces, never stacks. */
await requirement("R7", "a code replaces the current offer", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const order5 = await applyPromotion(nonTrade, b2cCart.id, "ORDER5");
  assertSingleOffer(order5, "ORDER5", "ORDER5");
  assert.ok(!hasPromotion(order5, "ORDER10"), "ORDER10 must be gone");
  const fiveDetail = assertDiscount(order5, 5, "ORDER5");

  b2cCart = await settle(nonTrade, b2cCart.id);
  const backToTen = await applyPromotion(nonTrade, b2cCart.id, "ORDER10");
  assertSingleOffer(backToTen, "ORDER10", "ORDER10 again");
  assert.ok(!hasPromotion(backToTen, "ORDER5"), "ORDER5 must be gone");
  const tenDetail = assertDiscount(backToTen, 10, "ORDER10 again");
  b2cCart = backToTen;
  return `${fiveDetail}; then ${tenDetail}; one offer each time`;
});

/** R8 - removing the active code leaves 0% (the B2B cart below proves a new cart re-applies). */
await requirement("R8", "removing the active code leaves 0%", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const cleared = await removePromotion(nonTrade, b2cCart.id, "ORDER10");
  assert.equal(cleared.discount_total ?? 0, 0, "removal must leave 0%");
  assert.equal(cleared.promotions?.length ?? 0, 0, "no offer may remain");
  const refetched = await settle(nonTrade, b2cCart.id);
  assert.equal(refetched.discount_total ?? 0, 0, "0% must persist after re-fetch");
  b2cCart = refetched;
  return "0% after removal and after re-fetch";
});

/** R9 (non-trade half) - a non-trade buyer still cannot use TRADE7; the current offer is kept. */
await requirement("R9", "non-trade buyers still cannot use trade codes", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const rejected = await jsonRequest<{ rejected_codes?: Array<{ code: string; reason: string }> }>(
    `/v1/carts/${encodeURIComponent(b2cCart.id)}/promotions`,
    authenticated(nonTrade.token, { code: "TRADE7" }),
    422,
  );
  assert.equal(rejected.rejected_codes?.[0]?.code, "TRADE7", "TRADE7 must be rejected for non-trade");
  const restored = await settle(nonTrade, b2cCart.id);
  assert.equal(restored.discount_total ?? 0, 0, "the rejected code must not grant a discount");
  b2cCart = restored;
  return "TRADE7 rejected (422) for the non-trade actor; cart stayed at 0%";
});

/** R8 (second half) - a brand-new B2B cart auto-applies Flat5% again. */
let b2bCart: Cart | null = null;
await requirement("R8b", "a new cart auto-applies Flat5% again", async () => {
  b2bCart = await createCart(trade, "b2b_app");
  b2bCart = await addOffer(trade, b2bCart.id, otherOffer.id);
  assertSingleOffer(b2bCart, "FLAT5", "fresh B2B cart");
  const detail = assertDiscount(b2bCart, 5, "fresh B2B cart Flat5%");
  return `${detail}; cart ${b2bCart.id}`;
});

/** R9 (B2B half) - Flat5% applies, then TRADE7 replaces it with 7% on the targeted line. */
await requirement("R9b", "TRADE7 replaces Flat5% for a B2B trade buyer", async () => {
  assert.ok(b2bCart, "a B2B cart is required");
  b2bCart = await settle(trade, b2bCart.id);
  const trade7 = await applyPromotion(trade, b2bCart.id, "TRADE7");
  assertSingleOffer(trade7, "TRADE7", "TRADE7 on B2B");
  assert.ok(!hasPromotion(trade7, "FLAT5"), "TRADE7 must replace Flat5%");
  const tradeSubtotal = subtotalOf(trade7);
  assert.ok(
    amountsEqual(trade7.discount_total ?? 0, percentOf(tradeSubtotal, 7)),
    `TRADE7 must be exactly 7% of ${inr(tradeSubtotal)}, got ${inr(trade7.discount_total)}`,
  );
  b2bCart = trade7;
  return `Flat5% replaced; TRADE7 ${inr(trade7.discount_total)} (7% of ${inr(tradeSubtotal)})`;
});

/** R10 - one simulated checkout with ORDER10 records the discount; no money and no stock effect. */
await requirement("R10", "a simulated checkout records the 10% discount", async () => {
  b2cCart = await settle(nonTrade, b2cCart.id);
  const priced = await applyPromotion(nonTrade, b2cCart.id, "ORDER10");
  assertSingleOffer(priced, "ORDER10", "pre-checkout");
  assertDiscount(priced, 10, "pre-checkout ORDER10");
  const expectedTotal =
    subtotalOf(priced) - (priced.discount_total ?? 0) + (priced.shipping_total ?? 0);
  assert.ok(
    amountsEqual(priced.total ?? 0, expectedTotal),
    `cart total ${inr(priced.total)} must equal items - 10% + shipping (${inr(expectedTotal)})`,
  );

  await sleep(SETTLE_MS);
  const completed = await completeCheckout(nonTrade, priced.id);
  assert.equal(completed.type, "order_group", `checkout failed: ${JSON.stringify(completed)}`);
  assert.ok(completed.order_group?.id, "order group must be recorded");
  assert.ok(
    amountsEqual(completed.order_group?.total ?? 0, priced.total ?? 0),
    `order total ${inr(completed.order_group?.total)} must equal the discounted cart total ${inr(priced.total)}`,
  );
  assert.equal(completed.payment?.payment_mode, "simulated", "payment must be simulated");
  assert.equal(completed.payment?.test_data, true, "payment must be marked test data");

  const order = await readOrder(nonTrade, priced.id);
  assert.equal(order.status, "confirmed", "order must be confirmed");
  assert.equal(order.payment_mode, "simulated", "order payment mode must be simulated");
  assert.equal(
    order.reservation_status,
    "not_started",
    "a simulated checkout must not create a stock reservation",
  );

  return (
    `order ${completed.order_group?.id} total ${inr(completed.order_group?.total)} ` +
    `(items ${inr(subtotalOf(priced))} - 10% ${inr(priced.discount_total)} + shipping ` +
    `${inr(priced.shipping_total)}); reservation not_started; cart ${priced.id}`
  );
});

// --- summary ----------------------------------------------------------------------------------
const failed = ledger.filter((entry) => entry.status === "FAIL");
console.log("\nU-003 QC summary");
for (const entry of ledger) {
  console.log(`  ${entry.id.padEnd(4)} ${entry.status.padEnd(4)} ${entry.detail}`);
}

if (failed.length) {
  throw new Error(`${failed.length} of ${ledger.length} QC checks failed: ${failed.map((f) => f.id).join(", ")}`);
}
console.log(`\nU-003 QC PASS (${ledger.length} checks, exact minor-unit amounts).`);
