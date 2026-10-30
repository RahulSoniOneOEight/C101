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
  createShippingOptionsWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows";

const SELLER_ID = "sel_01M4EC9CVVHG168X1DHHBY29HY"; // PowerMax Depot
const STOCK_LOCATION_ID = "sloc_01M4EC9CXPTAXZBFYEGEN1N90K";
const SERVICE_ZONE_ID = "serzo_01M4EC9CZD89NYDRJ1GJS36HCE";
const SHIPPING_PROFILE_ID = "sp_01M4EC9C0C9KNZ5RM7RPYY6H4H";
const SHIPPING_OPTION_TYPE_ID = "sotype_01M4EC9D0GBGARJ8MPMHESV0JV";
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
    fields: ["id", "name", "provider_id", "data"],
    filters: { provider_id: "pincode_pincode" },
  });
  const provisioned = existingOptions.data.find(
    (option: any) => String(option.data?.seller_id ?? "") === SELLER_ID,
  );

  // 3. Reuse the provisioned Delivery option, or create a temporary one.
  //
  // `shipping_option_type_id` is accepted by the workflow at runtime (the
  // admin route validator includes it) but is missing from the published
  // core-flows input type, hence the cast.
  let optionId: string;
  if (provisioned) {
    optionId = (provisioned as any).id;
  } else {
    const created = await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "U009 Delivery",
          service_zone_id: SERVICE_ZONE_ID,
          shipping_profile_id: SHIPPING_PROFILE_ID,
          shipping_option_type_id: SHIPPING_OPTION_TYPE_ID,
          provider_id: "pincode_pincode",
          price_type: "calculated",
          data: { seller_id: SELLER_ID },
          rules: [
            {
              attribute: "enabled_in_store",
              value: "true",
              operator: "eq",
            },
            {
              attribute: "is_return",
              value: "false",
              operator: "eq",
            },
          ],
        } as any,
      ],
    });
    optionId = created.result[0].id;
  }
  steps.push({ step: "create_calculated_option", status: provisioned ? "reused" : "created", optionId });

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
  //
  // The storefront's /store/carts route resolves Mercur's offer_id pricing
  // context before adding items. This gate creates the cart through the cart
  // module and pins a unit price, because the gate proves the shipping-price
  // path, not product pricing (which is covered by CHG-098 evidence).
  const cartService = container.resolve(Modules.CART) as any;
  const createdCart = await cartService.createCarts({
    currency_code: "inr",
    region_id: REGION_ID,
    sales_channel_id: SALES_CHANNEL_ID,
    shipping_address: {
      first_name: "U009",
      last_name: "Gate",
      address_1: "1 Preview Street",
      city: "Jaipur",
      province: "RJ",
      postal_code: "302001",
      country_code: "in",
    },
  });
  const cartId = createdCart.id;
  await cartService.addLineItems(cartId, [
    {
      variant_id: VARIANT_ID,
      title: "U009 gate item",
      quantity: 1,
      unit_price: 100,
    },
  ]);
  const cartWithAddress = await cartService.retrieveCart(cartId, {
    relations: ["shipping_address"],
  });
  let addressId: string | undefined =
    cartWithAddress.shipping_address?.id ?? undefined;
  steps.push({ step: "create_cart", status: "created", cartId });

  const setPincode = async (pincode: string) => {
    const address = {
      first_name: "U009",
      last_name: "Gate",
      address_1: "1 Preview Street",
      city: "Jaipur",
      province: "RJ",
      postal_code: pincode,
      country_code: "in",
    };
    if (addressId) {
      await cartService.updateAddresses({ id: addressId, ...address });
      return;
    }
    const createdAddress = await cartService.createCartAddresses(address);
    addressId = createdAddress.id;
    await cartService.updateCarts(cartId, {
      shipping_address_id: createdAddress.id,
    });
  };

  const readDelivery = async (pincode: string) => {
    await setPincode(pincode);
    const listed = await listShippingOptionsForCartWithPricingWorkflow(
      container,
    ).run({ input: { cart_id: cartId } });
    const option = (listed.result as any[]).find(
      (entry) => entry.id === optionId,
    );
    if (!option) {
      throw new Error(
        `Calculated option ${optionId} was not returned for pincode ${pincode}. Returned: ${JSON.stringify(
          (listed.result as any[]).map((entry) => ({
            id: entry.id,
            name: entry.name,
            price_type: entry.price_type,
            provider: entry.provider_id,
          })),
        )}`,
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
    seeded_is_29_major: seededAmount === 29,
    missing_is_99_major: missingAmount === 99,
    inactive_is_99_major: inactiveAmount === 99,
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
