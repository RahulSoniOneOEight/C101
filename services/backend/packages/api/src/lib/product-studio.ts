import type { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductOptionsWorkflow,
  createProductTagsWorkflow,
  createProductVariantsWorkflow,
  deleteProductOptionsWorkflow,
  deleteProductVariantsWorkflow,
  updateProductVariantsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import {
  createAndLinkProductAttributesToProductWorkflow,
  createOffersWorkflow,
  createProductsWorkflow,
  recordProductAuditChangeWorkflow,
} from "@mercurjs/core/workflows";
import { AttributeType, ProductChangeActionType } from "@mercurjs/types";
import { recordSellerProductActivity } from "./seller-activity";

export type StudioMode = "admin" | "vendor";

export type StudioSpecInput = {
  name?: string | null;
  value?: string | null;
  unit?: string | null;
};

export type StudioOptionInput = {
  name?: string | null;
  values?: string[] | null;
};

export type StudioVariantInput = {
  id?: string | null;
  title?: string | null;
  details?: string | null;
  image_url?: string | null;
  sku?: string | null;
  ean?: string | null;
  upc?: string | null;
  barcode?: string | null;
  options?: Record<string, string> | null;
};

export type StudioSaveInput = {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  category_id?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  product_type?: string | null;
  hsn_code?: string | null;
  unit_of_measure?: string | null;
  thumbnail?: string | null;
  tags?: string[] | null;
  specifications?: StudioSpecInput[] | null;
  options?: StudioOptionInput[] | null;
  variants?: StudioVariantInput[] | null;
  seller_id?: string | null;
  seller_provision_reason?: string | null;
};

type QueryLike = {
  graph: (input: {
    entity: string;
    fields: string[];
    filters?: Record<string, unknown>;
    pagination?: Record<string, unknown>;
  }) => Promise<{ data: any[]; metadata?: Record<string, unknown> }>;
};

export class StudioError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "StudioError";
  }
}

const STUDIO_ATTRIBUTE_FLAG = "buildkart_studio";
const VARIANT_DETAILS_KEY = "buildkart_variant_details";
const VARIANT_IMAGE_KEY = "buildkart_variant_image_url";

const productFields = [
  "id",
  "title",
  "subtitle",
  "description",
  "status",
  "thumbnail",
  "hs_code",
  "metadata",
  "categories.id",
  "categories.name",
  "tags.id",
  "tags.value",
  "options.id",
  "options.title",
  "options.metadata",
  "options.values.id",
  "options.values.value",
  "product_attribute_values.id",
  "product_attribute_values.name",
  "product_attribute_values.attribute.id",
  "product_attribute_values.attribute.name",
  "product_attribute_values.attribute.type",
];

function query(scope: MedusaContainer): QueryLike {
  return scope.resolve(ContainerRegistrationKeys.QUERY) as unknown as QueryLike;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function attributeScalar(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
    return Number(trimmed);
  }
  return trimmed;
}

function studioAttributes(specifications: StudioSpecInput[] | null | undefined) {
  return (specifications ?? [])
    .map((spec) => ({
      name: clean(spec.name),
      value: clean(spec.value),
      unit: clean(spec.unit),
    }))
    .filter((spec): spec is { name: string; value: string; unit: string | null } =>
      Boolean(spec.name && spec.value),
    )
    .map((spec, index) => ({
      title: spec.name,
      type: spec.unit ? AttributeType.UNIT : AttributeType.TEXT,
      value: spec.unit ? attributeScalar(spec.value) : spec.value,
      metadata: {
        [STUDIO_ATTRIBUTE_FLAG]: true,
        studio_order: index,
        ...(spec.unit ? { unit: spec.unit } : {}),
      },
    }));
}

async function resolveTags(
  scope: MedusaContainer,
  values: string[] | null | undefined,
): Promise<string[]> {
  const wanted = Array.from(
    new Map(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value] as const),
    ).values(),
  );
  if (wanted.length === 0) {
    return [];
  }

  const q = query(scope);
  const { data: existing } = await q.graph({
    entity: "product_tag",
    fields: ["id", "value"],
    filters: { value: wanted },
  });

  const byValue = new Map<string, string>();
  for (const tag of existing ?? []) {
    if (tag.value && tag.id) {
      byValue.set(String(tag.value).toLowerCase(), tag.id);
    }
  }

  const missing = wanted.filter((value) => !byValue.has(value.toLowerCase()));
  if (missing.length > 0) {
    const { result } = await createProductTagsWorkflow(scope).run({
      input: { product_tags: missing.map((value) => ({ value })) },
    });
    for (const tag of result ?? []) {
      if (tag.value && tag.id) {
        byValue.set(String(tag.value).toLowerCase(), tag.id);
      }
    }
  }

  return wanted
    .map((value) => byValue.get(value.toLowerCase()))
    .filter((id): id is string => Boolean(id));
}

type NormalizedOption = { name: string; values: string[] };

type NormalizedVariant = {
  id: string | null;
  title: string;
  details: string | null;
  imageUrl: string | null;
  sku: string | null;
  ean: string | null;
  upc: string | null;
  barcode: string | null;
  options: Record<string, string>;
};

function variantMetadata(
  details: string | null,
  imageUrl: string | null,
  previous?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(previous ?? {}),
    ...(details ? { [VARIANT_DETAILS_KEY]: details } : {}),
    ...(imageUrl ? { [VARIANT_IMAGE_KEY]: imageUrl } : {}),
  };
}

function normalizeOptions(input: StudioOptionInput[] | null | undefined): NormalizedOption[] {
  const seen = new Set<string>();
  const options = (input ?? [])
    .map((option) => {
      const name = clean(option.name);
      if (!name) return null;
      const values: string[] = [];
      const valueSeen = new Set<string>();
      for (const raw of option.values ?? []) {
        const value = clean(raw);
        if (!value) continue;
        const key = value.toLowerCase();
        if (valueSeen.has(key)) continue;
        valueSeen.add(key);
        values.push(value);
      }
      if (values.length === 0) return null;
      return { name, values };
    })
    .filter((option): option is NormalizedOption => Boolean(option))
    .filter((option) => {
      const key = option.name.toLowerCase();
      if (seen.has(key)) {
        throw new StudioError(422, `Option "${option.name}" is duplicated.`);
      }
      seen.add(key);
      return true;
    });
  if (options.length > 3) {
    throw new StudioError(422, "A product can have at most 3 options.");
  }
  return options;
}

function normalizeVariants(
  options: NormalizedOption[],
  input: StudioVariantInput[] | null | undefined,
): NormalizedVariant[] {
  const source = input ?? [];
  const optionNames = options.map((option) => option.name);
  const combinationCount = options.reduce(
    (total, option) => total * Math.max(1, option.values.length),
    1,
  );
  if (combinationCount > 100) {
    throw new StudioError(
      422,
      "A product can generate at most 100 variant combinations in this slice.",
    );
  }

  if (options.length === 0 && source.length > 100) {
    throw new StudioError(
      422,
      "A product can have at most 100 direct variants in this slice.",
    );
  }

  if (options.length === 0 && source.length === 0) {
    return [
      {
        id: null,
        title: "Default",
        details: null,
        imageUrl: null,
        sku: null,
        ean: null,
        upc: null,
        barcode: null,
        options: {},
      },
    ];
  }

  if (options.length > 0 && source.length === 0) {
    throw new StudioError(422, "Generate at least one variant combination.");
  }

  const combinations = new Set<string>();
  const skus = new Map<string, number>();
  return source.map((variant, index) => {
    const values = variant.options ?? {};
    const normalizedOptions: Record<string, string> = {};
    for (const name of optionNames) {
      const value = clean(values[name]);
      if (!value) {
        throw new StudioError(
          422,
          `Variant ${index + 1} is missing a value for "${name}".`,
        );
      }
      normalizedOptions[name] = value;
    }
    const combo = optionNames
      .map((name) => `${name}:${normalizedOptions[name].toLowerCase()}`)
      .join("|");
    if (options.length > 0 && combinations.has(combo)) {
      throw new StudioError(422, "Variant combinations must be unique.");
    }
    combinations.add(combo);

    const sku = clean(variant.sku);
    if (sku) {
      const key = sku.toLowerCase();
      if (skus.has(key)) {
        throw new StudioError(422, `Duplicate SKU "${sku}".`);
      }
      skus.set(key, index);
    }

    return {
      id: clean(variant.id),
      title:
        clean(variant.title) ||
        (optionNames.length > 0
          ? optionNames.map((name) => normalizedOptions[name]).join(" / ")
          : source.length === 1
            ? "Default"
            : `Variant ${index + 1}`),
      details: clean(variant.details),
      imageUrl: clean(variant.image_url),
      sku,
      ean: clean(variant.ean),
      upc: clean(variant.upc),
      barcode: clean(variant.barcode),
      options: options.length > 0 ? normalizedOptions : {},
    };
  });
}

function optionsEqual(a: NormalizedOption[], b: NormalizedOption[]): boolean {
  if (a.length !== b.length) return false;
  const normalize = (options: NormalizedOption[]) =>
    options
      .map((option) => ({
        name: option.name.toLowerCase(),
        values: [...option.values].map((value) => value.toLowerCase()).sort(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

async function loadCurrentOptions(
  scope: MedusaContainer,
  productId: string,
): Promise<Array<{ id: string; name: string; values: string[] }>> {
  const q = query(scope);
  const { data: products } = await q.graph({
    entity: "product",
    fields: ["id", "options.id", "options.title", "options.values.id", "options.values.value"],
    filters: { id: productId },
  });
  const options = products?.[0]?.options ?? [];

  return (options ?? []).map((option: any) => ({
    id: option.id,
    name: String(option.title ?? ""),
    values: (option.values ?? [])
      .map((value: any) => value.value)
      .filter((value: unknown): value is string => Boolean(value)),
  }));
}

async function validateSkuUniqueness(
  scope: MedusaContainer,
  productId: string,
  variants: NormalizedVariant[],
) {
  const skus = variants
    .map((variant) => variant.sku)
    .filter((sku): sku is string => Boolean(sku));
  if (skus.length === 0) return;

  const q = query(scope);
  const { data: existing } = await q.graph({
    entity: "variant",
    fields: ["id", "sku", "product_id"],
    filters: { sku: skus },
    pagination: { take: 500, skip: 0 },
  });
  for (const row of existing ?? []) {
    if (productId && row.product_id === productId) {
      // The draft's own variants may be replaced; payload-level duplicate
      // checks already prevent two variants sharing the same SKU.
      continue;
    }
    throw new StudioError(422, `SKU "${row.sku}" is already in use.`);
  }
}

async function replaceOptionsAndVariants(
  scope: MedusaContainer,
  productId: string,
  options: NormalizedOption[],
  variants: NormalizedVariant[],
) {
  const q = query(scope);
  const { data: currentVariants } = await q.graph({
    entity: "variant",
    fields: ["id"],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });
  const variantIds = (currentVariants ?? [])
    .map((variant: any) => variant.id)
    .filter((id: unknown): id is string => Boolean(id));
  if (variantIds.length > 0) {
    await deleteProductVariantsWorkflow(scope).run({
      input: { ids: variantIds },
    });
  }

  const currentOptions = await loadCurrentOptions(scope, productId);
  let createdOptions: any[] = [];
  if (options.length > 0) {
    const { result } = await createProductOptionsWorkflow(scope).run({
      input: {
        product_options: options.map((option, index) => ({
          title: option.name,
          values: option.values,
          is_exclusive: true,
          metadata: { studio_order: index },
        })) as any,
      },
    });
    createdOptions = result ?? [];
  }

  await updateProductsWorkflow(scope).run({
    input: {
      selector: { id: productId },
      update: {
        option_ids: createdOptions.map((option) => option.id),
      } as any,
    },
  });

  if (currentOptions.length > 0) {
    await deleteProductOptionsWorkflow(scope).run({
      input: { ids: currentOptions.map((option) => option.id) },
    });
  }

  if (variants.length > 0) {
    await createProductVariantsWorkflow(scope).run({
      input: {
        product_variants: variants.map((variant) => ({
          product_id: productId,
          title: variant.title,
          sku: variant.sku ?? undefined,
          ean: variant.ean ?? undefined,
          upc: variant.upc ?? undefined,
          barcode: variant.barcode ?? undefined,
          metadata: variantMetadata(variant.details, variant.imageUrl),
          ...(Object.keys(variant.options).length > 0
            ? { options: variant.options }
            : {}),
          manage_inventory: false,
        })),
      },
    });
  }
}

async function syncVariants(
  scope: MedusaContainer,
  productId: string,
  variants: NormalizedVariant[],
) {
  const q = query(scope);
  const { data: currentVariants } = await q.graph({
    entity: "variant",
    fields: ["id", "title", "sku", "ean", "upc", "barcode", "metadata"],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });
  const current = new Map<string, any>(
    (currentVariants ?? []).map((variant: any) => [variant.id, variant]),
  );
  const desiredIds = new Set<string>();
  const toCreate: NormalizedVariant[] = [];

  for (const variant of variants) {
    if (!variant.id || !current.has(variant.id)) {
      toCreate.push(variant);
      continue;
    }
    desiredIds.add(variant.id);
    const previous = current.get(variant.id);
    const update: Record<string, unknown> = {};
    for (const key of ["title", "sku", "ean", "upc", "barcode"] as const) {
      if ((previous?.[key] ?? null) !== (variant[key] ?? null)) {
        update[key] = variant[key];
      }
    }
    const previousMetadata = (previous?.metadata ?? {}) as Record<string, unknown>;
    if (
      (previousMetadata[VARIANT_DETAILS_KEY] ?? null) !== variant.details ||
      (previousMetadata[VARIANT_IMAGE_KEY] ?? null) !== variant.imageUrl
    ) {
      update.metadata = variantMetadata(
        variant.details,
        variant.imageUrl,
        previousMetadata,
      );
    }
    if (Object.keys(update).length > 0) {
      await updateProductVariantsWorkflow(scope).run({
        input: {
          selector: { id: variant.id, product_id: productId },
          update,
        },
      });
    }
  }

  if (toCreate.length > 0) {
    await createProductVariantsWorkflow(scope).run({
      input: {
        product_variants: toCreate.map((variant) => ({
          product_id: productId,
          title: variant.title,
          sku: variant.sku ?? undefined,
          ean: variant.ean ?? undefined,
          upc: variant.upc ?? undefined,
          barcode: variant.barcode ?? undefined,
          metadata: variantMetadata(variant.details, variant.imageUrl),
          ...(Object.keys(variant.options).length > 0
            ? { options: variant.options }
            : {}),
          manage_inventory: false,
        })),
      },
    });
  }

  const remove = [...current.keys()].filter((id) => !desiredIds.has(id));
  if (remove.length > 0) {
    await deleteProductVariantsWorkflow(scope).run({
      input: { ids: remove },
    });
  }
}

export function studioReadiness(product: {
  title?: string | null;
  category_id?: string | null;
  variants?: Array<{ id?: string; sku?: string; title?: string }>;
  offers?: Array<{
    variant_id: string;
    prices: Array<{
      currency_code: string;
      amount: number;
      min_quantity?: number | null;
    }>;
  }>;
}) {
  const variants = product.variants ?? [];
  const offers = product.offers ?? [];
  const pricingReady =
    variants.length > 0 &&
    variants.every((variant) =>
      offers.some(
        (offer) =>
          offer.variant_id === variant.id &&
          offer.prices.some(
            (price) =>
              price.currency_code === "inr" &&
              (price.min_quantity === null ||
                price.min_quantity === undefined) &&
              price.amount > 0,
          ),
      ),
    );
  const checks = [
    {
      key: "title",
      label: "Product title",
      ok: Boolean(product.title?.trim()),
      required: true,
    },
    {
      key: "category",
      label: "Category",
      ok: Boolean(product.category_id),
      required: true,
    },
    {
      key: "variants",
      label: "At least one variant",
      ok: variants.length > 0,
      required: true,
    },
    {
      key: "skus",
      label: "Every variant has a SKU",
      ok:
        variants.length > 0 &&
        variants.every((variant) => Boolean(variant.sku?.trim())),
      required: true,
    },
    {
      key: "pricing",
      label: "Every variant has an INR base price on an offer",
      ok: pricingReady,
      required: true,
    },
  ];
  return {
    ready: checks.every((check) => !check.required || check.ok),
    checks,
  };
}

/**
 * Channel a studio-created product must join to be visible to the storefront.
 * Prefers the deployment setting, then the channel whose name contains "B2C".
 */
async function defaultStorefrontChannelId(
  scope: MedusaContainer,
): Promise<string | null> {
  const configured = process.env.MEDUSA_B2C_SALES_CHANNEL_ID?.trim();
  if (configured) return configured;
  const q = query(scope);
  const { data } = await q.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    pagination: { take: 20, skip: 0 },
  });
  const rows = (data ?? []) as Array<{ id: string; name?: string | null }>;
  return (
    rows.find((row) => (row.name ?? "").toLowerCase().includes("b2c"))?.id ??
    rows[0]?.id ??
    null
  );
}

/**
 * Stock new seller offers so they are purchasable. Without an inventory level the offer reports
 * out of stock and the storefront hides its price, which is why studio-created products were
 * invisible even once published.
 */
async function provisionOfferStock(
  scope: MedusaContainer,
  sellerId: string,
  skus: string[],
): Promise<void> {
  const wanted = skus.map((sku) => sku.trim()).filter(Boolean);
  if (wanted.length === 0) return;
  const quantity = Math.max(1, Number(process.env.STUDIO_DEFAULT_STOCK ?? "50") || 50);
  const q = query(scope);
  const { data: sellers } = await q.graph({
    entity: "seller",
    fields: ["id", "stock_locations.id"],
    filters: { id: sellerId },
    pagination: { take: 1, skip: 0 },
  });
  const locationId =
    ((sellers?.[0] as { stock_locations?: Array<{ id?: string }> } | undefined)
      ?.stock_locations ?? [])[0]?.id ?? null;
  if (!locationId) return;

  const { data: items } = await q.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
    filters: { sku: wanted },
    pagination: { take: 500, skip: 0 },
  });
  const itemIds = (items ?? [])
    .map((item: { id?: string }) => item.id)
    .filter((id): id is string => Boolean(id));
  if (itemIds.length === 0) return;

  const { data: levels } = await q.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id"],
    filters: { location_id: locationId, inventory_item_id: itemIds },
    pagination: { take: 500, skip: 0 },
  });
  const stocked = new Set(
    (levels ?? []).map((level: { inventory_item_id?: string }) => level.inventory_item_id),
  );
  const missing = itemIds.filter((id) => !stocked.has(id));
  if (missing.length === 0) return;

  await createInventoryLevelsWorkflow(scope).run({
    input: {
      inventory_levels: missing.map((inventoryItemId) => ({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        stocked_quantity: quantity,
      })),
    } as never,
  });
}

async function ensureSellerOffers(
  scope: MedusaContainer,
  sellerId: string,
  productId: string,
  actorId: string,
) {
  const q = query(scope);
  const { data: variants } = await q.graph({
    entity: "variant",
    fields: ["id", "title", "sku"],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });
  const candidates = (variants ?? []).filter(
    (variant: any) => variant.id && String(variant.sku ?? "").trim(),
  );
  if (candidates.length === 0) return;

  const { data: existing } = await q.graph({
    entity: "offer",
    fields: ["variant_id"],
    filters: {
      seller_id: sellerId,
      variant_id: candidates.map((variant: any) => variant.id),
    },
    pagination: { take: 500, skip: 0 },
  });
  const existingVariants = new Set(
    (existing ?? []).map((offer: any) => offer.variant_id),
  );
  const missing = candidates.filter(
    (variant: any) => !existingVariants.has(variant.id),
  );
  if (missing.length === 0) return;

  const { data: sellerOffers } = await q.graph({
    entity: "offer",
    fields: ["shipping_profile_id"],
    filters: { seller_id: sellerId },
    pagination: { take: 50, skip: 0 },
  });
  let shippingProfileId =
    (sellerOffers ?? [])
      .map((offer: any) => offer.shipping_profile_id)
      .find(Boolean) ?? null;
  if (!shippingProfileId) {
    const { data: profiles } = await q.graph({
      entity: "shipping_profile",
      fields: ["id"],
      pagination: { take: 1, skip: 0 },
    });
    shippingProfileId = profiles?.[0]?.id ?? null;
  }
  if (!shippingProfileId) {
    return;
  }

  await createOffersWorkflow(scope).run({
    input: {
      offers: missing.map((variant: any) => ({
        seller_id: sellerId,
        variant_id: variant.id,
        shipping_profile_id: shippingProfileId,
        sku: variant.sku,
        inventory_items: [
          {
            sku: variant.sku,
            title: variant.title ?? variant.sku,
            required_quantity: 1,
          },
        ],
        prices: [],
        manage_inventory: false,
        created_by: actorId,
      })) as any,
    },
  });
}

export async function sellerOwnedProductIds(
  scope: MedusaContainer,
  sellerId: string,
): Promise<string[]> {
  const q = query(scope);
  const [{ data: links }, { data: actions }] = await Promise.all([
    q.graph({
      entity: "product_seller",
      fields: ["product_id"],
      filters: { seller_id: sellerId },
    }),
    q.graph({
      entity: "product_change_action",
      fields: ["product_id"],
      filters: {
        action: "PRODUCT_ADD",
        product_change: { created_by: sellerId },
      },
    }),
  ]);

  return Array.from(
    new Set(
      [...(links ?? []), ...(actions ?? [])]
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export async function loadStudioMeta(
  scope: MedusaContainer,
  mode: StudioMode,
  sellerId: string | null,
  search: string,
) {
  const q = query(scope);
  const term = search.trim();
  const sellerProductIds =
    mode === "vendor" && sellerId
      ? await sellerOwnedProductIds(scope, sellerId)
      : null;

  const productFilter: Record<string, unknown> = {
    ...(term ? { title: { $ilike: `%${term}%` } } : {}),
    ...(sellerProductIds ? { id: sellerProductIds } : {}),
  };

  const [{ data: categories }, { data: tags }, { data: catalogue }] =
    await Promise.all([
      q.graph({
        entity: "product_category",
        fields: ["id", "name", "parent_category_id"],
        pagination: { take: 500, skip: 0 },
      }),
      q.graph({
        entity: "product_tag",
        fields: ["id", "value"],
        pagination: { take: 500, skip: 0 },
      }),
      sellerProductIds && sellerProductIds.length === 0
        ? Promise.resolve({ data: [] })
        : q.graph({
            entity: "product",
            fields: ["id", "title", "thumbnail", "status", "categories.name"],
            filters: productFilter,
            pagination: { take: 8, skip: 0 },
          }),
    ]);

  return {
    categories: (categories ?? []).sort((a: any, b: any) =>
      String(a.name ?? "").localeCompare(String(b.name ?? "")),
    ),
    tags: (tags ?? []).sort((a: any, b: any) =>
      String(a.value ?? "").localeCompare(String(b.value ?? "")),
    ),
    catalogue: catalogue ?? [],
  };
}

export async function loadStudioProduct(
  scope: MedusaContainer,
  mode: StudioMode,
  sellerId: string | null,
  productId: string,
) {
  const q = query(scope);
  const { data: products } = await q.graph({
    entity: "product",
    fields: productFields,
    filters: { id: productId },
  });
  const product = products?.[0];
  if (!product) {
    throw new StudioError(404, "Product not found.");
  }

  const owned =
    mode === "admin" ||
    (sellerId
      ? (await sellerOwnedProductIds(scope, sellerId)).includes(productId)
      : false);

  if (mode === "vendor" && !owned) {
    throw new StudioError(404, "Product not found.");
  }

  const { data: attributes } = await q.graph({
    entity: "product_attribute",
    fields: ["id", "name", "type", "metadata", "rank"],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });

  const valueMap = new Map<string, string[]>();
  for (const value of product.product_attribute_values ?? []) {
    const attributeId = value?.attribute?.id;
    if (!attributeId || !value?.name) continue;
    const values = valueMap.get(attributeId) ?? [];
    values.push(String(value.name));
    valueMap.set(attributeId, values);
  }

  const specifications = (attributes ?? [])
    .filter((attribute: any) => attribute?.metadata?.[STUDIO_ATTRIBUTE_FLAG] === true)
    .map((attribute: any) => ({
      id: attribute.id,
      name: attribute.name,
      value: (valueMap.get(attribute.id) ?? []).join(", "),
      unit: clean(attribute?.metadata?.unit) ?? "",
      rank: attribute.rank ?? 0,
      studio_order: Number(attribute?.metadata?.studio_order ?? 0),
    }))
    .sort(
      (a: any, b: any) =>
        a.studio_order - b.studio_order || a.rank - b.rank,
    );

  const { data: variantRows } = await q.graph({
    entity: "variant",
    fields: [
      "id",
      "title",
      "sku",
      "ean",
      "upc",
      "barcode",
      "metadata",
      "manage_inventory",
      "allow_backorder",
      "options.value",
      "options.option.title",
    ],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });
  const optionRows = (product.options ?? [])
    .map((option: any) => ({
      id: option.id,
      name: String(option.title ?? ""),
      studio_order: Number(option.metadata?.studio_order ?? 0),
      values: (option.values ?? [])
        .map((value: any) => value.value)
        .filter((value: unknown): value is string => Boolean(value)),
    }))
    .filter((option: any) => option.name !== "__default__")
    .sort((left: any, right: any) => left.studio_order - right.studio_order);

  const metadata = product.metadata ?? {};
  // Admin can edit every product. Seller direct edits are audited and surfaced
  // in Seller activity so Admin can review and correct them.
  const canEdit = mode === "admin" || owned;
  const studioManaged = metadata.buildkart_product_studio === true;

  const valueRank = new Map<string, Map<string, number>>(
    optionRows.map((option: any) => [
      option.name,
      new Map<string, number>(
        option.values.map((value: string, index: number) => [value, index]),
      ),
    ]),
  );
  const loadedVariants = (variantRows ?? [])
    .map((variant: any) => ({
      id: variant.id,
      title: variant.title ?? "",
      details: String(variant.metadata?.[VARIANT_DETAILS_KEY] ?? ""),
      image_url: String(variant.metadata?.[VARIANT_IMAGE_KEY] ?? ""),
      sku: variant.sku ?? "",
      ean: variant.ean ?? "",
      upc: variant.upc ?? "",
      barcode: variant.barcode ?? "",
      manage_inventory: Boolean(variant.manage_inventory),
      allow_backorder: Boolean(variant.allow_backorder),
      options: Object.fromEntries(
        (variant.options ?? [])
          .map((entry: any) => [entry?.option?.title, entry?.value])
          .filter(
            ([name, value]: [unknown, unknown]) =>
              Boolean(name && value) &&
              name !== "__default__" &&
              value !== "__default__",
          ),
      ),
    }))
    .sort((left: any, right: any) => {
      for (const option of optionRows) {
        const leftValue = left.options[option.name] ?? "";
        const rightValue = right.options[option.name] ?? "";
        const difference =
          (valueRank.get(option.name)?.get(leftValue) ?? 999) -
          (valueRank.get(option.name)?.get(rightValue) ?? 999);
        if (difference !== 0) return difference;
      }
      return String(left.title).localeCompare(String(right.title));
    });

  const variantIds = loadedVariants
    .map((variant: any) => variant.id)
    .filter((id: unknown): id is string => Boolean(id));
  const { data: offerRows } = variantIds.length
    ? await q.graph({
        entity: "offer",
        fields: [
          "id",
          "seller_id",
          "variant_id",
          "product_id",
          "sku",
          "metadata",
          "prices.id",
          "prices.amount",
          "prices.currency_code",
          "prices.min_quantity",
          "prices.max_quantity",
          "prices.price_rules.attribute",
          "prices.price_rules.value",
        ],
        filters:
          mode === "vendor" && sellerId
            ? { variant_id: variantIds, seller_id: sellerId }
            : { variant_id: variantIds },
        pagination: { take: 500, skip: 0 },
      })
    : { data: [] };

  const sellerIds = Array.from(
    new Set(
      (offerRows ?? [])
        .map((offer: any) => offer.seller_id)
        .filter((id: unknown): id is string => Boolean(id)),
    ),
  );
  const { data: sellerRows } = sellerIds.length
    ? await q.graph({
        entity: "seller",
        fields: ["id", "name"],
        filters: { id: sellerIds },
        pagination: { take: 100, skip: 0 },
      })
    : { data: [] };
  const sellerNames = new Map<string, string>(
    (sellerRows ?? []).map((seller: any) => [seller.id, seller.name]),
  );

  const loadedOffers = (offerRows ?? []).map((offer: any) => ({
    id: offer.id,
    seller_id: offer.seller_id,
    seller_name: sellerNames.get(offer.seller_id) ?? offer.seller_id,
    variant_id: offer.variant_id,
    product_id: offer.product_id ?? null,
    sku: offer.sku ?? "",
    metadata: offer.metadata ?? {},
    list_price_minor:
      Number.isInteger(Number(offer.metadata?.list_price_minor)) &&
      Number(offer.metadata?.list_price_minor) > 0
        ? Number(offer.metadata?.list_price_minor)
        : null,
    gst_inclusive: offer.metadata?.gst_inclusive !== false,
    prices: (offer.prices ?? []).filter(Boolean).map((price: any) => ({
      id: price.id,
      amount: Number(price.amount),
      currency_code: price.currency_code,
      min_quantity: price.min_quantity ?? null,
      max_quantity: price.max_quantity ?? null,
      rules: Object.fromEntries(
        (price.price_rules ?? [])
          .filter((rule: any) => rule.attribute !== "offer_id")
          .map((rule: any) => [rule.attribute, rule.value]),
      ),
    })),
  }));

  return {
    product: {
      id: product.id,
      title: product.title ?? "",
      subtitle: product.subtitle ?? "",
      description: product.description ?? "",
      status: product.status ?? "draft",
      metadata,
      lifecycle_state:
        typeof metadata.lifecycle_state === "string"
          ? metadata.lifecycle_state
          : null,
      thumbnail: product.thumbnail ?? "",
      category_id: product.categories?.[0]?.id ?? "",
      category_name: product.categories?.[0]?.name ?? "",
      brand: metadata.brand ?? "",
      manufacturer: metadata.manufacturer ?? "",
      model_number: metadata.model_number ?? "",
      product_type: metadata.product_type ?? "",
      hsn_code: metadata.hsn_code ?? product.hs_code ?? "",
      unit_of_measure: metadata.unit_of_measure ?? "",
      tags: (product.tags ?? [])
        .map((tag: any) => tag?.value)
        .filter((value: unknown): value is string => Boolean(value)),
      specifications,
      options: optionRows.map(
        (option: { id: string; name: string; values: string[] }) => ({
          id: option.id,
          name: option.name,
          values: option.values,
        }),
      ),
      variants: loadedVariants,
      offers: loadedOffers,
      review: studioReadiness({
        title: product.title,
        category_id: product.categories?.[0]?.id ?? null,
        variants: loadedVariants,
        offers: loadedOffers,
      }),
      can_edit: canEdit,
      options_editable: studioManaged && canEdit,
      studio_managed: studioManaged,
      owned,
    },
  };
}

export async function saveStudioProduct(
  scope: MedusaContainer,
  mode: StudioMode,
  actorId: string,
  sellerId: string | null,
  productId: string | null,
  input: StudioSaveInput,
) {
  const title = clean(input.title);
  if (!title) {
    throw new StudioError(422, "Product title is required.");
  }

  const tagIds = await resolveTags(scope, input.tags);
  const attributes = studioAttributes(input.specifications);
  const options = normalizeOptions(input.options);
  const variants = normalizeVariants(options, input.variants);
  await validateSkuUniqueness(scope, productId ?? "", variants);
  const requestedSellerId =
    mode === "admin" ? clean(input.seller_id) ?? null : sellerId;
  if (requestedSellerId && !clean(input.seller_provision_reason)) {
    throw new StudioError(
      422,
      "A reason is required before provisioning seller offers.",
    );
  }

  if (!productId) {
    const storefrontChannelId = await defaultStorefrontChannelId(scope);
    const { result: createdResult } = await createProductsWorkflow(scope).run({
      input: {
        products: [
          {
            title,
            subtitle: clean(input.subtitle) ?? undefined,
            description: clean(input.description) ?? undefined,
            // Products created in the studio go live immediately; pricing is still applied from
            // the Pricing section (an unpriced product is listed without a purchasable amount).
            status: "published",
            thumbnail: clean(input.thumbnail) ?? undefined,
            hs_code: clean(input.hsn_code) ?? undefined,
            category_ids: input.category_id ? [input.category_id] : undefined,
            tags: tagIds.map((id) => ({ id })),
            attributes,
            sales_channels: storefrontChannelId
              ? [{ id: storefrontChannelId }]
              : undefined,
            metadata: {
              buildkart_product_studio: true,
              // The storefront queries this marker; a product without it never appears.
              catalogue_import:
                process.env.STUDIO_CATALOGUE_IMPORT?.trim() || "CHG-049",
              brand: clean(input.brand),
              manufacturer: clean(input.manufacturer),
              model_number: clean(input.model_number),
              product_type: clean(input.product_type),
              hsn_code: clean(input.hsn_code),
              unit_of_measure: clean(input.unit_of_measure),
            },
            seller_ids: requestedSellerId ? [requestedSellerId] : undefined,
          } as any,
        ],
        created_by: actorId,
      },
    });

    const created = createdResult?.[0];
    if (!created?.id) {
      throw new StudioError(500, "Product draft was created without an id.");
    }
    if (options.length === 0) {
      await syncVariants(scope, created.id, variants);
    } else {
      await replaceOptionsAndVariants(scope, created.id, options, variants);
    }
    if (requestedSellerId) {
      await ensureSellerOffers(
        scope,
        requestedSellerId,
        created.id,
        actorId,
      );
      await provisionOfferStock(
        scope,
        requestedSellerId,
        variants.map((variant) => String(variant.sku ?? "").trim()).filter(Boolean),
      );
    }
    const saved = await loadStudioProduct(scope, mode, sellerId, created.id);
    if (requestedSellerId) {
      const offer = saved.product.offers?.find(
        (row: { seller_id?: string }) => row.seller_id === requestedSellerId,
      );
      if (offer?.id) {
        await recordSellerProductActivity({
          sellerId: requestedSellerId,
          offerId: offer.id,
          productId: created.id,
          actorUserId: actorId,
          actorRole: mode === "admin" ? "admin" : "seller",
          source: mode === "admin" ? "admin_console" : "seller_portal",
          before: null,
          after: {
            title: saved.product.title,
            status: saved.product.status,
            thumbnail: saved.product.thumbnail,
            metadata: saved.product.metadata,
            variant_count: saved.product.variants?.length ?? 0,
            offer_count: saved.product.offers?.length ?? 0,
            seller_provision_reason: clean(input.seller_provision_reason),
          },
        });
      }
    }
    return saved;
  }

  const q = query(scope);
  const { data: products } = await q.graph({
    entity: "product",
    fields: ["id", "title", "status", "thumbnail", "metadata"],
    filters: { id: productId },
  });
  const current = products?.[0];
  if (!current) {
    throw new StudioError(404, "Product not found.");
  }

  if (mode === "vendor") {
    if (!sellerId) {
      throw new StudioError(401, "Seller authentication required.");
    }
    const owned = (await sellerOwnedProductIds(scope, sellerId)).includes(productId);
    if (!owned) {
      throw new StudioError(404, "Product not found.");
    }
  }

  const studioManaged = current.metadata?.buildkart_product_studio === true;
  const currentOptions = await loadCurrentOptions(scope, productId);
  const currentEditorOptions = currentOptions
    .filter((option) => option.name !== "__default__")
    .map((option) => ({
      name: option.name,
      values: option.values,
    }));
  const optionsChanged = !optionsEqual(currentEditorOptions, options);
  if (studioManaged && optionsChanged && options.length === 0) {
    throw new StudioError(
      409,
      "Removing all options from an existing draft is not supported in this slice. Create a new default-only draft instead.",
    );
  }

  // Published or offered products may change presentation fields, but structural
  // variant changes must be deliberate. The UI mirrors this guard; the server
  // remains authoritative for direct API calls.
  if (studioManaged) {
    const loadedCurrent = await loadStudioProduct(
      scope,
      mode === "vendor" ? "admin" : mode,
      mode === "vendor" ? null : sellerId,
      productId,
    );
    const structuralLocked =
      current.status === "published" ||
      (loadedCurrent.product.offers?.length ?? 0) > 0;
    if (structuralLocked) {
      const currentById = new Map<string, { id: string; sku?: string | null }>(
        (loadedCurrent.product.variants ?? []).map((variant: any) => [
          variant.id,
          variant,
        ]),
      );
      const desiredById = new Map(
        variants
          .filter((variant) => Boolean(variant.id))
          .map((variant) => [variant.id as string, variant]),
      );
      if (
        currentById.size !== variants.length ||
        currentById.size !== desiredById.size ||
        [...currentById.keys()].some((id) => !desiredById.has(id))
      ) {
        throw new StudioError(
          409,
          "Adding or removing variants is locked because this product is published or has offers.",
        );
      }
      for (const [id, variant] of desiredById) {
        const previous = currentById.get(id);
        const previousSku = (previous?.sku ?? "").trim();
        const nextSku = (variant.sku ?? "").trim();
        if (previousSku && previousSku !== nextSku) {
          throw new StudioError(
            409,
            "SKU changes are locked because this product is published or has offers.",
          );
        }
      }
      if (optionsChanged) {
        throw new StudioError(
          409,
          "Option axes are locked because this product is published or has offers.",
        );
      }
    }
  }

  if (!studioManaged) {
    if (optionsChanged) {
      throw new StudioError(
        409,
        "Option axes for imported catalogue products are read-only in this slice.",
      );
    }
    const { data: currentVariants } = await q.graph({
      entity: "variant",
      fields: ["id", "sku"],
      filters: { product_id: productId },
      pagination: { take: 500, skip: 0 },
    });
    const currentIds = new Set(
      (currentVariants ?? []).map((variant: any) => variant.id),
    );
    const desiredIds = new Set(
      variants
        .map((variant) => variant.id)
        .filter((id): id is string => Boolean(id)),
    );
    if (
      currentIds.size !== desiredIds.size ||
      [...currentIds].some((id) => !desiredIds.has(id))
    ) {
      throw new StudioError(
        409,
        "Adding or removing variants for imported catalogue products is read-only in this slice.",
      );
    }
    const importedCurrent = await loadStudioProduct(scope, "admin", null, productId);
    const importedLocked =
      current.status === "published" ||
      (importedCurrent.product.offers?.length ?? 0) > 0;
    if (importedLocked) {
      const currentById = new Map<string, { id: string; sku?: string | null }>(
        (currentVariants ?? []).map((variant: any) => [variant.id, variant]),
      );
      for (const variant of variants) {
        if (!variant.id) continue;
        const previous = currentById.get(variant.id);
        const previousSku = (previous?.sku ?? "").trim();
        const nextSku = (variant.sku ?? "").trim();
        if (previousSku && previousSku !== nextSku) {
          throw new StudioError(
            409,
            "SKU changes are locked because this product is published or has offers.",
          );
        }
      }
    }
  }

  const metadata = {
    ...(current.metadata ?? {}),
    buildkart_product_studio: studioManaged,
    brand: clean(input.brand),
    manufacturer: clean(input.manufacturer),
    model_number: clean(input.model_number),
    product_type: clean(input.product_type),
    hsn_code: clean(input.hsn_code),
    unit_of_measure: clean(input.unit_of_measure),
  };

  await updateProductsWorkflow(scope).run({
    input: {
      selector: { id: productId },
      update: {
        title,
        subtitle: clean(input.subtitle),
        description: clean(input.description),
        thumbnail: clean(input.thumbnail),
        hs_code: clean(input.hsn_code),
        category_ids: input.category_id ? [input.category_id] : [],
        tags: tagIds.map((id) => ({ id })),
        metadata,
      } as any,
    },
  });

  const { data: existingAttributes } = await q.graph({
    entity: "product_attribute",
    fields: ["id", "metadata"],
    filters: { product_id: productId },
    pagination: { take: 500, skip: 0 },
  });
  const remove = (existingAttributes ?? [])
    .filter((attribute: any) => attribute?.metadata?.[STUDIO_ATTRIBUTE_FLAG] === true)
    .map((attribute: any) => attribute.id)
    .filter((id: unknown): id is string => Boolean(id));

  if (remove.length > 0 || attributes.length > 0) {
    await createAndLinkProductAttributesToProductWorkflow(scope).run({
      input: {
        product_id: productId,
        remove,
        add: attributes,
        additional_data: {
          source: "product_studio",
          actor_id: actorId,
          actor_role: mode,
        },
      },
    });
  }

  if (studioManaged && optionsChanged) {
    await replaceOptionsAndVariants(scope, productId, options, variants);
  } else {
    await syncVariants(scope, productId, variants);
  }

  const offerSellerId = mode === "admin" ? requestedSellerId : sellerId;
  if (offerSellerId) {
    await ensureSellerOffers(scope, offerSellerId, productId, actorId);
  }

  await recordProductAuditChangeWorkflow(scope).run({
    input: {
      actor_id: actorId,
      changes: [
        {
          product_id: productId,
          internal_note: "Product studio draft saved",
          actions: [
            {
              product_id: productId,
              action: ProductChangeActionType.UPDATE,
              details: {
                source: "product_studio",
                actor_role: mode,
                before: {
                  title: current.title,
                  metadata: current.metadata ?? null,
                },
                after: {
                  title,
                  metadata,
                  tag_ids: tagIds,
                  specification_count: attributes.length,
                  option_count: options.length,
                  variant_count: variants.length,
                  options_changed: optionsChanged,
                  seller_provision: requestedSellerId
                    ? {
                        seller_id: requestedSellerId,
                        reason: clean(input.seller_provision_reason),
                      }
                    : null,
                },
              },
            },
          ],
        },
      ],
    },
  });

  const result = await loadStudioProduct(scope, mode, sellerId, productId);
  if (requestedSellerId) {
    const offer = result.product.offers?.find(
      (row: { seller_id?: string }) => row.seller_id === requestedSellerId,
    );
    if (offer?.id) {
      await recordSellerProductActivity({
        sellerId: requestedSellerId,
        offerId: offer.id,
        productId,
        actorUserId: actorId,
        actorRole: mode === "admin" ? "admin" : "seller",
        source: mode === "admin" ? "admin_console" : "seller_portal",
        before: {
          title: current.title,
          status: current.status,
          thumbnail: current.thumbnail ?? null,
          metadata: current.metadata ?? null,
        },
        after: {
          title: result.product.title,
          status: result.product.status,
          thumbnail: result.product.thumbnail,
          metadata: result.product.metadata,
          variant_count: result.product.variants?.length ?? 0,
          offer_count: result.product.offers?.length ?? 0,
          seller_provision_reason: clean(input.seller_provision_reason),
        },
      });
    }
  }
  return result;
}

export function studioErrorResponse(error: unknown): {
  status: number;
  body: { message: string };
} {
  if (error instanceof StudioError) {
    return { status: error.statusCode, body: { message: error.message } };
  }
  if (error instanceof MedusaError) {
    return { status: 422, body: { message: error.message } };
  }
  const candidate = error as { message?: string };
  return {
    status: 422,
    body: { message: candidate?.message ?? "Could not save the product draft." },
  };
}
