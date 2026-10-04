import type { Config } from "../config.js";

/**
 * Minimal typed client for the Medusa/Mercur store API. Reads composed owner-service data
 * (Medusa products + Mercur offers) for the Experience API. It never writes canonical state.
 */

export interface StoreProduct {
  id: string;
  title: string;
  variants: { id: string; title?: string; sku?: string | null }[];
}

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

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Medusa store request failed (${response.status}): ${url}`);
    }
    return (await response.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.medusaBaseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-publishable-api-key": this.config.medusaPublishableKey,
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

  async getProduct(productId: string): Promise<StoreProduct> {
    const data = await this.getJson<{ product: StoreProduct }>(
      `/store/products/${encodeURIComponent(productId)}?fields=id,title,variants.id,variants.title,variants.sku`,
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

  async listProducts(limit = 12): Promise<StoreProduct[]> {
    const data = await this.getJson<{ products: StoreProduct[] }>(
      `/store/products?limit=${limit}&fields=id,title,variants.id`,
    );
    return data.products;
  }

  async createCart(regionId: string, currencyCode: string): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>("/store/carts", {
      region_id: regionId,
      currency_code: currencyCode,
    });
    return data.cart;
  }

  async addLineItem(cartId: string, offerId: string, quantity: number): Promise<StoreCart> {
    const data = await this.postJson<{ cart: StoreCart }>(
      `/store/carts/${encodeURIComponent(cartId)}/line-items`,
      { offer_id: offerId, quantity },
    );
    return data.cart;
  }

  async completeCart(cartId: string): Promise<StoreCompleteResult> {
    return this.postJson<StoreCompleteResult>(
      `/store/carts/${encodeURIComponent(cartId)}/complete`,
      {},
    );
  }
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
