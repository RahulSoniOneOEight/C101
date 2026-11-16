import { expect, test } from "bun:test";
import { loadConfig } from "../config.js";
import type { StoreCart, StoreOffer } from "../medusa/store-client.js";
import type {
  PreviewCheckoutRecord,
  PreviewCheckoutStatus,
  PreviewCheckoutStore,
} from "../store/preview-checkout-store.js";
import type { TrytonErp } from "../tryton/erp.js";
import {
  PreviewCheckoutError,
  resolvePreviewLine,
  runPreviewCheckout,
  verifyPreviewReplay,
} from "./preview-reservation.js";

const line = {
  id: "line-1", title: "Cement", product_title: "Cement",
  product_id: "prod-1", variant_id: "variant-1", seller_id: "seller-1",
  sku: "SKU-1", quantity: 2, unit_price: 100, metadata: { offer_id: "offer-1" },
};
const cart = {
  id: "cart-1", currency_code: "inr", region_id: "region-1", items: [line],
  subtotal: 200, total: 200,
} as StoreCart;
const offer = {
  id: "offer-1", sku: "SKU-1", seller_id: "seller-1", product_id: "prod-1",
  variant_id: "variant-1", seller: null, calculated_price: null,
} as StoreOffer;

class FakeStore {
  record: PreviewCheckoutRecord | null = null;
  actions: string[] = [];

  async get(): Promise<PreviewCheckoutRecord | null> {
    this.actions.push("get");
    return this.record;
  }
  async withSkuLock<T>(sku: string, operation: () => Promise<T>): Promise<T> {
    this.actions.push(`lock:${sku}`);
    try { return await operation(); }
    finally { this.actions.push("unlock"); }
  }
  async createIntent(ref: string, sku: string, quantity: number): Promise<void> {
    if (this.record) throw new Error("duplicate");
    this.record = { checkout_ref: ref, sku, quantity, status: "intent", move_id: null };
    this.actions.push("intent");
  }
  async advance(
    _ref: string, expected: PreviewCheckoutStatus, next: PreviewCheckoutStatus, moveId?: number,
  ): Promise<void> {
    if (!this.record || this.record.status !== expected) throw new Error("invalid transition");
    this.record.status = next;
    if (moveId !== undefined) this.record.move_id = moveId;
    this.actions.push(next);
  }
  async needsReview(): Promise<void> {
    if (this.record) this.record.status = "needs_review";
    this.actions.push("needs_review");
  }
}

function scenario() {
  const store = new FakeStore();
  const actions = store.actions;
  const erp = {
    stockSummary: async () => {
      actions.push("atp");
      return { found: true, complete: true, atp: 5, locations: [{ id: 7, atp: 5 }] };
    },
    reserve: async (_ref: string, _sku: string, _qty: number, locationId: number) => {
      actions.push(`reserve:${locationId}`);
      return 123;
    },
    commit: async () => { actions.push("tryton-assign"); },
    readStockMove: async () => {
      actions.push("tryton-read");
      return { moveId: 123, state: "assigned", quantity: 2 };
    },
  } as unknown as Pick<TrytonErp, "stockSummary" | "reserve" | "commit" | "readStockMove">;
  const input = {
    checkoutRef: "cart-1", sku: "SKU-1", quantity: 2,
    store: store as unknown as PreviewCheckoutStore,
    erp,
    onCommitted: async () => { actions.push("correlate-move"); },
    complete: async () => {
      actions.push("payment-and-completion");
      return { confirmed: true, value: "group-1" };
    },
  };
  return { store, actions, erp, input };
}

test("opt-in is off by default; rejects staging, production and shared service endpoints", () => {
  expect(loadConfig({ BUILDKART_ENVIRONMENT: "staging" }).previewCheckoutTrytonEnabled).toBe(false);
  const enabled = {
    BUILDKART_PREVIEW_CHECKOUT_TRYTON: "true",
    BUILDKART_PREVIEW_ISOLATION_ACK: "isolated-preview-only",
    MEDUSA_BASE_URL: "http://localhost:9010",
    TRYTON_BASE_URL: "http://localhost:8010",
    EXPERIENCE_DATABASE_URL: "postgres://localhost/preview",
  };
  expect(() => loadConfig({ ...enabled, BUILDKART_ENVIRONMENT: "staging" })).toThrow();
  expect(() => loadConfig({ ...enabled, BUILDKART_ENVIRONMENT: "production" })).toThrow();
  expect(() => loadConfig({
    ...enabled, BUILDKART_ENVIRONMENT: "integration",
    BUILDKART_PREVIEW_ISOLATION_ACK: "",
  })).toThrow();
  expect(() => loadConfig({
    ...enabled, BUILDKART_ENVIRONMENT: "integration",
    MEDUSA_BASE_URL: "https://ops-staging.pinakaplay.cloud",
  })).toThrow();
  expect(loadConfig({ ...enabled, BUILDKART_ENVIRONMENT: "integration" })
    .previewCheckoutTrytonEnabled).toBe(true);
});

test("single line resolves only its own matching offer and seller", () => {
  expect(resolvePreviewLine(cart, [offer])).toEqual({ sku: "SKU-1", quantity: 2 });
  expect(() => resolvePreviewLine({ ...cart, items: [] }, [offer])).toThrow(PreviewCheckoutError);
  expect(() => resolvePreviewLine({ ...cart, items: [line, { ...line, id: "line-2" }] }, [offer]))
    .toThrow(/exactly one cart line/);
  expect(() => resolvePreviewLine(cart, [])).toThrow();
  expect(() => resolvePreviewLine(cart, [offer, offer])).toThrow();
  expect(() => resolvePreviewLine(cart, [{ ...offer, seller_id: "another-seller" }])).toThrow();
  expect(() => resolvePreviewLine({ ...cart, items: [{ ...line, quantity: 0 }] }, [offer])).toThrow();
});

test("verified assigned move precedes payment and confirmation; duplicate cannot create a move", async () => {
  const { store, actions, input, erp } = scenario();
  expect(await runPreviewCheckout(input)).toBe("group-1");
  expect(actions).toEqual([
    "get", "lock:SKU-1", "atp", "intent", "creating", "reserve:7", "draft",
    "committing", "tryton-assign", "tryton-read", "committed", "unlock",
    "correlate-move", "completing", "payment-and-completion", "confirmed",
  ]);
  expect(await verifyPreviewReplay("cart-1", 123, input.store, erp)).toBe(true);
  expect(await verifyPreviewReplay("cart-1", "123", input.store, erp)).toBe(true);
  expect(await verifyPreviewReplay("cart-1", 124, input.store, erp)).toBe(false);
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record?.status).toBe("confirmed");
  expect(actions.filter((action) => action.startsWith("reserve:"))).toHaveLength(1);
});

test("insufficient Tryton ATP does not create an intent, move or payment", async () => {
  const { store, actions, input } = scenario();
  input.erp.stockSummary = async () => ({ found: true, complete: true, atp: 1, locations: [{ id: 7, atp: 1 }] }) as Awaited<
    ReturnType<TrytonErp["stockSummary"]>
  >;
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "insufficient-tryton-stock",
  });
  expect(store.record).toBeNull();
  expect(actions.some((action) => action.startsWith("reserve:"))).toBe(false);
  expect(actions).not.toContain("payment-and-completion");
});

test("aggregate ATP across split locations cannot reserve from an empty location", async () => {
  const { store, actions, input } = scenario();
  input.erp.stockSummary = async () => ({
    found: true, complete: true, atp: 4, locations: [{ id: 7, atp: 1 }, { id: 8, atp: 1 }],
  }) as Awaited<ReturnType<TrytonErp["stockSummary"]>>;
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({ code: "insufficient-tryton-stock" });
  expect(store.record).toBeNull();
  expect(actions).not.toContain("payment-and-completion");
});

test("truncated Tryton history cannot establish ATP", async () => {
  const { store, actions, input } = scenario();
  input.erp.stockSummary = async () => ({
    found: true, complete: false, atp: 100, locations: [{ id: 7, atp: 100 }],
  }) as Awaited<ReturnType<TrytonErp["stockSummary"]>>;
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({ code: "insufficient-tryton-stock" });
  expect(store.record).toBeNull();
  expect(actions).not.toContain("payment-and-completion");
});

test("restart after an interrupted intent does not create another move", async () => {
  const { store, actions, input } = scenario();
  store.record = {
    checkout_ref: "cart-1", sku: "SKU-1", quantity: 2, move_id: null, status: "creating",
  };
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record.status).toBe("needs_review");
  expect(actions).not.toContain("atp");
  expect(actions).not.toContain("payment-and-completion");
});

test("uncertain Tryton move creation is journaled, blocked on retry, never paid", async () => {
  const { store, actions, input } = scenario();
  input.erp.reserve = async () => {
    actions.push("reserve-attempt");
    throw new Error("timeout after create");
  };
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record?.status).toBe("needs_review");
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(actions).not.toContain("payment-and-completion");
  expect(actions.filter((action) => action === "reserve-attempt")).toHaveLength(1);
});

test("uncertain assign or wrong quantity blocks payment and replay", async () => {
  const { store, actions, input, erp } = scenario();
  input.erp.readStockMove = async () => ({ moveId: 123, state: "draft", quantity: 2 });
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record).toMatchObject({ status: "needs_review", move_id: 123 });
  expect(await verifyPreviewReplay("cart-1", 123, input.store, erp)).toBe(false);
  expect(actions).not.toContain("payment-and-completion");
});

test("Tryton assign timeout keeps the durable move for operator review", async () => {
  const { store, actions, input } = scenario();
  input.erp.commit = async () => { throw new Error("assign timed out"); };
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record).toMatchObject({ status: "needs_review", move_id: 123 });
  expect(actions).not.toContain("payment-and-completion");
});

test("correlation failure keeps the assigned move and does not create payment", async () => {
  const { store, actions, input } = scenario();
  input.onCommitted = async () => { throw new Error("correlation database unavailable"); };
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record).toMatchObject({ status: "needs_review", move_id: 123 });
  expect(actions).not.toContain("payment-and-completion");
});

test("ambiguous Medusa completion remains assigned and cannot re-submit", async () => {
  const { store, actions, input } = scenario();
  input.complete = async () => {
    actions.push("payment-and-completion");
    throw new Error("Medusa timed out after possibly creating order");
  };
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record).toMatchObject({ status: "needs_review", move_id: 123 });
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(actions.filter((action) => action === "payment-and-completion")).toHaveLength(1);
});

test("a non-order response cannot be reported as confirmation", async () => {
  const { store, input } = scenario();
  input.complete = async () => ({ confirmed: false, value: "cart-error" });
  await expect(runPreviewCheckout(input)).rejects.toMatchObject({
    code: "preview-checkout-review-required",
  });
  expect(store.record?.status).toBe("needs_review");
});
