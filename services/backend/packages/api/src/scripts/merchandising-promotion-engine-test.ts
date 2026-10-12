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

  const appliedAtThreshold = atThreshold.find(
    (action) => action.action === "addShippingMethodAdjustment",
  );
  const appliedBelow = belowThreshold.find(
    (action) => action.action === "addShippingMethodAdjustment",
  );

  if (!appliedAtThreshold) {
    throw new Error(
      `Free shipping did not apply at subtotal ${threshold}. Is the campaign active and configured?`,
    );
  }
  if (Math.abs(Number(appliedAtThreshold.amount) - 199) > 0.001) {
    throw new Error(
      `Expected full shipping discount of 199 at subtotal ${threshold}; got ${appliedAtThreshold.amount}.`,
    );
  }
  if (appliedBelow) {
    throw new Error(
      `Free shipping applied below the threshold at subtotal ${threshold - 1}; the gate is not enforced.`,
    );
  }

  logger.info(
    `merchandising-promotion-engine-test: PASS (free shipping applies at subtotal ${threshold}, ` +
      `blocked at ${threshold - 1})`,
  );
}
