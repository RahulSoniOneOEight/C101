import { scenarios, type PreviewScenario } from "./fixtures";

/**
 * Browser-level fetch mock for the UI-review harness. The component itself is untouched: it makes
 * the same calls it makes on staging, and this module answers them with the selected fixture.
 */

let active: PreviewScenario = scenarios[0];

export function setScenario(scenario: PreviewScenario) {
  active = scenario;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const product = () => {
  if (!active.product) return null;
  return { ...active.product };
};

const offerById = (id: string) => {
  const offers = (active.product?.offers ?? []) as Array<Record<string, unknown>>;
  return offers.find((row) => row.id === id) ?? null;
};

export function installMockFetch() {
  if (typeof window === "undefined") return;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(raw, window.location.origin);
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();

    if (!path.startsWith("/admin/buildkart/")) {
      return original(input as RequestInfo, init);
    }

    if (path === "/admin/buildkart/sellers") {
      return json({
        sellers: [
          { id: "sel_buildmaster", name: "BuildMaster Supplies" },
          { id: "sel_aquaflow", name: "AquaFlow Supplies" },
        ],
      });
    }

    if (path === "/admin/buildkart/product-studio" && method === "GET") {
      return json({
        categories: [
          { id: "pcat_basins", name: "Basin Mixers & Taps" },
          { id: "pcat_sockets", name: "Sockets & Drive Tools" },
          { id: "pcat_lighting", name: "Lighting" },
        ],
        tags: [
          { id: "tag_1", value: "bathroom" },
          { id: "tag_2", value: "chrome" },
          { id: "tag_3", value: "best deal" },
        ],
        catalogue: [],
        channels: [
          { id: "sc_b2c", name: "B2C Storefront" },
          { id: "sc_b2b", name: "B2B Trade" },
        ],
      });
    }

    if (path === "/admin/buildkart/product-studio" && method === "POST") {
      return json({ product: { ...(product() ?? {}), id: "prod_preview" } });
    }

    const productMatch = path.match(/^\/admin\/buildkart\/product-studio\/([^/]+)$/);
    if (productMatch) {
      if (method === "POST") {
        return json({ product: product() ?? {} });
      }
      const current = product();
      if (!current) {
        return json({ message: "Product not found." }, 404);
      }
      return json({ product: current });
    }

    if (path === "/admin/buildkart/inventory/summary") {
      return json({ items: [] });
    }

    if (path === "/admin/buildkart/inventory/requests") {
      return json({ items: [] });
    }

    const b2bMatch = path.match(/^\/admin\/buildkart\/offers\/([^/]+)\/b2b-pricing$/);
    if (b2bMatch) {
      if (method === "GET") {
        const row = offerById(b2bMatch[1]) as
          | { b2b_pricing?: Record<string, unknown> | null }
          | null;
        const snapshot = row?.b2b_pricing ?? null;
        return json({
          pricing: {
            configured: Boolean(snapshot?.configured),
            price_list_id: snapshot?.configured ? "plist_preview" : null,
            amount: snapshot?.amount ?? null,
            list_price_minor: snapshot?.list_price_minor ?? null,
            moq: snapshot?.moq ?? null,
            starts_at: null,
            ends_at: null,
            gst_inclusive: true,
            tiers: [],
          },
        });
      }
      return json({ ok: true });
    }

    const pricingMatch = path.match(/^\/admin\/buildkart\/offers\/([^/]+)\/pricing$/);
    if (pricingMatch) {
      const row = offerById(pricingMatch[1]) as
        | { sku?: string; prices?: unknown[] }
        | null;
      let body: { prices?: Array<Record<string, unknown>> } = {};
      try {
        body = JSON.parse(String(init?.body ?? "{}")) as typeof body;
      } catch {
        body = {};
      }
      return json({
        pricing: {
          offer_id: pricingMatch[1],
          seller_id: "sel_buildmaster",
          variant_id: "variant_1",
          sku: row?.sku ?? "AT-BM-25-01",
          prices: body.prices ?? row?.prices ?? [],
        },
      });
    }

    return json({});
  };
}
