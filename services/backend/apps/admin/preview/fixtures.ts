/**
 * Fixtures for the Product Studio UI-review harness.
 *
 * Shapes mirror what `loadStudioProduct` returns, so the real component renders exactly as it
 * would on staging. Nothing here is used by the shipped dashboard.
 */

export type PreviewScenario = {
  id: string;
  label: string;
  note: string;
  product: Record<string, unknown> | null;
};

const image =
  "https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=800";

const price = (id: string, amount: number, min: number | null = null) => ({
  id,
  amount,
  currency_code: "inr",
  min_quantity: min,
  max_quantity: null,
  rules: {},
});

function offer(
  id: string,
  variantId: string,
  sku: string,
  selling: number,
  list: number,
  b2b: Record<string, unknown> | null,
) {
  return {
    id,
    seller_id: "sel_buildmaster",
    seller_name: "BuildMaster Supplies",
    variant_id: variantId,
    product_id: "prod_preview",
    sku,
    metadata: {},
    list_price_minor: list,
    gst_inclusive: true,
    b2b_pricing: b2b,
    prices: [price(`price_${id}`, selling)],
  };
}

const specs = [
  "Material: Brass",
  "Finish: Chrome",
  "Warranty: 2 years",
  "Size: 25 mm",
].map((row, index) => {
  const [name, value] = row.split(": ");
  return {
    id: `attr_${index}`,
    name,
    value,
    unit: "",
    rank: index,
    studio_order: index,
  };
});

const channels = [
  { id: "sc_b2c", name: "B2C Storefront" },
  { id: "sc_b2b", name: "B2B Trade" },
];

function readiness(
  visible: boolean,
  blocker: string | null,
  warningCount = 2,
): Record<string, unknown> {
  const gate = {
    published_and_channel: true,
    offer: true,
    price: true,
    stock: visible,
  };
  return {
    checked_at: new Date().toISOString(),
    rule: "published + channel + positive channel price + in-stock seller offer",
    blocker_count: visible ? 0 : 1,
    warning_count: warningCount,
    issues: visible
      ? [
          {
            id: "product-image",
            severity: "warning",
            group: "quality",
            message: "Product image is missing; customers will see a placeholder.",
            view: "overview",
            field: "product-thumbnail",
          },
        ]
      : [
          {
            id: "b2c-visibility",
            severity: "blocker",
            group: "visibility",
            channel: "b2c",
            message: blocker ?? "Priced seller offers have no sellable stock.",
            view: "inventory",
          },
          {
            id: "product-image",
            severity: "warning",
            group: "quality",
            message: "Add search tags to improve discovery.",
            view: "overview",
            field: "product-tags",
          },
        ],
    channels: {
      b2c: {
        evaluated: true,
        enabled: true,
        visible,
        gates: gate,
        blocker: visible
          ? null
          : { code: "out_of_stock", message: blocker ?? "Priced seller offers have no sellable stock." },
        checked_at: new Date().toISOString(),
      },
      b2b: {
        evaluated: true,
        enabled: true,
        visible: false,
        gates: { ...gate, price: false },
        blocker: {
          code: "missing_price",
          message: "No active B2B price is saved for this seller offer.",
        },
      },
    },
  };
}

const baseProduct = {
  id: "prod_preview",
  title: "AquaTek Solo Basin Mixer",
  subtitle: "Wall-mounted basin mixer with a chrome finish",
  description:
    "A single-lever basin mixer for residential bathrooms. Includes mounting hardware and a 2-year warranty.",
  status: "published",
  lifecycle_state: null,
  thumbnail: image,
  category_id: "pcat_basins",
  category_name: "Basin Mixers & Taps",
  brand: "AquaTek",
  manufacturer: "AquaTek Industries",
  model_number: "AT-BM-25",
  product_type: "Basin mixer",
  hsn_code: "8481",
  unit_of_measure: "piece",
  tags: ["bathroom", "mixer", "chrome"],
  specifications: specs,
  options: [],
  can_edit: true,
  options_editable: true,
  studio_managed: true,
  owned: true,
  sales_channels: channels,
};

function withVariants(count: number, priced: boolean) {
  const variants = Array.from({ length: count }, (_, index) => ({
    id: `variant_${index + 1}`,
    title: index === 0 ? "Standard" : `Variant ${index + 1}`,
    details: "Single-lever mixer, chrome finish.",
    image_url: "",
    sku: `AT-BM-25-${String(index + 1).padStart(2, "0")}`,
    ean: "",
    upc: "",
    barcode: "",
    options: {},
  }));
  const offers = variants.map((variant, index) =>
    offer(
      `offer_${index + 1}`,
      variant.id,
      variant.sku,
      priced ? 4999 + index * 100 : 0,
      priced ? 6500 + index * 100 : 0,
      index === 0
        ? { configured: true, amount: 459900, list_price_minor: 650000, moq: 5 }
        : null,
    ),
  );
  return { variants, offers };
}

export const scenarios: PreviewScenario[] = [
  {
    id: "new",
    label: "New product",
    note: "First card open, the rest collapsed with status summaries.",
    product: null,
  },
  {
    id: "not-live",
    label: "Edit · Published · Not live",
    note: "Two variants, B2C blocked by stock, B2B not configured.",
    product: {
      ...baseProduct,
      ...withVariants(2, true),
      readiness: readiness(false, "Priced seller offers have no sellable stock.", 3),
      activity: [
        {
          id: "act_1",
          action: "UPDATE",
          note: "Product studio draft saved",
          actor: "admin@buildkart.test",
          status: "confirmed",
          applied: true,
          created_at: new Date(Date.now() - 3600_000).toISOString(),
        },
      ],
    },
  },
  {
    id: "live",
    label: "Edit · Live",
    note: "All B2C gates pass, no save bar.",
    product: {
      ...baseProduct,
      ...withVariants(2, true),
      readiness: readiness(true, null, 1),
      activity: [],
    },
  },
  {
    id: "many-variants",
    label: "Edit · 20 variants",
    note: "Stress case for the variants list and the offer table.",
    product: {
      ...baseProduct,
      ...withVariants(20, true),
      readiness: readiness(true, null, 1),
      activity: [],
    },
  },
];
