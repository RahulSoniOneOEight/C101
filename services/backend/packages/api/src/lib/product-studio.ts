import type { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  createProductTagsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import {
  createAndLinkProductAttributesToProductWorkflow,
  createProductsWorkflow,
  recordProductAuditChangeWorkflow,
} from "@mercurjs/core/workflows";
import { AttributeType, ProductChangeActionType } from "@mercurjs/types";

export type StudioMode = "admin" | "vendor";

export type StudioSpecInput = {
  name?: string | null;
  value?: string | null;
  unit?: string | null;
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
  seller_id?: string | null;
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

  const metadata = product.metadata ?? {};
  const canEdit =
    mode === "admin" || (owned && String(product.status) === "draft");

  return {
    product: {
      id: product.id,
      title: product.title ?? "",
      subtitle: product.subtitle ?? "",
      description: product.description ?? "",
      status: product.status ?? "draft",
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
      can_edit: canEdit,
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
  const requestedSellerId =
    mode === "admin" ? clean(input.seller_id) ?? null : sellerId;

  if (!productId) {
    const { result } = await createProductsWorkflow(scope).run({
      input: {
        products: [
          {
            title,
            subtitle: clean(input.subtitle) ?? undefined,
            description: clean(input.description) ?? undefined,
            status: "draft",
            thumbnail: clean(input.thumbnail) ?? undefined,
            hs_code: clean(input.hsn_code) ?? undefined,
            category_ids: input.category_id ? [input.category_id] : undefined,
            tags: tagIds.map((id) => ({ id })),
            attributes,
            metadata: {
              buildkart_product_studio: true,
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

    const created = result?.[0];
    if (!created?.id) {
      throw new StudioError(500, "Product draft was created without an id.");
    }
    return loadStudioProduct(scope, mode, sellerId, created.id);
  }

  const q = query(scope);
  const { data: products } = await q.graph({
    entity: "product",
    fields: ["id", "title", "status", "metadata"],
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
    if (String(current.status) !== "draft") {
      throw new StudioError(
        409,
        "Only draft listings can be edited here. Published product changes go through review.",
      );
    }
  }

  const metadata = {
    ...(current.metadata ?? {}),
    buildkart_product_studio: true,
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
                },
              },
            },
          ],
        },
      ],
    },
  });

  return loadStudioProduct(scope, mode, sellerId, productId);
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
