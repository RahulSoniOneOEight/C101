import { experienceAdminFetch } from "./experience-admin";

export interface SellerPriceActivityInput {
  sellerId: string;
  offerId: string;
  productId?: string | null;
  actorUserId?: string | null;
  actorRole: "admin" | "seller";
  source: "admin_console" | "seller_portal";
  reason?: string | null;
  actingForSellerId?: string | null;
  reference?: string | null;
  correlationId?: string | null;
  before: unknown;
  after: unknown;
}

export async function recordSellerPriceActivity(
  input: SellerPriceActivityInput,
): Promise<{ recorded: boolean; eventId?: string; error?: string }> {
  try {
    const result = await experienceAdminFetch("/v1/internal/seller-activity", {
      method: "POST",
      actorId: input.actorUserId ?? input.sellerId,
      sellerId: input.sellerId,
      body: {
        event_type: "seller.offer.price_changed",
        seller_id: input.sellerId,
        offer_id: input.offerId,
        product_id: input.productId ?? null,
        actor_user_id: input.actorUserId ?? null,
        actor_role: input.actorRole,
        source: input.source,
        reason: input.reason ?? null,
        acting_for_seller_id: input.actingForSellerId ?? null,
        reference: input.reference ?? null,
        before: input.before,
        after: input.after,
        correlation_id: input.correlationId ?? null,
      },
    });
    if (result.status >= 400) {
      return {
        recorded: false,
        error: `Activity append failed (${result.status}).`,
      };
    }
    const event = result.body.event as { id?: string } | undefined;
    return { recorded: true, eventId: event?.id };
  } catch (error) {
    return { recorded: false, error: (error as Error).message };
  }
}
