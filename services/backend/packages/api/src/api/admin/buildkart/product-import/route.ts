import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/core-flows";
import {
  StudioError,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../lib/product-studio";
import { updateOfferPricing } from "../../../../lib/offer-pricing";
import { saveB2bPricing } from "../../../../lib/b2b-pricing";
import { parseImportB2bPricing } from "../../../../lib/product-import-b2b";
import { hasPermission } from "../../../../lib/rbac";

type ImportRow = {
  product_title?: string;
  card_subtitle?: string;
  description?: string;
  category?: string;
  brand?: string;
  manufacturer?: string;
  model_number?: string;
  product_type?: string;
  hsn_code?: string;
  unit_of_measure?: string;
  image_url?: string;
  tags?: string;
  specifications?: string;
  variant_name?: string;
  variant_sku?: string;
  variant_description?: string;
  variant_image_url?: string;
  seller?: string;
  b2c_list_price?: string;
  b2c_selling_price?: string;
  b2b_list_price?: string;
  b2b_selling_price?: string;
  b2b_moq?: string;
  b2b_tiers?: string;
  stock_quantity?: string;
  channel?: string;
};

type ImportBody = {
  mode?: "validate" | "apply";
  rows?: ImportRow[];
};

type RowResult = {
  row: number;
  sku: string;
  status: "ready" | "created" | "failed";
  product_id?: string;
  errors: string[];
};

const clean = (value: unknown) => String(value ?? "").trim();
const moneyMinor = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
};

function parseSpecs(raw: string) {
  return raw
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, value, unit] = entry.split("=");
      return {
        name: clean(name),
        value: clean(value),
        unit: clean(unit),
      };
    })
    .filter((spec) => spec.name && spec.value);
}

/**
 * CSV import for Product Studio. One row = one product with one variant.
 * The imported product travels through the same save path as the studio, so publication,
 * channel assignment, offer provisioning, starter stock and audit are identical.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "master-product.create")) {
    res.status(403).json({ message: "Missing permission: product.create." } as never);
    return;
  }
  const body = (req.body ?? {}) as ImportBody;
  const mode = body.mode === "apply" ? "apply" : "validate";
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
  if (rows.length === 0) {
    res.status(422).json({ message: "No rows supplied." } as never);
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: categories }, { data: sellers }, { data: channels }] =
    await Promise.all([
      query.graph({
        entity: "product_category",
        fields: ["id", "name"],
        pagination: { take: 500, skip: 0 },
      }),
      query.graph({
        entity: "seller",
        fields: ["id", "name"],
        pagination: { take: 200, skip: 0 },
      }),
      query.graph({
        entity: "sales_channel",
        fields: ["id", "name"],
        pagination: { take: 50, skip: 0 },
      }),
    ]);

  const categoryIdByName = new Map<string, string>(
    (categories ?? []).map((row: any) => [
      String(row.name ?? "").trim().toLowerCase(),
      String(row.id),
    ]),
  );
  const sellerIdByName = new Map<string, string>(
    (sellers ?? []).map((row: any) => [
      String(row.name ?? "").trim().toLowerCase(),
      String(row.id),
    ]),
  );
  const b2cChannel = (channels ?? []).find((row: any) =>
    /b2c/i.test(String(row.name ?? "")),
  );
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";

  const results: RowResult[] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2; // header is line 1
    const sku = clean(row.variant_sku);
    const errors: string[] = [];

    const title = clean(row.product_title);
    const variantName = clean(row.variant_name) || "Default";
    const categoryName = clean(row.category);
    const sellerName = clean(row.seller);
    const listMajor = clean(row.b2c_list_price);
    const sellingMajor = clean(row.b2c_selling_price);

    if (!title) errors.push("product_title is required");
    if (!sku) errors.push("variant_sku is required");
    if (!variantName) errors.push("variant_name is required");
    if (!categoryName) errors.push("category is required");
    if (!sellerName) errors.push("seller is required");
    if (!listMajor) errors.push("b2c_list_price is required");
    if (!sellingMajor) errors.push("b2c_selling_price is required");

    const categoryId = categoryIdByName.get(categoryName.toLowerCase());
    const sellerId =
      sellerIdByName.get(sellerName.toLowerCase()) ??
      ((sellers ?? []).find(
        (row: any) => String(row.id).toLowerCase() === sellerName.toLowerCase(),
      )?.id as string | undefined);
    const listMinor = moneyMinor(listMajor);
    const sellingMinor = moneyMinor(sellingMajor);

    if (categoryName && !categoryId) {
      errors.push(`category "${categoryName}" was not found`);
    }
    if (sellerName && !sellerId) {
      errors.push(`seller "${sellerName}" was not found`);
    }
    if (listMajor && listMinor === null) {
      errors.push("b2c_list_price must be a positive number");
    }
    if (sellingMajor && sellingMinor === null) {
      errors.push("b2c_selling_price must be a positive number");
    }
    if (listMinor !== null && sellingMinor !== null && sellingMinor > listMinor) {
      errors.push("b2c_selling_price cannot exceed b2c_list_price");
    }

    // Validate B2B columns before any write. Apply mode must fail here too, or a bad tier would
    // throw after the product and B2C price were already created.
    const b2b = parseImportB2bPricing(row);
    errors.push(...b2b.errors);

    if (sku) {
      const { data: existing } = await query.graph({
        entity: "variant",
        fields: ["id", "sku"],
        filters: { sku },
        pagination: { take: 1, skip: 0 },
      });
      if ((existing ?? []).length > 0) {
        errors.push(`SKU "${sku}" already exists - edit that product in the studio`);
      }
    }

    if (errors.length > 0) {
      results.push({ row: rowNumber, sku, status: "failed", errors });
      continue;
    }
    if (mode === "validate") {
      results.push({ row: rowNumber, sku, status: "ready", errors: [] });
      continue;
    }

    try {
      const input: StudioSaveInput = {
        title,
        subtitle: clean(row.card_subtitle) || null,
        description: clean(row.description) || null,
        category_id: categoryId ?? null,
        brand: clean(row.brand) || null,
        manufacturer: clean(row.manufacturer) || null,
        model_number: clean(row.model_number) || null,
        product_type: clean(row.product_type) || null,
        hsn_code: clean(row.hsn_code) || null,
        unit_of_measure: clean(row.unit_of_measure) || null,
        thumbnail: clean(row.image_url) || null,
        // A seller-created product is linked at product level, so the seller portal can find it.
        // CSV import is admin-run and must set the same link explicitly, with an audit reason.
        seller_id: sellerId,
        seller_provision_reason: `CSV import (${sku})`,
        tags: clean(row.tags)
          ? clean(row.tags)
              .split(";")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
        specifications: parseSpecs(clean(row.specifications)),
        variants: [
          {
            title: variantName,
            sku,
            details: clean(row.variant_description) || variantName,
            image_url: clean(row.variant_image_url) || null,
            seller_id: sellerId,
          },
        ],
        sales_channel_ids: (() => {
          const wanted = clean(row.channel).toLowerCase();
          const ids: string[] = [];
          if (wanted !== "b2b" && b2cChannel?.id) ids.push(String(b2cChannel.id));
          if (wanted === "b2b" || wanted === "both") {
            const b2bChannel = (channels ?? []).find((candidate: any) =>
              /b2b/i.test(String(candidate.name ?? "")),
            );
            if (b2bChannel?.id) ids.push(String(b2bChannel.id));
          }
          return ids;
        })(),
      };

      const saved = await saveStudioProduct(
        req.scope,
        "admin",
        actorId,
        null,
        null,
        input,
      );
      const productId = saved.product.id;
      const offer = (saved.product.offers ?? []).find(
        (candidate: { sku?: string; id?: string }) =>
          candidate.sku === sku && candidate.id,
      );

      if (!offer?.id) {
        throw new StudioError(
          500,
          "Product was created but its seller offer was not provisioned.",
        );
      }

      // Price rows store major units (Medusa money contract); this API's boundary
      // is minor units, so pass the paise value and let updateOfferPricing convert.
      await updateOfferPricing(req.scope, offer.id, [
        { amount: sellingMinor!, currency_code: "inr" },
      ], {
        list_price_minor: listMinor!,
        gst_inclusive: true,
        enforce_policy: true,
        starts_at: null,
        ends_at: null,
      });

      if (b2b.pricing) {
        await saveB2bPricing(req.scope, offer.id, {
          ...b2b.pricing,
          starts_at: null,
          ends_at: null,
          gst_inclusive: true,
          reason: `CSV import (${sku})`,
        });
      }

      const requestedStock = Number(clean(row.stock_quantity));
      if (Number.isInteger(requestedStock) && requestedStock >= 0) {
        try {
          const { data: sellerRows } = await query.graph({
            entity: "seller",
            fields: ["id", "stock_locations.id"],
            filters: { id: sellerId },
            pagination: { take: 1, skip: 0 },
          });
          const locationId =
            ((sellerRows?.[0] as { stock_locations?: Array<{ id?: string }> })
              ?.stock_locations ?? [])[0]?.id ?? null;
          const { data: items } = await query.graph({
            entity: "inventory_item",
            fields: ["id"],
            filters: { sku },
            pagination: { take: 1, skip: 0 },
          });
          const inventoryItemId = (items?.[0] as { id?: string } | undefined)?.id;
          if (locationId && inventoryItemId) {
            const { data: levels } = await query.graph({
              entity: "inventory_level",
              fields: ["id"],
              filters: {
                inventory_item_id: inventoryItemId,
                location_id: locationId,
              },
              pagination: { take: 1, skip: 0 },
            });
            const levelId = (levels?.[0] as { id?: string } | undefined)?.id;
            if (levelId) {
              await updateInventoryLevelsWorkflow(req.scope).run({
                input: {
                  updates: [
                    {
                      inventory_item_id: inventoryItemId,
                      location_id: locationId,
                      stocked_quantity: requestedStock,
                    },
                  ],
                } as never,
              });
            }
          }
        } catch (stockError) {
          console.warn("[product-import] stock override skipped:", (stockError as Error).message);
        }
      }

      results.push({ row: rowNumber, sku, status: "created", product_id: productId, errors: [] });
    } catch (error) {
      const { body: failure } = studioErrorResponse(error);
      results.push({
        row: rowNumber,
        sku,
        status: "failed",
        errors: [failure.message],
      });
    }
  }

  const created = results.filter((row) => row.status === "created").length;
  const ready = results.filter((row) => row.status === "ready").length;
  const failed = results.filter((row) => row.status === "failed").length;
  res.json({
    mode,
    totals: { rows: results.length, created, ready, failed },
    results,
  } as never);
}
