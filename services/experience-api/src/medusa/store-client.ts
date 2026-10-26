import type { Config } from "../config.js";

/**
 * Minimal typed client for the Medusa/Mercur store API. It reads composed owner-service data and
 * delegates canonical cart mutations to Medusa/Mercur; the Experience API does not duplicate that
 * state locally.
 */

export interface StoreProductVariant {
  id: string;
  title?: string;
  sku?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StoreProductCategoryLink {
  id: string;
  name: string;
  parent_category_id?: string | null;
}

export interface StoreProduct {
  id: string;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  handle?: string | null;
  /** Product traceability metadata, including `catalogue_import` and `brand`. */
  metadata?: Record<string, unknown> | null;
  categories?: StoreProductCategoryLink[] | null;
  tags?: { id: string; value: string }[] | null;
  variants: StoreProductVariant[];
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "thumbnail",
  "description",
  "handle",
  "metadata",
  "categories.id",
  "categories.name",
  "categories.parent_category_id",
  "tags.id",
  "tags.value",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.metadata",
].join(",");

export interface StoreProductCategory {
  id: string;
  name: string;
  handle?: string | null;
  parent_category_id?: string | null;
  rank?: number | null;
  is_active?: boolean | null;
  is_internal?: boolean | null;
}

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
    original_amount?: number | null;
    price_list_type?: string | null;
    calculated_amount_with_tax: number | null;
    calculated_amount_without_tax: number | null;
    currency_code: string;
  } | null;
  inventory_quantity?: number;
  in_stock?: boolean;
  /** Offer traceability, including the staging list price and discount. */
  metadata?: Record<string, unknown> | null;
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

  private async getJson<T>(path: string, salesChannelId?: string): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        ...this.channelHeaders(salesChannelId),
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

  private async deleteJson<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        ...this.channelHeaders(),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Medusa store request failed (${response.status}): ${url} — ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  async getProduct(productId: string, salesChannelId?: string): Promise<StoreProduct> {
    const data = await this.getJson<{ product: StoreProduct }>(
      `/store/products/${encodeURIComponent(productId)}?fields=${PRODUCT_FIELDS}`,
      salesChannelId,
    );
    return data.product;
  }

  async listOffers(productId: string, regionId = this.config.medusaRegionId): Promise<StoreOffer[]> {
    // The `+` prefix adds computed fields (calculated_price, inventory) to the default fields.
    // `+` keeps Medusa's default offer fields (id, product_id, variant_id, seller...) and adds the
    // computed/metadata fields. A bare `metadata` would replace the selection and break grouping.
    const fields = "+metadata,+calculated_price,+inventory_quantity,+in_stock";
    const params = new URLSearchParams({
      product_id: productId,
      region_id: regionId,
      country_code: this.config.medusaCountryCode,
      fields,
      limit: "50",
    });
    const data = await this.getJson<{ offers: StoreOffer[] }>(`/store/offers?${params.toString()}`);
    return data.offers;
  }

  /** Bulk offers for many products in a single request (removes the N+1 pattern). */
  async listOffersByProducts(
    productIds: string[],
    regionId = this.config.medusaRegionId,
    salesChannelId?: string,
  ): Promise<StoreOffer[]> {
    if (!productIds.length) return [];
    // `+` keeps Medusa's default offer fields (id, product_id, variant_id, seller...) and adds the
    // computed/metadata fields. A bare `metadata` would replace the selection and break grouping.
    const fields = "+metadata,+calculated_price,+inventory_quantity,+in_stock";
    const params = new URLSearchParams();
    for (const id of productIds) {
      params.append("product_id[]", id);
    }
    params.set("region_id", regionId);
    params.set("country_code", this.config.medusaCountryCode);
    params.set("fields", fields);
    params.set("limit", String(Math.max(200, productIds.length * 50)));
    const data = await this.getJson<{ offers: StoreOffer[] }>(
      `/store/offers?${params.toString()}`,
      salesChannelId,
    );
    return data.offers;
  }

  async listProducts(
    limit = 50,
    offset = 0,
    salesChannelId?: string,
  ): Promise<StoreProduct[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields: PRODUCT_FIELDS,
    });
    const data = await this.getJson<{ products: StoreProduct[] }>(
      `/store/products?${params.toString()}`,
      salesChannelId,
    );
    return data.products;
  }

  /** Store-visible product categories, used to resolve curated category collections. */
  async listProductCategories(limit = 200): Promise<StoreProductCategory[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      fields: "id,name,handle,parent_category_id,rank,is_active,is_internal",
    });
    const data = await this.getJson<{ product_categories: StoreProductCategory[] }>(
      `/store/product-categories?${params.toString()}`,
    );
    return data.product_categories;
  }

  async listProductsByCategory(categoryId: string, limit = 12): Promise<StoreProduct[]> {
    const params = new URLSearchParams({ limit: String(limit), fields: PRODUCT_FIELDS });
    params.append("category_id[]", categoryId);
    const data = await this.getJson<{ products: StoreProduct[] }>(
      `/store/products?${params.toString()}`,
    );
    return data.products;
  }

  /**
   * Products belonging to a commerce collection (Products → Collections).
   *
   * Storefront layout sections reference a collection, so this is the resolution the storefront needs:
   * the section stores a reference, commerce resolves the membership at read time, and no product list
   * is ever copied into editorial configuration.
   */
  async listProductsByCollection(collectionId: string, limit = 12): Promise<StoreProduct[]> {
    const params = new URLSearchParams({ limit: String(limit), fields: PRODUCT_FIELDS });
    params.append("collection_id[]", collectionId);
    const data = await this.getJson<{ products: StoreProduct[] }>(
      `/store/products?${params.toString()}`,
    );
    return data.products;
  }

  /**
   * A commerce collection by its handle.
   *
   * Collections created in the console carry a handle but are not in the key registry, so a customer
   * URL has to resolve them through commerce. Returns null when no collection owns the handle, which
   * lets the caller answer 404 instead of substituting unrelated products.
   */
  async getCollectionByHandle(
    handle: string,
  ): Promise<{ id: string; title: string; handle: string } | null> {
    const params = new URLSearchParams({ handle });
    try {
      const data = await this.getJson<{
        collections: Array<{ id: string; title: string; handle: string }>;
      }>(`/store/collections?${params.toString()}`);
      return data.collections?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async createCart(
    regionId: string,
    currencyCode: string,
    options: {
      salesChannelId?: string;
      customerEmail?: string;
    } = {},
  ): Promise<StoreCart> {
    const customerEmail = options.customerEmail?.trim().toLowerCase();
    const data = await this.postJson<{ cart: StoreCart }>(
      "/store/carts",
      {
        region_id: regionId,
        currency_code: currencyCode,
        // Medusa resolves an existing customer (including customer-group membership) by email.
        // This value comes only from the Experience API's signed session, never from cart input.
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(options.salesChannelId ? { sales_channel_id: options.salesChannelId } : {}),
      },
      options.salesChannelId,
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

  /** Applies one promotion code through the real Medusa promotion engine. */
  async addPromotion(cartId: string, code: string): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/promotions`,
      { promo_codes: [code] },
    );
    return data.cart;
  }

  /** Removes one applied code. Medusa expects the codes in the DELETE body. */
  async removePromotion(cartId: string, code: string): Promise<StoreCart> {
    const data = await this.deleteJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/promotions`,
      { promo_codes: [code] },
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
  address_2?: string;
  city: string;
  province?: string;
  postal_code: string;
  country_code: string;
  phone?: string;
}

export interface StoreShippingOption {
  id: string;
  seller_id: string;
  name: string;
  amount: number;
  price_type: string;
  provider_id: string;
  type?: { label?: string; description?: string; code?: string } | null;
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

export interface StoreCartAdjustment {
  id?: string;
  code?: string | null;
  amount?: number | null;
  description?: string | null;
  provider_id?: string | null;
}

export interface StoreCartPromotion {
  id: string;
  code: string;
  is_automatic?: boolean | null;
}

export interface StoreCart {
  id: string;
  currency_code: string;
  region_id: string;
  customer_id?: string | null;
  email?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Product-line subtotal before item discounts, excluding shipping. */
  item_subtotal?: number;
  item_total?: number;
  shipping_total?: number;
  discount_total?: number;
  item_discount_total?: number;
  shipping_discount_total?: number;
  promotions?: StoreCartPromotion[] | null;
  items: {
    id: string;
    title: string;
    product_title: string | null;
    product_id?: string | null;
    variant_id?: string | null;
    sku?: string | null;
    seller_id?: string | null;
    thumbnail?: string | null;
    quantity: number;
    unit_price: number;
    total?: number;
    subtotal?: number;
    discount_total?: number;
    adjustments?: StoreCartAdjustment[] | null;
    metadata: { offer_id?: string } | null;
  }[];
  subtotal: number;
  total: number;
}
