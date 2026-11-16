import type { StoreCart, StoreOffer } from "../medusa/store-client.js";
import type { PreviewCheckoutStore } from "../store/preview-checkout-store.js";
import type { TrytonErp } from "../tryton/erp.js";

export class PreviewCheckoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const reviewRequired = () => new PreviewCheckoutError(
  409,
  "preview-checkout-review-required",
  "Checkout stock or payment outcome is uncertain; an operator must reconcile it before retrying.",
);

/** The current preview journal supports exactly one cart line. Never silently reserve the first SKU. */
export function resolvePreviewLine(
  cart: StoreCart,
  offers: StoreOffer[],
): { sku: string; quantity: number } {
  if (cart.items?.length !== 1) {
    throw new PreviewCheckoutError(
      409, "preview-cart-unsupported",
      "This isolated preview supports exactly one cart line; no payment or stock was changed.",
    );
  }
  const item = cart.items[0];
  const offerId = item.metadata?.offer_id;
  const matched = offers.filter((offer) => offer.id === offerId);
  const offer = matched.length === 1 ? matched[0] : undefined;
  const sku = offer?.sku?.trim();
  if (!offerId || !offer || !sku ||
      !item.product_id || !item.variant_id || !item.seller_id ||
      offer.product_id !== item.product_id ||
      offer.variant_id !== item.variant_id ||
      offer.seller_id !== item.seller_id ||
      (item.sku && item.sku !== sku) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    throw new PreviewCheckoutError(
      409, "preview-cart-unresolved",
      "Cart offer, SKU, seller or quantity could not be verified; no payment or stock was changed.",
    );
  }
  return { sku, quantity: item.quantity };
}

type PreviewErp = Pick<TrytonErp, "stockSummary" | "reserve" | "commit" | "readStockMove">;
type PreviewStore = Pick<
  PreviewCheckoutStore, "get" | "createIntent" | "advance" | "needsReview" | "withSkuLock"
>;

/** A confirmed replay must still have its recorded assigned Tryton move. */
export async function verifyPreviewReplay(
  checkoutRef: string,
  moveId: number | string | null,
  store: PreviewStore,
  erp: PreviewErp,
): Promise<boolean> {
  const record = await store.get(checkoutRef);
  const expectedMoveId = Number(moveId);
  if (!record || record.status !== "confirmed" ||
      !record.move_id || !Number.isSafeInteger(expectedMoveId) ||
      record.move_id !== expectedMoveId) return false;
  try {
    const move = await erp.readStockMove(record.move_id);
    return move?.moveId === record.move_id &&
      move.state === "assigned" && move.quantity === record.quantity;
  } catch {
    return false;
  }
}

/**
 * Reserve and verify a single real Tryton move before the callback can initialize payment.
 * An uncertain remote outcome is never retried automatically or released speculatively.
 */
export async function runPreviewCheckout<T>(input: {
  checkoutRef: string;
  sku: string;
  quantity: number;
  store: PreviewStore;
  erp: PreviewErp;
  onCommitted: (moveId: number) => Promise<void>;
  complete: () => Promise<{ confirmed: boolean; value: T }>;
}): Promise<T> {
  const { checkoutRef, sku, quantity, store, erp } = input;
  const existing = await store.get(checkoutRef);
  if (existing) {
    if (existing.status !== "confirmed" && existing.status !== "needs_review") {
      await store.needsReview(checkoutRef);
    }
    throw reviewRequired();
  }
  let intentWritten = false;
  try {
    return await store.withSkuLock(sku, async () => {
      // This lock serializes the preview's own ATP -> assigned transition across API
      // processes, not arbitrary external writers against the same Tryton product.
      const stock = await erp.stockSummary(sku);
      const location = stock.locations?.find(
        (entry) => Number.isSafeInteger(entry.id) && entry.id > 0 &&
          Number.isFinite(entry.atp) && entry.atp >= quantity,
      );
      if (!stock.found || !stock.complete || !location ||
          !Number.isFinite(stock.atp) || stock.atp < quantity) {
        throw new PreviewCheckoutError(
          409, "insufficient-tryton-stock",
          "Tryton has insufficient available stock; no payment or stock was changed.",
        );
      }
      await store.createIntent(checkoutRef, sku, quantity);
      intentWritten = true;
      await store.advance(checkoutRef, "intent", "creating");
      const moveId = await erp.reserve(checkoutRef, sku, quantity, location.id);
      await store.advance(checkoutRef, "creating", "draft", moveId);
      await store.advance(checkoutRef, "draft", "committing");
      await erp.commit(moveId);
      const move = await erp.readStockMove(moveId);
      if (move?.moveId !== moveId || move.state !== "assigned" || move.quantity !== quantity) {
        throw new Error("Tryton move was not assigned with the requested quantity");
      }
      await store.advance(checkoutRef, "committing", "committed");
      return moveId;
    }).then(async (moveId) => {
      await input.onCommitted(moveId);
      // This is written before any payment/session side effect or Medusa completion.
      await store.advance(checkoutRef, "committed", "completing");
      const result = await input.complete();
      if (!result.confirmed) throw new Error("Medusa completion was not confirmed");
      await store.advance(checkoutRef, "completing", "confirmed");
      return result.value;
    });
  } catch (error) {
    if (!intentWritten) {
      if (error instanceof PreviewCheckoutError) throw error;
      throw new PreviewCheckoutError(502, "preview-stock-unavailable", "Tryton stock could not be verified.");
    }
    await store.needsReview(checkoutRef).catch(() => undefined);
    console.warn("[experience-api] Preview checkout needs review", {
      checkoutRef,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw reviewRequired();
  }
}
