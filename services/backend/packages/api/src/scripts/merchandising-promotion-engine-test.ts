/**
 * CHG-029 — prove the cart-value gate is enforced by the real Medusa promotion engine.
 *
 * Runs against a configured staging database (`configure:staging-merchandising`). It asserts that
 * `BK-STG-PROMO-FREESHIP` produces a full shipping adjustment at or above the INR 10,000 subtotal
 * threshold and produces nothing below it.
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  MERCHANDISING_PROMOTION_PRESETS,
  merchandisingThresholdMajor,
} from "../staging-merchandising/presets";

interface ComputedAction {
  action: string;
  shipping_method_id?: string;
  amount?: number;
  code?: string;
}

export default async function merchandisingPromotionEngineTest({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const promotionService = container.resolve(Modules.PROMOTION) as {
    computeActions(
      promotionCodes: string[],
      context: Record<string, unknown>,
    ): Promise<ComputedAction[]>;
  };

  const freeShipping = MERCHANDISING_PROMOTION_PRESETS.find(
    (preset) => preset.code === "BK-STG-PROMO-FREESHIP",
  )!;
  const threshold = merchandisingThresholdMajor(freeShipping);
  if (threshold === null) {
    throw new Error("BK-STG-PROMO-FREESHIP must declare a cart-value threshold rule.");
  }

  const compute = (subtotal: number) =>
    promotionService.computeActions([freeShipping.code], {
      currency_code: "inr",
      subtotal,
      items: [],
      shipping_methods: [{ id: `sm_engine_test_${subtotal}`, subtotal: 199 }],
    });

  const atThreshold = await compute(threshold);
  const belowThreshold = await compute(threshold - 1);

  const appliedAtThreshold = atThreshold.filter(
    (action) => action.action === "addShippingMethodAdjustment" && action.code === freeShipping.code,
  );
  const appliedBelow = belowThreshold.filter(
    (action) => action.action === "addShippingMethodAdjustment" && action.code === freeShipping.code,
  );

  if (!appliedAtThreshold.length) {
    throw new Error(
      `Free shipping did not apply at subtotal ${threshold}. Is the campaign active and configured?`,
    );
  }
  if (Math.abs(Number(appliedAtThreshold[0].amount) - 199) > 0.001) {
    throw new Error(
      `Expected full shipping discount of 199 at subtotal ${threshold}; got ${appliedAtThreshold[0].amount}.`,
    );
  }
  if (appliedBelow.length) {
    throw new Error(
      `Free shipping applied below the threshold at subtotal ${threshold - 1}; the gate is not enforced.`,
    );
  }

  // --- CHG-030: the seeded trade free-shipping offer must be free, not a partial discount ------
  const customerService = container.resolve(Modules.CUSTOMER) as {
    listCustomerGroups(filters: Record<string, unknown>): Promise<{ id: string }[]>;
  };
  const [tradeGroup] = await customerService.listCustomerGroups({ name: "trade-verified" });

  const vipContext = (member: boolean) => ({
    currency_code: "inr",
    subtotal: 5000,
    items: [],
    shipping_methods: [{ id: "sm_vip_test", subtotal: 199 }],
    customer: {
      id: member ? "cus_member" : "cus_guest",
      groups: member ? [{ id: tradeGroup.id }] : [],
    },
  });

  const vipMember = (
    await promotionService.computeActions(["BK-STG-OFFER-VIPSHIP"], vipContext(true))
  ).filter(
    (action) =>
      action.action === "addShippingMethodAdjustment" &&
      action.code === "BK-STG-OFFER-VIPSHIP",
  );
  const vipGuest = (
    await promotionService.computeActions(["BK-STG-OFFER-VIPSHIP"], vipContext(false))
  ).filter(
    (action) =>
      action.action === "addShippingMethodAdjustment" &&
      action.code === "BK-STG-OFFER-VIPSHIP",
  );

  if (Math.abs(Number(vipMember[0]?.amount) - 199) > 0.001) {
    throw new Error(
      `Trade free shipping must cover the full 199 shipping amount; got ${vipMember[0]?.amount}.`,
    );
  }
  if (vipGuest.length) {
    throw new Error("Trade free shipping must not apply to non-members.");
  }

  logger.info(
    `merchandising-promotion-engine-test: PASS (free shipping applies at subtotal ${threshold}, ` +
      `blocked at ${threshold - 1}; trade free shipping covers the full amount for members only)`,
  );
}
