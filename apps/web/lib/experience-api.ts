/**
 * Server-side client for the shared BuildKart Experience API.
 *
 * This web surface never re-implements commerce rules: it calls the same composed endpoints as the
 * Flutter app, then renders the authoritative result. It never manufactures transactional success.
 */

const baseUrl = process.env.EXPERIENCE_API_BASE_URL ?? "http://localhost:9020";

export interface OfferView {
  id: string;
  seller_id: string;
  seller_name?: string;
  sku: string;
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

export interface ProductDetail extends ComposedProduct {
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
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Experience API ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function listProducts(limit = 24): Promise<ComposedProduct[]> {
  const data = await call<{ products: ComposedProduct[] }>(`/v1/products?limit=${limit}`);
  return data.products ?? [];
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return call<ProductDetail>(`/v1/products/${encodeURIComponent(id)}`);
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
export async function completeCheckout(input: CheckoutInput): Promise<CompletionResult> {
  const cart = await call<{ id: string }>("/v1/carts", { method: "POST", body: JSON.stringify({}) });
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
    method: "POST",
    body: JSON.stringify({ offer_id: input.offerId, quantity: 1 }),
  });
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
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
  );
  const option = shipping.shipping_options[0];
  if (!option) throw new Error("no eligible shipping option for this cart");
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: option.id }),
  });
  return call<CompletionResult>(`/v1/checkouts/${encodeURIComponent(cart.id)}/complete`, {
    method: "POST",
  });
}
