import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";

type CartRow = {
  id: string;
  items?: Array<{
    seller_id?: string | null;
    offer?: { seller_id?: string | null } | null;
  }>;
};

type OptionMeta = {
  id: string;
  seller?: { id?: string; name?: string } | null;
  type?: Record<string, unknown> | null;
};

/**
 * Store shipping options with calculated prices.
 *
 * Mercur's storefront workflow (`listSellerShippingOptionsForCartWorkflow`)
 * reads `calculated_price` from the Pricing Module, which cannot price a
 * provider-calculated option. This project route overrides `/store/shipping-options`
 * and prices every option through Medusa's calculated-shipping workflow, then
 * groups the result by seller to keep the storefront contract unchanged.
 *
 * Only sellers present in the cart are returned.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const cartId =
    typeof req.query.cart_id === "string" ? req.query.cart_id : "";
  if (!cartId) {
    res.status(400).json({ message: "cart_id is required." } as never);
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["id", "items.seller_id", "items.offer.seller_id"],
  });
  const cart = (carts as CartRow[])[0];
  if (!cart) {
    res.status(404).json({ message: "Cart not found." } as never);
    return;
  }

  const sellerIds = new Set<string>();
  for (const item of cart.items ?? []) {
    const sellerId = item.seller_id ?? item.offer?.seller_id ?? null;
    if (sellerId) sellerIds.add(sellerId);
  }
  if (sellerIds.size === 0) {
    res.json({ shipping_options: {} } as never);
    return;
  }

  const { result } = await listShippingOptionsForCartWithPricingWorkflow(
    req.scope,
  ).run({
    input: {
      cart_id: cartId,
      is_return: req.query.is_return === "true",
    },
  });

  const options = (result as Array<Record<string, any>>).filter(Boolean);
  const optionIds = options.map((option) => option.id).filter(Boolean);
  const { data: metadata } = optionIds.length
    ? await query.graph({
        entity: "shipping_option",
        filters: { id: optionIds },
        fields: [
          "id",
          "type.id",
          "type.label",
          "type.description",
          "type.code",
          "seller.id",
          "seller.name",
        ],
      })
    : { data: [] as OptionMeta[] };
  const metaById = new Map(
    (metadata as OptionMeta[]).map((row) => [row.id, row]),
  );

  const grouped: Record<string, Array<Record<string, unknown>>> = {};
  for (const option of options) {
    const meta = metaById.get(option.id);
    const sellerId = meta?.seller?.id ?? null;
    if (!sellerId || !sellerIds.has(sellerId)) continue;

    const calculated = option.calculated_price?.calculated_amount;
    const amount =
      typeof calculated === "number" ? calculated : option.amount ?? 0;

    const list = grouped[sellerId] ?? [];
    list.push({
      ...option,
      amount,
      type: meta?.type ?? null,
      seller: meta?.seller ?? { id: sellerId, name: sellerId },
    });
    grouped[sellerId] = list;
  }

  for (const list of Object.values(grouped)) {
    list.sort(
      (a: any, b: any) =>
        Number(a.amount ?? 0) - Number(b.amount ?? 0) ||
        String(a.name ?? "").localeCompare(String(b.name ?? "")) ||
        String(a.id).localeCompare(String(b.id)),
    );
  }

  res.json({ shipping_options: grouped } as never);
}
