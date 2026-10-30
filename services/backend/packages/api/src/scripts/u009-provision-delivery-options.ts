/**
 * U-009 / B004 provisioning.
 *
 * Creates exactly one calculated "Delivery" shipping option per seller
 * service zone, tagged with `data.seller_id`, and deactivates the legacy
 * Standard/Express options for new carts (they are kept for order history).
 *
 * Idempotent: safe to run on every deploy.
 *
 * Run with:
 *   medusa exec ./src/scripts/u009-provision-delivery-options.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

type SellerRow = {
  id: string;
  name: string;
  stock_locations?: Array<{
    id: string;
    fulfillment_sets?: Array<{
      id: string;
      service_zones?: Array<{ id: string; name: string }>;
    }>;
  }>;
};

export default async function provisionDeliveryOptions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK) as any;
  const remoteLink = container.resolve(
    ContainerRegistrationKeys.REMOTE_LINK,
  ) as any;
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any;

  const { data: sellers } = (await query.graph({
    entity: "seller",
    fields: [
      "id",
      "name",
      "stock_locations.id",
      "stock_locations.fulfillment_sets.id",
      "stock_locations.fulfillment_sets.service_zones.id",
      "stock_locations.fulfillment_sets.service_zones.name",
    ],
  })) as { data: SellerRow[] };

  const types = await fulfillment.listShippingOptionTypes({ code: "delivery" });
  const deliveryType =
    types[0] ??
    (await fulfillment.createShippingOptionTypes({
      label: "Delivery",
      code: "delivery",
      description: "Flat delivery fee by pincode.",
    }));

  const allOptions = await fulfillment.listShippingOptions(
    {},
    { relations: ["rules"] },
  );

  const summary: Array<Record<string, unknown>> = [];

  for (const seller of sellers) {
    const locations = seller.stock_locations ?? [];
    for (const location of locations) {
      try {
        await link.create({
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: "pincode_pincode" },
        });
      } catch {
        // Already linked.
      }

      for (const set of location.fulfillment_sets ?? []) {
        for (const zone of set.service_zones ?? []) {
          const zoneOptions = allOptions.filter(
            (option: any) => option.service_zone_id === zone.id,
          );
          const existingDelivery = zoneOptions.find(
            (option: any) =>
              option.provider_id === "pincode_pincode" &&
              String(option.data?.seller_id ?? "") === seller.id,
          );

          let deliveryOptionId = existingDelivery?.id as string | undefined;
          if (!existingDelivery) {
            const template = zoneOptions.find(
              (option: any) => option.price_type === "flat",
            );
            if (!template?.shipping_profile_id) {
              summary.push({
                seller: seller.name,
                zone: zone.name,
                status: "skipped",
                reason: "no shipping profile on an existing option",
              });
              continue;
            }
            const created = await createShippingOptionsWorkflow(container).run({
              input: [
                {
                  name: "Delivery",
                  service_zone_id: zone.id,
                  shipping_profile_id: template.shipping_profile_id,
                  shipping_option_type_id: deliveryType.id,
                  provider_id: "pincode_pincode",
                  price_type: "calculated",
                  data: { seller_id: seller.id },
                  rules: [
                    { attribute: "enabled_in_store", value: "true", operator: "eq" },
                    { attribute: "is_return", value: "false", operator: "eq" },
                  ],
                } as any,
              ],
            });
            deliveryOptionId = created.result[0].id;
          }

          // Mercur's storefront workflow groups shipping options by the
          // `shipping_option ↔ seller` link. Without it the option is priced
          // but never returned to the storefront.
          if (!deliveryOptionId) continue;
          try {
            await remoteLink.create({
              [Modules.FULFILLMENT]: {
                shipping_option_id: deliveryOptionId,
              },
              [MercurModules.SELLER]: { seller_id: seller.id },
            });
          } catch {
            // Already linked.
          }

          // Retire Standard/Express for new carts: flip enabled_in_store to false.
          const retired: string[] = [];
          for (const option of zoneOptions) {
            if (option.id === deliveryOptionId) continue;
            const enabledRule = (option.rules ?? []).find(
              (rule: any) => rule.attribute === "enabled_in_store",
            );
            if (!enabledRule || String(enabledRule.value) === "false") continue;
            await fulfillment.updateShippingOptionRules({
              id: enabledRule.id,
              attribute: enabledRule.attribute,
              operator: enabledRule.operator,
              value: "false",
            });
            retired.push(option.name);
          }

          summary.push({
            seller: seller.name,
            zone: zone.name,
            delivery_option_id: deliveryOptionId,
            delivery_created: !existingDelivery,
            retired,
          });
        }
      }
    }
  }

  logger.info(`U009_PROVISION ${JSON.stringify(summary)}`);
  console.log(JSON.stringify({ status: "PASS", summary }, null, 2));
}
