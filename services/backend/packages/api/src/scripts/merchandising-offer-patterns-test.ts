/**
 * CHG-030 — prove every offer pattern against the real promotion engine.
 *
 * Creates throwaway `OFFTEST-*` promotions, computes cart actions, asserts, then hard-deletes.
 * Also pins the two documented traps so a future change cannot silently reintroduce them.
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createCampaignsWorkflow,
  createPromotionsWorkflow,
  deleteCampaignsWorkflow,
  deletePromotionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { buildOffer } from "../staging-merchandising/offer-patterns";

interface ComputeAction {
  action: string;
  amount?: number;
  item_id?: string;
  code?: string;
}

export default async function merchandisingOfferPatternsTest({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const promotionService = container.resolve(Modules.PROMOTION) as {
    computeActions(codes: string[], context: Record<string, unknown>): Promise<ComputeAction[]>;
  };
  const productService = container.resolve(Modules.PRODUCT) as {
    listProductCategories(filters: Record<string, unknown>): Promise<{ id: string; name: string }[]>;
  };
  const customerService = container.resolve(Modules.CUSTOMER) as {
    listCustomerGroups(filters: Record<string, unknown>): Promise<{ id: string }[]>;
  };

  const [group] = await customerService.listCustomerGroups({ name: "trade-verified" });
  const [category] = await productService.listProductCategories({ name: "Building Materials" });

  const promotionIds: string[] = [];
  const campaignIds: string[] = [];

  const create = async (payload: Record<string, unknown>) => {
    const { result } = await createPromotionsWorkflow(container).run({
      input: { promotionsData: [payload as never] },
    });
    promotionIds.push(result[0].id);
    return result[0];
  };

  /**
   * Shipping promotions compete for the same shipping method: a 100% discount consumes the method,
   * so any later shipping promotion computes zero. Retire each one before creating the next.
   */
  const remove = async (id: string) => {
    await deletePromotionsWorkflow(container).run({ input: { ids: [id] } });
    const index = promotionIds.indexOf(id);
    if (index >= 0) promotionIds.splice(index, 1);
  };

  const settle = (list: ComputeAction[], code: string) =>
    list.filter((entry) => entry.action.endsWith("Adjustment") && entry.code === code);

  /**
   * Compute and keep only adjustments from the promotion under test. The engine also applies
   * every active *automatic* promotion, so assertions must be scoped by code.
   */
  const appliedFor = async (code: string, context: Record<string, unknown>) =>
    settle(await promotionService.computeActions([code], context), code);

  const item = (id: string, quantity: number, sku: string) => ({
    id,
    quantity,
    subtotal: 100 * quantity,
    variant: { id: `${id}-v`, sku },
  });

  const cart = (items: ReturnType<typeof item>[], subtotal: number) => ({
    currency_code: "inr",
    subtotal,
    items,
    shipping_methods: [],
  });

  const failures: string[] = [];
  const check = (label: string, passed: boolean, detail = "") => {
    if (!passed) {
      failures.push(`${label}${detail ? ` (${detail})` : ""}`);
    }
    logger.info(`OFFTEST ${passed ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
  };

  try {
    // 1. Order-level percentage.
    await create(buildOffer({ code: "OFFTEST-ORDER10", mechanic: "order-percentage", value: 10, automatic: false }));
    const order = await appliedFor("OFFTEST-ORDER10", cart([item("a", 1, "A"), item("b", 5, "B")], 600));
    const orderTotal = order.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    check("order-percentage applies across lines", orderTotal === 60, `total=${orderTotal}`);

    // 2. Fixed amount targeted by SKU.
    await create(
      buildOffer({ code: "OFFTEST-SKU15", mechanic: "items-fixed", value: 15, automatic: false, sku: "SHIRT" }),
    );
    const sku = await appliedFor("OFFTEST-SKU15", cart([item("s1", 1, "SHIRT"), item("s2", 1, "HAT")], 200));
    check(
      "items-fixed targets only the matching SKU",
      sku.length === 1 && Number(sku[0].amount) === 15 && sku[0].item_id === "s1",
      JSON.stringify(sku),
    );

    // 3. Trap: the published `items.product.variants.sku` attribute never matches.
    await create({
      code: "OFFTEST-SKU-TRAP",
      type: "standard",
      status: "active",
      application_method: {
        type: "fixed",
        target_type: "items",
        allocation: "across",
        value: 15,
        currency_code: "inr",
        target_rules: [
          { attribute: "items.product.variants.sku", operator: "eq", values: ["SHIRT"] },
        ],
      },
    });
    const trap = await appliedFor("OFFTEST-SKU-TRAP", cart([item("t1", 1, "SHIRT")], 100));
    check("items.product.variants.sku matches nothing (documented trap)", trap.length === 0, JSON.stringify(trap));

    // 4. Free shipping.
    const freeShip = await create(buildOffer({ code: "OFFTEST-FREESHIP", mechanic: "free-shipping", value: 100, automatic: true }));
    const ship = await appliedFor("OFFTEST-FREESHIP", {
      currency_code: "inr",
      subtotal: 20000,
      items: [item("f1", 1, "A")],
      shipping_methods: [{ id: "sm1", subtotal: 199 }],
    });
    check(
      "free-shipping removes the full shipping amount",
      ship.length === 1 && Number(ship[0].amount) === 199,
      JSON.stringify(ship),
    );
    await remove(freeShip.id);

    // 5. Free shipping gated on cart value.
    const gated = await create(
      buildOffer({
        code: "OFFTEST-FREESHIP-GATED",
        mechanic: "free-shipping",
        value: 100,
        automatic: true,
        subtotalThreshold: 10000,
      }),
    );
    const shipCtx = (subtotal: number) => ({
      currency_code: "inr",
      subtotal,
      items: [item("g1", 1, "A")],
      shipping_methods: [{ id: "sm1", subtotal: 199 }],
    });
    const gatedAbove = await appliedFor("OFFTEST-FREESHIP-GATED", shipCtx(10000));
    const gatedBelow = await appliedFor("OFFTEST-FREESHIP-GATED", shipCtx(9999));
    check(
      "cart-value gate applies at threshold and blocks below",
      gatedAbove.length === 1 && gatedBelow.length === 0,
      `above=${gatedAbove.length} below=${gatedBelow.length}`,
    );
    await remove(gated.id);

    // 6. Partial shipping discount.
    const shipPartial = await create(
      buildOffer({ code: "OFFTEST-SHIP10", mechanic: "shipping-percentage", value: 10, automatic: true }),
    );
    const ship10 = await appliedFor("OFFTEST-SHIP10", {
      currency_code: "inr",
      subtotal: 5000,
      items: [item("p1", 1, "A")],
      shipping_methods: [{ id: "sm10", subtotal: 100 }],
    });
    check("shipping-percentage discounts part of shipping", Number(ship10[0]?.amount) === 10, JSON.stringify(ship10));
    await remove(shipPartial.id);

    // 7. Buy X get Y.
    await create(
      buildOffer({
        code: "OFFTEST-BOGO",
        mechanic: "buyget",
        value: 100,
        automatic: false,
        sku: "SHIRT",
        maxQuantity: 1,
        applyToQuantity: 1,
        buyRulesMinQuantity: 2,
      }),
    );
    const bogo = await appliedFor("OFFTEST-BOGO", cart([item("b1", 3, "SHIRT")], 300));
    check("buyget grants the free quantity", Number(bogo[0]?.amount) === 100, JSON.stringify(bogo));

    // 8. Per-line quantity gate.
    await create(
      buildOffer({
        code: "OFFTEST-QTY3",
        mechanic: "items-percentage",
        value: 8,
        automatic: true,
        categoryId: category.id,
        minQuantity: 3,
      }),
    );
    const gatedItem = (id: string, quantity: number) => ({
      id,
      quantity,
      subtotal: 100 * quantity,
      variant: { id: `${id}-v`, sku: id },
      product: { categories: [{ id: category.id }] },
    });
    const qty = await appliedFor("OFFTEST-QTY3", {
      currency_code: "inr",
      subtotal: 600,
      items: [gatedItem("low", 1), gatedItem("high", 5)],
      shipping_methods: [],
    });
    check(
      "quantity gate discounts only qualifying lines",
      qty.length === 1 && qty[0].item_id === "high",
      JSON.stringify(qty),
    );

    // 9. Trap: a fixed zero produces no discount.
    await create({
      code: "OFFTEST-FIXED0",
      type: "standard",
      status: "active",
      application_method: {
        type: "fixed",
        target_type: "shipping_methods",
        allocation: "across",
        value: 0,
        currency_code: "inr",
      },
    });
    const fixedZero = await appliedFor("OFFTEST-FIXED0", {
      currency_code: "inr",
      subtotal: 20000,
      items: [item("z1", 1, "A")],
      shipping_methods: [{ id: "smz", subtotal: 199 }],
    });
    check("fixed zero on shipping produces nothing (documented trap)", fixedZero.length === 0, JSON.stringify(fixedZero));

    // 10. use_by_attribute budget requires the attribute in context.
    const { result: campaignResult } = await createCampaignsWorkflow(container).run({
      input: {
        campaignsData: [
          {
            name: "OFFTEST per-customer",
            campaign_identifier: "OFFTEST-CAMP-PERCUSTOMER",
            budget: { type: "use_by_attribute", attribute: "customer_id", limit: 5 },
          },
        ],
      },
    });
    campaignIds.push(campaignResult[0].id);
    await create({
      code: "OFFTEST-PERCUST",
      type: "standard",
      status: "active",
      campaign_id: campaignResult[0].id,
      application_method: { type: "percentage", target_type: "order", value: 5 },
    });
    let threwWithoutCustomer = false;
    try {
      await appliedFor("OFFTEST-PERCUST", cart([item("pc", 1, "A")], 100));
    } catch {
      threwWithoutCustomer = true;
    }
    const withCustomer = await appliedFor("OFFTEST-PERCUST", {
      ...cart([item("pc2", 1, "A")], 100),
      customer_id: "cus_test",
    });
    check(
      "use_by_attribute budget requires customer id and works when present",
      threwWithoutCustomer && withCustomer.length === 1,
      `threw=${threwWithoutCustomer} applied=${withCustomer.length}`,
    );

    // 11. Per-customer group gate. Exercised on items: the seeded automatic trade free-shipping
    // offer competes for the shipping method, so a shipping-based check would be masked by it.
    const vip = await create(
      buildOffer({
        code: "OFFTEST-VIP",
        mechanic: "items-percentage",
        value: 10,
        automatic: true,
        customerGroupId: group.id,
      }),
    );
    const vipCtx = (member: boolean) => ({
      currency_code: "inr",
      subtotal: 100,
      items: [item("v", 1, "A")],
      shipping_methods: [],
      customer: { id: member ? "cus_m" : "cus_n", groups: member ? [{ id: group.id }] : [] },
    });
    const vipIn = await appliedFor("OFFTEST-VIP", vipCtx(true));
    const vipOut = await appliedFor("OFFTEST-VIP", vipCtx(false));
    check(
      "customer-group gate allows members and blocks others",
      vipIn.length === 1 && vipOut.length === 0,
      `member=${vipIn.length} nonMember=${vipOut.length}`,
    );
    await remove(vip.id);
  } finally {
    if (promotionIds.length) {
      await deletePromotionsWorkflow(container).run({ input: { ids: promotionIds } });
    }
    if (campaignIds.length) {
      await deleteCampaignsWorkflow(container).run({ input: { ids: campaignIds } });
    }
  }

  if (failures.length) {
    throw new Error(`Offer pattern verification failed:\n- ${failures.join("\n- ")}`);
  }

  logger.info(
    `merchandising-offer-patterns-test: PASS (11 checks across order, item, SKU, shipping, free-shipping, buyget, quantity, customer-group and budget mechanics)`,
  );
}
