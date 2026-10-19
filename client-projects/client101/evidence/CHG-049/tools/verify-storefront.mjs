import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("/tmp/products500.json", "utf8"));
const expectedHandles = new Set(manifest.map((product) => product.uid));
const expectedPrices = new Map(
  manifest.flatMap((product) =>
    product.variants.map((variant) => [variant.sku, Math.round(Number(variant.price) * 100)]),
  ),
);
const base = process.env.MEDUSA_BASE_URL;
const key = process.env.MEDUSA_PUBLISHABLE_KEY;
const regionId = process.env.MEDUSA_REGION_ID;
const countryCode = process.env.MEDUSA_COUNTRY_CODE ?? "in";
const channels = {
  b2c: process.env.MEDUSA_B2C_SALES_CHANNEL_ID,
  b2b: process.env.MEDUSA_B2B_SALES_CHANNEL_ID,
};
if (!base || !key || !regionId || !channels.b2c || !channels.b2b) {
  throw new Error("Missing Medusa storefront configuration");
}

async function get(path, channelId) {
  const response = await fetch(base + path, {
    headers: {
      "x-publishable-api-key": key,
      "x-sales-channel-id": channelId,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

async function pages(path, keyName, channelId, extra) {
  const output = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ limit: "100", offset: String(offset), ...extra });
    const response = await get(`${path}?${params}`, channelId);
    const page = response[keyName] ?? [];
    output.push(...page);
    offset += page.length;
    if (!page.length || offset >= (response.count ?? 0)) return output;
  }
}

const report = {};
for (const [channelName, channelId] of Object.entries(channels)) {
  const products = await pages("/store/products", "products", channelId, {
    fields: "id,handle,variants.id,variants.sku",
  });
  const importedProducts = products.filter((product) => expectedHandles.has(product.handle));
  const productSkus = new Set(
    importedProducts.flatMap((product) => product.variants.map((variant) => variant.sku)),
  );
  if (importedProducts.length !== 233 || productSkus.size !== 500) {
    throw new Error(
      `${channelName}: expected 233 products/500 SKUs, got ${importedProducts.length}/${productSkus.size}`,
    );
  }

  const offers = await pages("/store/offers", "offers", channelId, {
    fields: "+calculated_price,+inventory_quantity,+in_stock",
    region_id: regionId,
    country_code: countryCode,
  });
  const importedOffers = offers.filter((offer) => expectedPrices.has(offer.sku));
  if (importedOffers.length !== 500) {
    throw new Error(`${channelName}: expected 500 offers, got ${importedOffers.length}`);
  }
  for (const offer of importedOffers) {
    const amount = offer.calculated_price?.calculated_amount;
    if (amount !== expectedPrices.get(offer.sku)) {
      throw new Error(
        `${channelName}: calculated price mismatch for ${offer.sku}: ${amount} != ${expectedPrices.get(offer.sku)}`,
      );
    }
    if (offer.in_stock !== true || Number(offer.inventory_quantity) !== 50) {
      throw new Error(
        `${channelName}: inventory mismatch for ${offer.sku}: in_stock=${offer.in_stock} quantity=${offer.inventory_quantity}`,
      );
    }
  }
  report[channelName] = {
    products: importedProducts.length,
    variants: productSkus.size,
    offers: importedOffers.length,
    calculated_prices: importedOffers.filter((offer) => offer.calculated_price != null).length,
    in_stock: importedOffers.filter((offer) => offer.in_stock === true).length,
    quantity_50: importedOffers.filter((offer) => Number(offer.inventory_quantity) === 50).length,
  };
}
console.log(JSON.stringify({ result: "pass", channels: report }));
