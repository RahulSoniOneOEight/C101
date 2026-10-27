import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Resolve seller IDs to operator-facing store names at read time.
 *
 * The seller module owns the name; order/shipment payloads only carry `seller_id`. Names are
 * joined on read (U-005 D5) so no order, shipment or schema is changed. Missing or soft-deleted
 * sellers are omitted, and the caller falls back to the ID (D1).
 */
export async function loadSellerNames(
  scope: MedusaContainer,
  sellerIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(sellerIds.filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return new Map();

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "deleted_at"],
    filters: { id: ids },
    pagination: { take: Math.max(ids.length, 1), skip: 0 },
  });

  const rows = (data ?? []) as Array<{
    id: string;
    name?: string | null;
    deleted_at?: string | Date | null;
  }>;

  return new Map(
    rows
      .filter((seller) => !seller.deleted_at && Boolean(seller.name?.trim()))
      .map((seller) => [seller.id, (seller.name as string).trim()]),
  );
}

/** Seller name when known, otherwise the raw ID (U-005 D1). */
export function sellerDisplayName(
  names: Map<string, string>,
  sellerId: string,
): string {
  return names.get(sellerId)?.trim() || sellerId;
}
