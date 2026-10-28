/**
 * Server-side client for the shared BuildKart Experience API.
 *
 * This web surface never re-implements commerce rules: it calls the same composed endpoints as the
 * Flutter app, then renders the authoritative result. It never manufactures transactional success.
 */

const baseUrl = process.env.EXPERIENCE_API_BASE_URL ?? "http://localhost:9020";

export const PILOT_SESSION_COOKIE = "buildkart_pilot_session";
export const PILOT_CHALLENGE_COOKIE = "buildkart_pilot_challenge";

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
  payment?: { payment_mode?: string; test_data?: boolean; provider_id?: string };
  environment?: string;
  test_data?: boolean;
  correlation_id?: string;
}

export function experienceApiBase(): string {
  return baseUrl;
}

/** Formats a minor-unit amount using the currency code (server-composed prices are authoritative). */
export function formatMoney(amountMinor: number, currencyCode: string): string {
  const major = amountMinor / 100;
  const text = Number.isInteger(major) ? major.toString() : major.toFixed(2);
  switch (currencyCode.toUpperCase()) {
    case "INR":
      return `₹${text}`;
    case "USD":
      return `$${text}`;
    default:
      return `${currencyCode.toUpperCase()} ${text}`;
  }
}

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

export interface CheckoutInput {
  offerId: string;
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
export async function completeCheckout(
  input: CheckoutInput,
  sessionToken: string,
): Promise<CompletionResult> {
  const auth = authenticatedHeaders(sessionToken);
  const cart = await call<{ id: string }>("/v1/carts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  });
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ offer_id: input.offerId, quantity: 1 }),
  });
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
  const shipping = await call<{ shipping_options: { id: string }[] }>(
    `/v1/carts/${encodeURIComponent(cart.id)}/shipping-options`,
    { headers: auth },
  );
  const option = shipping.shipping_options[0];
  if (!option) throw new Error("no eligible shipping option for this cart");
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ option_id: option.id }),
  });
  return call<CompletionResult>(`/v1/checkouts/${encodeURIComponent(cart.id)}/complete`, {
    method: "POST",
    headers: auth,
  });
}
