import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  StudioError,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../lib/product-studio";
import { updateOfferPricing } from "../../../../lib/offer-pricing";
import { saveB2bPricing } from "../../../../lib/b2b-pricing";
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
    const sellerId = sellerIdByName.get(sellerName.toLowerCase());
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
        sales_channel_ids: b2cChannel?.id ? [String(b2cChannel.id)] : [],
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

      // Price rows store major units (Medusa money contract); the list price snapshot is minor.
      await updateOfferPricing(req.scope, offer.id, [
        { amount: Number(sellingMajor), currency_code: "inr" },
      ], {
        list_price_minor: listMinor!,
        gst_inclusive: true,
        enforce_policy: true,
        starts_at: null,
        ends_at: null,
      });

      const b2bSelling = moneyMinor(clean(row.b2b_selling_price));
      if (b2bSelling !== null) {
        await saveB2bPricing(req.scope, offer.id, {
          amount: b2bSelling,
          list_price_minor: moneyMinor(clean(row.b2b_list_price)) ?? b2bSelling,
          moq: Number(clean(row.b2b_moq)) || 1,
          tiers: [],
          starts_at: null,
          ends_at: null,
          gst_inclusive: true,
          reason: `CSV import (${sku})`,
        });
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
