import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { experienceAdminFetch } from "../../../../lib/experience-admin";

type SellerActivityEvent = {
  id: string;
  event_type: string;
  aggregate_id: string;
  occurred_at: string;
  payload: {
    seller_id?: string;
    offer_id?: string;
    product_id?: string | null;
    actor_user_id?: string | null;
    actor_role?: string;
    channel?: "b2c" | "b2b";
    source?: string;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  };
};

type SellerRow = { id: string; name?: string | null };
type OfferRow = {
  id: string;
  seller_id?: string | null;
  product_id?: string | null;
  sku?: string | null;
};
type ProductRow = { id: string; title?: string | null; handle?: string | null };
type PersonRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

const uniqueIds = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const personName = (row?: PersonRow): string | null => {
  const parts = [row?.first_name, row?.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return row?.email ?? null;
};

const actorKind = (id: string): "admin" | "seller" | "unknown" => {
  if (id.startsWith("user_")) return "admin";
  if (id.startsWith("mem_")) return "seller";
  return "unknown";
};

const looksLikeB2bSnapshot = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    "price_list_id" in snapshot ||
    "configured" in snapshot ||
    "moq" in snapshot ||
    (Array.isArray(snapshot.tiers) && !("prices" in snapshot))
  );
};

const inferChannel = (event: SellerActivityEvent): "b2c" | "b2b" => {
  if (event.payload.channel === "b2c" || event.payload.channel === "b2b") {
    return event.payload.channel;
  }
  return looksLikeB2bSnapshot(event.payload.before) ||
    looksLikeB2bSnapshot(event.payload.after)
    ? "b2b"
    : "b2c";
};

async function loadByIds<T>(
  scope: MedusaContainer,
  entity: string,
  fields: string[],
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity,
    fields,
    filters: { id: ids },
    pagination: { take: Math.min(ids.length, 500), skip: 0 },
    // Audit rows must still resolve names after a seller, offer or product is archived.
    withDeleted: true,
  });
  return (data ?? []) as T[];
}

async function enrichEvents(
  scope: MedusaContainer,
  events: SellerActivityEvent[],
): Promise<Array<SellerActivityEvent & Record<string, unknown>>> {
  try {
    const sellerIds = uniqueIds(events.map((event) => event.payload.seller_id));
    const offerIds = uniqueIds(
      events.map((event) => event.payload.offer_id ?? event.aggregate_id),
    );
    const actorIds = uniqueIds(
      events.map((event) => event.payload.actor_user_id),
    );
    const adminActorIds = actorIds.filter((id) => id.startsWith("user_"));
    const sellerActorIds = actorIds.filter((id) => id.startsWith("mem_"));

    const [sellers, offers, admins, members] = await Promise.all([
      loadByIds<SellerRow>(scope, "seller", ["id", "name"], sellerIds),
      loadByIds<OfferRow>(
        scope,
        "offer",
        ["id", "seller_id", "product_id", "sku"],
        offerIds,
      ),
      loadByIds<PersonRow>(
        scope,
        "user",
        ["id", "first_name", "last_name", "email"],
        adminActorIds,
      ),
      loadByIds<PersonRow>(
        scope,
        "member",
        ["id", "first_name", "last_name", "email"],
        sellerActorIds,
      ),
    ]);

    const productIds = uniqueIds([
      ...events.map((event) => event.payload.product_id),
      ...offers.map((offer) => offer.product_id),
    ]);
    const products = await loadByIds<ProductRow>(
      scope,
      "product",
      ["id", "title", "handle"],
      productIds,
    );

    const sellersById = new Map(sellers.map((seller) => [seller.id, seller]));
    const offersById = new Map(offers.map((offer) => [offer.id, offer]));
    const productsById = new Map(products.map((product) => [product.id, product]));
    const actorsById = new Map(
      [...admins, ...members].map((actor) => [actor.id, actor]),
    );

    return events.map((event) => {
      const sellerId = event.payload.seller_id;
      const offerId = event.payload.offer_id ?? event.aggregate_id;
      const offer = offersById.get(offerId);
      const productId = event.payload.product_id ?? offer?.product_id ?? null;
      const product = productId ? productsById.get(productId) : undefined;
      const actorId = event.payload.actor_user_id ?? null;
      const actor = actorId ? actorsById.get(actorId) : undefined;
      const seller = sellerId ? sellersById.get(sellerId) : undefined;

      return {
        ...event,
        channel: inferChannel(event),
        seller: sellerId
          ? { id: sellerId, name: seller?.name ?? null }
          : null,
        offer: offerId
          ? {
              id: offerId,
              sku: offer?.sku ?? null,
              product_id: offer?.product_id ?? productId,
            }
          : null,
        product: product
          ? {
              id: product.id,
              title: product.title ?? null,
              handle: product.handle ?? null,
            }
          : null,
        actor: actorId
          ? {
              id: actorId,
              name: personName(actor),
              email: actor?.email ?? null,
              kind: actorKind(actorId),
            }
          : null,
      };
    });
  } catch {
    // The audit feed must stay usable even when display-name enrichment fails.
    return events.map((event) => ({ ...event, channel: inferChannel(event) }));
  }
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const params = new URLSearchParams();
  const limit = String(req.query.limit ?? "100");
  const eventType = String(req.query.event_type ?? "seller.");
  params.set("limit", limit);
  params.set("event_type", eventType);
  const result = await experienceAdminFetch(
    "/v1/admin/seller-activity",
    {
      actorId: req.auth_context?.actor_id,
      query: params.toString(),
    },
  );
  if (result.status >= 400) {
    res.status(result.status).json(result.body);
    return;
  }
  const body = (result.body ?? {}) as {
    items?: SellerActivityEvent[];
    [key: string]: unknown;
  };
  const items = Array.isArray(body.items)
    ? await enrichEvents(req.scope, body.items)
    : [];
  res.status(result.status).json({ ...body, items });
};
