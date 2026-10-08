import type { Config } from "../config.js";

/**
 * Minimal typed client for the Medusa/Mercur store API. It reads composed owner-service data and
 * delegates canonical cart mutations to Medusa/Mercur; the Experience API does not duplicate that
 * state locally.
 */

export interface StoreProduct {
  id: string;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  handle?: string | null;
  variants: { id: string; title?: string; sku?: string | null }[];
}

const PRODUCT_FIELDS =
  "id,title,thumbnail,description,handle,variants.id,variants.title,variants.sku";

export const SIMULATED_PAYMENT_PROVIDER_ID = "pp_simulated_simulated";

export interface StoreOffer {
  id: string;
  seller_id: string;
  variant_id: string;
  product_id: string;
  sku: string | null;
  seller: { id: string; name: string } | null;
  calculated_price: {
    calculated_amount: number | null;
    calculated_amount_with_tax: number | null;
    calculated_amount_without_tax: number | null;
    currency_code: string;
  } | null;
  inventory_quantity?: number;
  in_stock?: boolean;
}

export class MedusaStoreClient {
  constructor(private readonly config: Config) {}

  /**
   * Medusa's store API requires an explicit sales channel when the publishable key is linked to
   * more than one (we link B2C + B2B). Reads default to the B2C channel; cart creation passes the
   * caller's channel.
   */
  private channelHeaders(salesChannelId?: string): Record<string, string> {
    const id = salesChannelId ?? this.config.medusaB2cSalesChannelId;
    return id ? { "x-sales-channel-id": id } : {};
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        ...this.channelHeaders(),
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Medusa store request failed (${response.status}): ${url}`);
    }
    return (await response.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown, salesChannelId?: string): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        ...this.channelHeaders(salesChannelId),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Medusa store request failed (${response.status}): ${url} — ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  private async deleteJson<T>(path: string): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        ...this.channelHeaders(),
        accept: "application/json",
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Medusa store request failed (${response.status}): ${url} — ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  async getProduct(productId: string): Promise<StoreProduct> {
    const data = await this.getJson<{ product: StoreProduct }>(
      `/store/products/${encodeURIComponent(productId)}?fields=${PRODUCT_FIELDS}`,
    );
    return data.product;
  }

  async listOffers(productId: string): Promise<StoreOffer[]> {
    // The `+` prefix adds computed fields (calculated_price, inventory) to the default fields.
    const fields = "+calculated_price,+inventory_quantity,+in_stock";
    const params = new URLSearchParams({
      product_id: productId,
      region_id: this.config.medusaRegionId,
      country_code: this.config.medusaCountryCode,
      fields,
      limit: "50",
    });
    const data = await this.getJson<{ offers: StoreOffer[] }>(`/store/offers?${params.toString()}`);
    return data.offers;
  }

  /** Bulk offers for many products in a single request (removes the N+1 pattern). */
  async listOffersByProducts(productIds: string[]): Promise<StoreOffer[]> {
    if (!productIds.length) return [];
    const fields = "+calculated_price,+inventory_quantity,+in_stock";
    const params = new URLSearchParams();
    for (const id of productIds) {
      params.append("product_id[]", id);
    }
    params.set("region_id", this.config.medusaRegionId);
    params.set("country_code", this.config.medusaCountryCode);
    params.set("fields", fields);
    params.set("limit", String(Math.max(200, productIds.length * 50)));
    const data = await this.getJson<{ offers: StoreOffer[] }>(`/store/offers?${params.toString()}`);
    return data.offers;
  }

  async listProducts(limit = 50, offset = 0): Promise<StoreProduct[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields: PRODUCT_FIELDS,
    });
    const data = await this.getJson<{ products: StoreProduct[] }>(
      `/store/products?${params.toString()}`,
    );
    return data.products;
  }

  async createCart(
    regionId: string,
    currencyCode: string,
    salesChannelId?: string,
  ): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      "/store/carts",
      {
        region_id: regionId,
        currency_code: currencyCode,
        ...(salesChannelId ? { sales_channel_id: salesChannelId } : {}),
      },
      salesChannelId,
    );
    return data.cart;
  }

  async getCart(cartId: string): Promise<StoreCart> {
    const data = await this.getJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}`,
    );
    return data.cart;
  }

  async updateCartMetadata(
    cartId: string,
    metadata: Record<string, unknown>,
  ): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}`,
      { metadata },
    );
    return data.cart;
  }

  async updateCartCustomerDetails(
    cartId: string,
    input: {
      email: string;
      shipping_address: StoreAddress;
    },
  ): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}`,
      input,
    );
    return data.cart;
  }

  async addLineItem(cartId: string, offerId: string, quantity: number): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/line-items`,
      { offer_id: offerId, quantity },
    );
    return data.cart;
  }

  async updateLineItem(cartId: string, lineItemId: string, quantity: number): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineItemId)}`,
      { quantity },
    );
    return data.cart;
  }

  async removeLineItem(cartId: string, lineItemId: string): Promise<StoreCart> {
    const data = await this.deleteJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineItemId)}`,
    );
    return data.cart;
  }

  async createPaymentCollection(cartId: string): Promise<StorePaymentCollection> {
    const data = await this.postJson<{ payment_collection: StorePaymentCollection }>(
      "/store/payment-collections",
      { cart_id: cartId },
    );
    return data.payment_collection;
  }

  async listShippingOptions(cartId: string): Promise<StoreShippingOption[]> {
    const params = new URLSearchParams({ cart_id: cartId });
    const data = await this.getJson<{
      shipping_options: Record<string, Omit<StoreShippingOption, "seller_id">[]>;
    }>(`/store/shipping-options?${params.toString()}`);
    return Object.entries(data.shipping_options).flatMap(([sellerId, options]) =>
      options.map((option) => ({ ...option, seller_id: sellerId })),
    );
  }

  async addShippingMethod(cartId: string, optionId: string): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/shipping-methods`,
      { option_id: optionId },
    );
    return data.cart;
  }

  async createPaymentSession(
    paymentCollectionId: string,
    providerId: string,
  ): Promise<StorePaymentCollection> {
    const simulatedData = providerId === SIMULATED_PAYMENT_PROVIDER_ID
      ? { payment_mode: "simulated", test_data: true }
      : undefined;
    const data = await this.postJson<{ payment_collection: StorePaymentCollection }>(
      `/store/payment-collections/${encodeURIComponent(paymentCollectionId)}/payment-sessions`,
      {
        provider_id: providerId,
        ...(simulatedData ? { data: simulatedData } : {}),
      },
    );
    return data.payment_collection;
  }

  async completeCart(cartId: string): Promise<StoreCompleteResult> {
    return this.postJson<StoreCompleteResult>(
      `/store/carts/${encodeURIComponent(cartId)}/complete`,
      {},
    );
  }
}

export interface StorePaymentSession {
  id: string;
  provider_id: string;
  status: string;
  amount: number;
  data: {
    payment_mode?: string;
    test_data?: boolean;
    [key: string]: unknown;
  } | null;
}

export interface StoreAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  postal_code: string;
  country_code: string;
}

export interface StoreShippingOption {
  id: string;
  seller_id: string;
  name: string;
  amount: number;
  price_type: string;
  provider_id: string;
  type?: { label?: string; code?: string } | null;
}

export interface StorePaymentCollection {
  id: string;
  currency_code: string;
  amount: number;
  payment_sessions: StorePaymentSession[];
}

export interface StoreCompleteResult {
  type: "order_group" | "cart";
  order_group?: {
    id: string;
    customer_id: string;
    cart_id: string;
    seller_count: number;
    total: number;
  };
  cart?: { id: string; total: number };
  error?: { message: string; name: string; type: string };
}

export interface StoreCart {
  id: string;
  currency_code: string;
  region_id: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  shipping_total?: number;
  items: {
    id: string;
    title: string;
    product_title: string | null;
    quantity: number;
    unit_price: number;
    metadata: { offer_id?: string } | null;
  }[];
  subtotal: number;
  total: number;
}
