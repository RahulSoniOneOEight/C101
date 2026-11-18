/**
 * Server-side client for the shared BuildKart Experience API.
 *
 * This web surface never re-implements commerce rules: it calls the same composed endpoints as the
 * Flutter app, then renders the authoritative result. It never manufactures transactional success.
 */

const baseUrl = process.env.EXPERIENCE_API_BASE_URL ?? "http://localhost:9020";

export const PILOT_SESSION_COOKIE = "buildkart_pilot_session";
export const PILOT_CHALLENGE_COOKIE = "buildkart_pilot_challenge";
export const EMAIL_CHALLENGE_COOKIE = "bazarbee_email_challenge";
export const EMAIL_HINT_COOKIE = "bazarbee_email_hint";

export class ExperienceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problemType?: string,
  ) {
    super(message);
    this.name = "ExperienceApiError";
  }
}

export interface OfferView {
  id: string;
  seller_id: string;
  seller_name?: string;
  sku: string;
  variant_id?: string;
  currency_code: string;
  unit_amount_minor: number;
  list_amount_minor?: number;
  discount_percent?: number;
  inventory_quantity?: number;
  in_stock?: boolean;
  stock_badge?: string;
}

export interface ComposedProduct {
  id: string;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  handle?: string | null;
  best_price?: OfferView | null;
  offer_count?: number;
}

export interface VariantView {
  id: string;
  title?: string;
  sku?: string;
  best_price?: OfferView | null;
  in_stock?: boolean | null;
  offer_count?: number;
}

export interface ProductDetail extends ComposedProduct {
  variants?: VariantView[];
  commercial?: {
    selected_seller?: OfferView | null;
    payment_eligibility?: string[];
  };
  environment?: string;
  test_data?: boolean;
  freshness?: { source: string; observed_at: string; stale: boolean }[];
}

export interface CompletionResult {
  type: "order_group" | "cart";
  order_group?: { id: string; total?: number };
  order_number?: string | null;
  total_minor?: number | null;
  payment?: { payment_mode?: string; test_data?: boolean; provider_id?: string };
  environment?: string;
  test_data?: boolean;
  correlation_id?: string;
}

export function experienceApiBase(): string {
  return baseUrl;
}

/** Formats a minor-unit amount using the currency code (server-composed prices are authoritative). */
export { formatMoney } from "./money";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...(typeof init?.body === "string" ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Experience API request failed (${res.status}).`;
    let problemType: string | undefined;
    try {
      const problem = JSON.parse(text) as {
        detail?: unknown;
        title?: unknown;
        type?: unknown;
      };
      if (typeof problem.detail === "string" && problem.detail.trim()) {
        message = problem.detail.trim();
      } else if (typeof problem.title === "string" && problem.title.trim()) {
        message = problem.title.trim();
      }
      if (typeof problem.type === "string") problemType = problem.type;
    } catch {
      // Do not expose an upstream HTML/error body to the browser.
    }
    throw new ExperienceApiError(res.status, message, problemType);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

function authenticatedHeaders(sessionToken: string): HeadersInit {
  return { authorization: `Bearer ${sessionToken}` };
}

export interface PilotUserView {
  id: string;
  email: string;
  name: string;
}

export interface OtpChallengeResult {
  challenge_id: string;
  expires_in_seconds: number;
  test_data: true;
}

export interface OtpVerificationResult {
  session_token: string;
  expires_in_seconds: number;
  user: PilotUserView;
  test_data: true;
}

export async function requestOtpChallenge(identifier: string): Promise<OtpChallengeResult> {
  return call<OtpChallengeResult>("/v1/auth/otp/challenges", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function verifyOtpChallenge(
  challengeId: string,
  code: string,
): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
}

export interface EmailCodeChallengeResult {
  challenge_id: string;
  expires_in_seconds: number;
  test_data: true;
  /** Present only when the API has no email sender configured (staging preview). */
  preview_code?: string;
  environment?: string;
}

export interface MagicLinkResult {
  expires_in_seconds: number;
  test_data: true;
  /** Present only when the API has no email sender configured (staging preview). */
  preview_link?: string;
  environment?: string;
}

/** Requests a six-digit email sign-in code. The API decides whether the allowlisted user exists. */
export async function requestEmailCode(email: string): Promise<EmailCodeChallengeResult> {
  return call<EmailCodeChallengeResult>("/v1/auth/email/code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailCode(
  challengeId: string,
  code: string,
): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
}

/** Requests a single-use magic link delivered by email. */
export async function requestMagicLink(email: string): Promise<MagicLinkResult> {
  return call<MagicLinkResult>("/v1/auth/email/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicLink(token: string): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/email/magic/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function revokePilotSession(sessionToken: string): Promise<void> {
  await call<void>("/v1/auth/logout", {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
}

export interface CustomerOrderLine {
  line_key: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  variant_id: string | null;
  seller_id: string | null;
}

export interface CustomerOrderSummary {
  order_id: string;
  medusa_order_group_id: string | null;
  order_number: string | null;
  status: string;
  created_at: string;
  subtotal_minor: number | null;
  shipping_minor: number | null;
  discount_minor: number | null;
  total_minor: number | null;
  currency_code: string;
  payment_mode: string;
  test_data: true;
  lines: CustomerOrderLine[];
}

export interface CustomerShipment {
  id: string;
  trackingNumber: string;
  provider: string;
  status: string;
  deliveredAt: string | null;
  logisticsMode: "simulated";
  testData: true;
}

export interface CustomerReturnLine {
  id: string;
  lineKey: string;
  sku: string;
  requestedQty: number;
  approvedQty: number | null;
  receivedQty: number | null;
  condition: string | null;
  disposition: string | null;
  inspectionNote: string | null;
  inspectedAt: string | null;
}

export interface CustomerRefundSimulation {
  id: string;
  amountMinor: number;
  currencyCode: string;
  method: string;
  status: "simulated_pending" | "simulated_completed" | "simulated_failed";
  simulationReference: string;
  recordedAt: string;
  testData: true;
  simulated: true;
  moneyEffect: "none";
  stockEffect: "none";
}

export interface CustomerReturn {
  id: string;
  orderId: string;
  status: string;
  resolution: string;
  reasonCode: string;
  requestedAt: string;
  decisionComment: string | null;
  testData: true;
  lines: CustomerReturnLine[];
  evidence: CustomerReturnEvidence[];
  refundSimulation: CustomerRefundSimulation | null;
}

export interface CustomerReturnEvidence {
  id: string;
  lineKey: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  scanStatus: string;
  createdAt: string;
  url: string;
}

export interface StoredReturnEvidence {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface CustomerReturnEligibilityLine {
  line_key: string;
  sku: string;
  title: string;
  ordered_qty: number;
  delivered_qty: number;
  requested_qty: number;
  returnable_qty: number;
  deadline: string | null;
  allowed_reasons: string[];
  eligible: boolean;
  ineligible_reason: string | null;
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  reservation_status: string;
  reconciled: boolean;
  shipments: CustomerShipment[];
  returns: CustomerReturn[];
  return_eligibility: CustomerReturnEligibilityLine[];
  logistics_mode: "simulated";
}

export interface CreateReturnLineInput {
  lineKey: string;
  requestedQty: number;
  reasonCode: string;
}

export interface CreateReturnInput {
  idempotencyKey: string;
  resolution: "refund" | "replacement";
  reasonCode: string;
  comment?: string;
  lines: CreateReturnLineInput[];
  evidence?: StoredReturnEvidence[];
}

export interface NotificationView {
  id: string;
  template_key: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
  test_data: true;
}

export async function listMyNotifications(
  sessionToken: string,
  limit = 50,
): Promise<NotificationView[]> {
  const result = await call<{ notifications: NotificationView[] }>(
    `/v1/me/notifications?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.notifications ?? [];
}

export async function markNotificationRead(
  sessionToken: string,
  notificationId: string,
): Promise<void> {
  await call<void>(`/v1/me/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
}

export async function markAllNotificationsRead(sessionToken: string): Promise<number> {
  const result = await call<{ updated: number }>("/v1/me/notifications/read-all", {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
  return result.updated ?? 0;
}

export async function listMyOrders(
  sessionToken: string,
  limit = 50,
): Promise<CustomerOrderSummary[]> {
  const result = await call<{ items: CustomerOrderSummary[] }>(
    `/v1/me/orders?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.items ?? [];
}

export async function getMyOrder(
  sessionToken: string,
  orderId: string,
): Promise<CustomerOrderDetail> {
  return call<CustomerOrderDetail>(`/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: authenticatedHeaders(sessionToken),
  });
}

export async function getMyReturn(
  sessionToken: string,
  returnId: string,
): Promise<CustomerReturn> {
  const result = await call<{ return: CustomerReturn }>(
    `/v1/returns/${encodeURIComponent(returnId)}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.return;
}

/** Owner-scoped list of the signed-in customer's return requests. */
export async function listMyReturns(
  sessionToken: string,
  limit = 50,
): Promise<CustomerReturn[]> {
  const result = await call<{ items: CustomerReturn[] }>(
    `/v1/me/returns?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.items ?? [];
}

/**
 * Owner-scoped return request. Eligibility, allowed reasons and returnable quantities are
 * server-computed; this client only forwards the customer's choice and the idempotency key.
 */
export async function createMyReturn(
  sessionToken: string,
  orderId: string,
  input: CreateReturnInput,
): Promise<CustomerReturn> {
  const result = await call<{ return: CustomerReturn }>(
    `/v1/orders/${encodeURIComponent(orderId)}/returns`,
    {
      method: "POST",
      headers: {
        ...authenticatedHeaders(sessionToken),
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        resolution: input.resolution,
        reason_code: input.reasonCode,
        customer_comment: input.comment?.trim() ? input.comment.trim() : undefined,
        lines: input.lines.map((line) => ({
          line_key: line.lineKey,
          requested_qty: line.requestedQty,
          reason_code: line.reasonCode,
        })),
        evidence: input.evidence?.length
          ? input.evidence.map((item) => ({
              object_key: item.objectKey,
              content_type: item.contentType,
              size_bytes: item.sizeBytes,
              sha256: item.sha256,
            }))
          : undefined,
      }),
    },
  );
  return result.return;
}

/** Owner-scoped evidence upload. The API validates type, size and ownership. */
export async function uploadReturnEvidence(
  sessionToken: string,
  orderId: string,
  file: Blob,
  filename: string,
): Promise<StoredReturnEvidence> {
  const form = new FormData();
  form.append("file", file, filename);
  const result = await call<{ evidence: StoredReturnEvidence }>(
    `/v1/orders/${encodeURIComponent(orderId)}/evidence`,
    {
      method: "POST",
      headers: authenticatedHeaders(sessionToken),
      body: form,
    },
  );
  return result.evidence;
}

export async function listProducts(limit = 24): Promise<ComposedProduct[]> {
  const data = await call<{ products: ComposedProduct[] }>(`/v1/products?limit=${limit}`);
  return data.products ?? [];
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return call<ProductDetail>(`/v1/products/${encodeURIComponent(id)}`);
}

export interface PairedProduct extends ComposedProduct {
  best_price?: OfferView | null;
  offer_count?: number;
}

/**
 * Resolves the variant the page is showing and the offer for it.
 *
 * The detail endpoint leaves the top-level `best_price` empty and puts the priced offer on
 * `commercial.selected_seller`, while each `variants[].best_price` carries its own offer id and
 * variant id. An explicit `?sku=` always wins, so a price shown is always the price of the variant
 * being quoted - no silent "first variant" choice when one was requested.
 */
export function resolveVariant(
  product: ProductDetail,
  requestedSku?: string | null,
): { variant: VariantView | null; offer: OfferView | null } {
  const variants = product.variants ?? [];
  const fallbackOffer = product.best_price ?? product.commercial?.selected_seller ?? null;
  const requested = requestedSku ? variants.find((variant) => variant.sku === requestedSku) : undefined;
  const variant =
    requested ??
    variants.find((candidate) => candidate.id === fallbackOffer?.variant_id) ??
    variants.find((candidate) => Boolean(candidate.best_price?.id)) ??
    variants[0] ??
    null;
  const offer =
    variant?.best_price ??
    (fallbackOffer && (!variant || variant.id === fallbackOffer.variant_id) ? fallbackOffer : null);
  return { variant, offer };
}

export interface BoughtTogetherResult {
  pair_id: string | null;
  channel?: string;
  paired_availability?: "in_stock" | "out_of_stock";
  paired?: PairedProduct | null;
}

/**
 * Bought together is SKU-scoped: the Experience API only returns a pair when the selected SKU is
 * the one that was paired. Progressive enhancement - any failure returns null and the page renders
 * without the section, exactly as it does when no pair exists.
 */
export async function getBoughtTogether(
  productId: string,
  sku: string | null | undefined,
  channel: "b2c" | "b2b" = "b2c",
): Promise<BoughtTogetherResult | null> {
  const query = new URLSearchParams({ channel });
  if (sku) query.set("sku", sku);
  try {
    const data = await call<BoughtTogetherResult>(
      `/v1/products/${encodeURIComponent(productId)}/bought-together?${query.toString()}`,
    );
    return data?.pair_id ? data : null;
  } catch {
    return null;
  }
}

export interface CheckoutLineInput {
  offerId: string;
  quantity: number;
}

export interface CheckoutInput {
  lines: CheckoutLineInput[];
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
}

/**
 * Performs the canonical checkout server-side against the shared Experience API. Success is the
 * server's canonical order group; the client cannot fabricate it.
 */
export interface CartQuote {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  itemCount: number;
}

interface CartView {
  items?: unknown[];
  subtotal?: number;
  item_subtotal?: number;
  shipping_total?: number;
  discount_total?: number;
  total?: number;
  currency_code?: string;
}

/**
 * Quotes a basket without completing it. The cart API is owner-scoped, so this requires the
 * signed-in session. Delivery is resolved for the entered postal code so the customer sees the
 * same subtotal, shipping, automatic discount and total that completion will produce.
 *
 * Staging note: this creates a short-lived Medusa cart per quote. A production build should reuse
 * the checkout cart instead of creating a quote cart.
 */
export async function quoteCart(
  input: { lines: CheckoutLineInput[]; postalCode: string; email: string },
  sessionToken: string,
): Promise<CartQuote> {
  if (input.lines.length === 0) throw new Error("The cart is empty.");
  const auth = authenticatedHeaders(sessionToken);
  const cart = await call<{ id: string }>("/v1/carts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  });
  for (const line of input.lines) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ offer_id: line.offerId, quantity: line.quantity }),
    });
  }
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email: input.email,
      shipping_address: {
        first_name: "Quote",
        last_name: "Buyer",
        address_1: "Quote address",
        city: "Jaipur",
        postal_code: /^\d{6}$/.test(input.postalCode) ? input.postalCode : "302001",
        country_code: "IN",
      },
    }),
  });
  const delivery = await call<{ unavailable?: unknown[] }>(
    `/v1/carts/${encodeURIComponent(cart.id)}/delivery-tier`,
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tier: "standard" }),
    },
  );
  if (delivery.unavailable?.length) {
    throw new Error("Standard delivery is not available for this postal code.");
  }
  const view = await call<CartView>(`/v1/carts/${encodeURIComponent(cart.id)}`, {
    headers: auth,
  });
  const subtotal = view.item_subtotal ?? view.subtotal ?? 0;
  return {
    subtotal,
    shipping: view.shipping_total ?? 0,
    discount: view.discount_total ?? 0,
    total: view.total ?? subtotal,
    currency: (view.currency_code ?? "inr").toUpperCase(),
    itemCount: Array.isArray(view.items) ? view.items.length : input.lines.length,
  };
}

export async function completeCheckout(
  input: CheckoutInput,
  sessionToken: string,
): Promise<CompletionResult> {
  const auth = authenticatedHeaders(sessionToken);
  if (input.lines.length === 0) throw new Error("The cart is empty.");
  const cart = await call<{ id: string }>("/v1/carts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  });
  for (const line of input.lines) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ offer_id: line.offerId, quantity: line.quantity }),
    });
  }
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email: input.email,
      shipping_address: {
        first_name: input.firstName,
        last_name: input.lastName,
        address_1: input.address1,
        city: input.city,
        postal_code: input.postalCode,
        country_code: "IN",
      },
    }),
  });
  // One cart-level delivery choice resolves a shipping method for every seller group, so a
  // multi-seller basket cannot be left with a partial selection.
  const delivery = await call<{
    unavailable?: { seller_id: string | null; reason: string }[];
  }>(`/v1/carts/${encodeURIComponent(cart.id)}/delivery-tier`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ tier: "standard" }),
  });
  if (delivery.unavailable?.length) {
    throw new Error("Standard delivery is not available for every seller in this cart.");
  }
  return call<CompletionResult>(`/v1/checkouts/${encodeURIComponent(cart.id)}/complete`, {
    method: "POST",
    headers: auth,
  });
}
