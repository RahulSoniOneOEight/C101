/**
 * U-009 / B004 Phase 0 LIVE gate.
 *
 * Proves, against a real Medusa runtime + preview database:
 *   1. A calculated shipping option can carry `data.seller_id`.
 *   2. The pincode provider receives the cart's shipping pincode.
 *   3. A seeded (seller, pincode) row resolves to its fee.
 *   4. A missing row resolves to the Rs99 default.
 *   5. An inactive row resolves to the Rs99 default.
 *
 * Run inside the preview container:
 *   npx medusa exec ./src/scripts/u009-live-gate.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createCartWorkflow,
  createShippingOptionsWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows";

const SELLER_ID = "sel_01M4EC9CVVHG168X1DHHBY29HY"; // PowerMax Depot
const STOCK_LOCATION_ID = "sloc_01M4EC9CXPTAXZBFYEGEN1N90K";
const SERVICE_ZONE_ID = "serzo_01M4EC9DPFQZKEEWR2FXHVD9DD";
const SHIPPING_PROFILE_ID = "sp_01M4EC9C0C9KNZ5RM7RPYY6H4H";
const REGION_ID = "reg_01M4EC9BEX0WF9392QM0DSRZBN";
const SALES_CHANNEL_ID = "sc_01M4EC8S2EBB6ZEAMGPGX7MP13";
const VARIANT_ID = "variant_01M59JRFEQ3JX2TFED15M6V7M4";

export default async function u009LiveGate({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const deliveryRates = container.resolve("delivery_rates") as any;

  const report: Record<string, unknown> = { steps: [] };
  const steps = report.steps as Array<Record<string, unknown>>;

  // 1. Link the calculated provider to the seller's stock location.
  try {
    await (link as any).create({
      [Modules.STOCK_LOCATION]: { stock_location_id: STOCK_LOCATION_ID },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "pincode_pincode" },
    });
    steps.push({ step: "link_provider", status: "created" });
  } catch (error) {
    steps.push({
      step: "link_provider",
      status: "already_linked",
      detail: String((error as Error).message).slice(0, 120),
    });
  }

  // 2. Reset any previous gate data.
  const existingRates = await deliveryRates.listSellerDeliveryRates({
    seller_id: SELLER_ID,
  });
  if (existingRates.length) {
    await deliveryRates.deleteSellerDeliveryRates(
      existingRates.map((row: any) => row.id),
    );
  }

  const existingOptions = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
    filters: { name: "U009 Delivery" },
  });
  if (existingOptions.data.length) {
    const fulfillment = container.resolve(Modules.FULFILLMENT) as any;
    for (const option of existingOptions.data) {
      await fulfillment.deleteShippingOptions(option.id).catch(() => undefined);
    }
  }

  // 3. Create one calculated Delivery option for this seller.
  const created = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "U009 Delivery",
        service_zone_id: SERVICE_ZONE_ID,
        shipping_profile_id: SHIPPING_PROFILE_ID,
        provider_id: "pincode_pincode",
        price_type: "calculated",
        data: { seller_id: SELLER_ID },
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
        ],
      },
    ],
  });
  const optionId = created.result[0].id;
  steps.push({ step: "create_calculated_option", status: "created", optionId });

  // 4. Seed an exact (seller, pincode) rate.
  const rate = await deliveryRates.createSellerDeliveryRates({
    seller_id: SELLER_ID,
    pincode: "302001",
    flat_fee_minor: 2900,
    currency_code: "inr",
    active: true,
    updated_by: "admin",
  });
  steps.push({ step: "seed_rate", status: "created", rateId: rate.id });

  // 5. Cart with the seller's item at the seeded pincode.
  const cart = await createCartWorkflow(container).run({
    input: {
      region_id: REGION_ID,
      sales_channel_id: SALES_CHANNEL_ID,
      items: [{ variant_id: VARIANT_ID, quantity: 1 }],
      shipping_address: {
        first_name: "U009",
        last_name: "Gate",
        address_1: "1 Preview Street",
        city: "Jaipur",
        province: "Rajasthan",
        postal_code: "302001",
        country_code: "in",
      },
    },
  });
  const cartId = cart.result.id;
  steps.push({ step: "create_cart", status: "created", cartId });

  const readDelivery = async (pincode: string) => {
    await updateCartWorkflow(container).run({
      input: {
        id: cartId,
        shipping_address: { postal_code: pincode },
      },
    });
    const listed = await listShippingOptionsForCartWithPricingWorkflow(
      container,
    ).run({ input: { cart_id: cartId } });
    const option = (listed.result as any[]).find(
      (entry) => entry.id === optionId,
    );
    if (!option) {
      throw new Error(
        `Calculated option ${optionId} was not returned for pincode ${pincode}.`,
      );
    }
    return option;
  };

  const seeded = await readDelivery("302001");
  const seededAmount =
    seeded.calculated_price?.calculated_amount ?? seeded.amount;
  steps.push({ step: "seeded_pincode", pincode: "302001", amount: seededAmount });

  const missing = await readDelivery("999999");
  const missingAmount =
    missing.calculated_price?.calculated_amount ?? missing.amount;
  steps.push({ step: "missing_pincode", pincode: "999999", amount: missingAmount });

  // 6. Inactive row must fall back to the default fee.
  await deliveryRates.updateSellerDeliveryRates({
    id: rate.id,
    active: false,
  });
  const inactive = await readDelivery("302001");
  const inactiveAmount =
    inactive.calculated_price?.calculated_amount ?? inactive.amount;
  steps.push({
    step: "inactive_pincode",
    pincode: "302001",
    amount: inactiveAmount,
  });

  const checks = {
    seeded_is_2900: seededAmount === 2900,
    missing_is_9900: missingAmount === 9900,
    inactive_is_9900: inactiveAmount === 9900,
  };
  const passed = Object.values(checks).every(Boolean);

  logger.info(
    `U009_LIVE_GATE ${passed ? "PASS" : "FAIL"} ${JSON.stringify({
      checks,
      steps,
    })}`,
  );

  if (!passed) {
    throw new Error(`U009 live gate failed: ${JSON.stringify(checks)}`);
  }
}
