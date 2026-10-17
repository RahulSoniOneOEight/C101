import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Root commerce categories for editorial reference pickers.
 *
 * Category identity, hierarchy and membership stay Medusa-owned; this exposes only the read-only
 * identity an operator needs to attach a category banner to the right category. Nothing here is
 * editable from the CMS.
 */
export interface AdminCategoryListResponse {
  categories: Array<{
    id: string;
    name: string;
    handle: string | null;
    parent_category_id: string | null;
  }>;
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminCategoryListResponse>,
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "parent_category_id", "rank"],
    pagination: { take: 200, skip: 0 },
  });

  const categories = (data as Array<Record<string, unknown>>)
    .filter((category) => !category.parent_category_id)
    .sort((left, right) => Number(left.rank ?? 0) - Number(right.rank ?? 0))
    .map((category) => ({
      id: String(category.id),
      name: String(category.name ?? ""),
      handle: typeof category.handle === "string" ? category.handle : null,
      parent_category_id: null,
    }));

  res.json({ categories });
}
