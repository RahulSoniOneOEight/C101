import assert from "node:assert/strict";
import type { Config } from "../config.js";
import { MedusaStoreClient } from "../medusa/store-client.js";

const requests: Array<{
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}> = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  requests.push({
    url: String(input),
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
  });
  return new Response(JSON.stringify({
    cart: {
      id: "cart_test",
      currency_code: "inr",
      region_id: "reg_test",
      customer_id: "cus_trade",
      email: "buyer.b2b01@buildkart.test",
      items: [],
      subtotal: 0,
      total: 0,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

try {
  const config = {
    medusaBaseUrl: "http://medusa.test",
    medusaPublishableKey: "pk_test",
    medusaB2cSalesChannelId: "sc_b2c",
  } as Config;
  const client = new MedusaStoreClient(config);

  const cart = await client.createCart("reg_test", "inr", {
    customerEmail: "  Buyer.B2B01@BuildKart.Test  ",
    salesChannelId: "sc_b2b",
  });

  assert.equal(cart.customer_id, "cus_trade");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://medusa.test/store/carts");
  assert.deepEqual(requests[0].body, {
    region_id: "reg_test",
    currency_code: "inr",
    email: "buyer.b2b01@buildkart.test",
    sales_channel_id: "sc_b2b",
  });
  assert.equal(requests[0].headers.get("x-sales-channel-id"), "sc_b2b");

  requests.length = 0;
  await client.createCart("reg_test", "inr");
  assert.equal(Object.hasOwn(requests[0].body, "email"), false);

  console.log("cart customer context test passed");
} finally {
  globalThis.fetch = originalFetch;
}
