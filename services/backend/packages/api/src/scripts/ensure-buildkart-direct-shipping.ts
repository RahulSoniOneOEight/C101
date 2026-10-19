import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { createSellerShippingOptionsWorkflow } from "@mercurjs/core/workflows";
import {
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Ensures the legacy "BuildKart Direct" seller can ship its catalogue.
 *
 * BuildKart Direct predates the four sellers created by the demo seed. Its 20
 * imported B2C products have offers and stock, but the warehouse never received
 * a fulfillment set, manual-provider link or shipping options. Medusa therefore
 * returns no shipping option for that seller, and a cart containing one of its
 * products fails completion with "No shipping method selected but the cart
 * contains seller items that require shipping."
 *
 * This script is idempotent: it creates only the missing pieces and reuses the
 * shared Marketplace Shipping profile. Staging only.
 */
export default async function ensureBuildKartDirectShipping({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const SELLER_NAME = "BuildKart Direct";
  const LOCATION_NAME = "BuildKart Direct Warehouse";
  const PROFILE_NAME = "Marketplace Shipping";
  const PROVIDER_ID = "manual_manual";
  const CHANNEL_NAMES = ["B2C Storefront", "B2B Trade Portal"];

  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "name"],
    filters: { name: SELLER_NAME },
  });
  const seller = sellers[0];
  if (!seller) throw new Error(`Seller "${SELLER_NAME}" was not found.`);

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "fulfillment_sets.id",
      "fulfillment_providers.id",
      "sales_channels.id",
      "sales_channels.name",
    ],
    filters: { name: LOCATION_NAME },
  });
  const location = locations[0];
  if (!location) throw new Error(`Stock location "${LOCATION_NAME}" was not found.`);

  // BuildKart Direct's warehouse was created outside the seller workflow, so
  // the seller ↔ stock-location link is missing. Without it the store cannot
  // resolve this seller's fulfillment configuration at checkout.
  const { data: sellerWithLocations } = await query.graph({
    entity: "seller",
    fields: ["id", "stock_locations.id"],
    filters: { id: seller.id },
  });
  const linkedLocationIds = new Set(
    (sellerWithLocations[0]?.stock_locations ?? []).map(
      (entry: { id: string }) => entry.id,
    ),
  );
  if (!linkedLocationIds.has(location.id)) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [MercurModules.SELLER]: { seller_id: seller.id },
    });
    logger.info(`Linked ${LOCATION_NAME} to seller ${SELLER_NAME}.`);
  } else {
    logger.info(`${LOCATION_NAME} is already linked to ${SELLER_NAME}.`);
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
    filters: { name: PROFILE_NAME },
  });
  const profile = profiles[0];
  if (!profile) throw new Error(`Shipping profile "${PROFILE_NAME}" was not found.`);

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { currency_code: "inr" },
  });
  const region = regions[0];
  if (!region) throw new Error("The INR region was not found.");

  if (!(location.fulfillment_providers ?? []).length) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER_ID },
    });
    logger.info(`Linked ${LOCATION_NAME} to ${PROVIDER_ID}.`);
  } else {
    logger.info(`${LOCATION_NAME} already has a fulfillment provider link.`);
  }

  const existingChannelNames = new Set(
    (location.sales_channels ?? []).map((channel: { name: string }) => channel.name),
  );
  const missingChannels = CHANNEL_NAMES.filter(
    (name) => !existingChannelNames.has(name),
  );
  if (missingChannels.length) {
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "name"],
      filters: { name: missingChannels },
    });
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: location.id,
        add: channels.map((channel: { id: string }) => channel.id),
      },
    });
    logger.info(`Linked ${missingChannels.join(", ")} to ${LOCATION_NAME}.`);
  }

  let fulfillmentSetId = location.fulfillment_sets?.[0]?.id;
  if (!fulfillmentSetId) {
    await createLocationFulfillmentSetWorkflow(container).run({
      input: {
        location_id: location.id,
        fulfillment_set_data: {
          name: `${SELLER_NAME} delivery`,
          type: "shipping",
        },
      },
    });
    const { data: refreshed } = await query.graph({
      entity: "stock_location",
      fields: ["fulfillment_sets.id"],
      filters: { id: location.id },
    });
    fulfillmentSetId = refreshed[0]?.fulfillment_sets?.[0]?.id;
    if (!fulfillmentSetId) {
      throw new Error(`Fulfillment set was not created for ${LOCATION_NAME}.`);
    }
    logger.info(`Created fulfillment set ${fulfillmentSetId} for ${LOCATION_NAME}.`);
  } else {
    logger.info(`Reusing fulfillment set ${fulfillmentSetId} for ${LOCATION_NAME}.`);
  }

  const { data: sets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "service_zones.id", "service_zones.name"],
    filters: { id: fulfillmentSetId },
  });
  let serviceZoneId = sets[0]?.service_zones?.[0]?.id;
  if (!serviceZoneId) {
    const { result: zones } = await createServiceZonesWorkflow(container).run({
      input: {
        data: [
          {
            fulfillment_set_id: fulfillmentSetId,
            name: `${SELLER_NAME} India`,
            geo_zones: [{ country_code: "in", type: "country" }],
          },
        ],
      },
    });
    serviceZoneId = zones[0].id;
    logger.info(`Created service zone ${serviceZoneId} for ${LOCATION_NAME}.`);
  } else {
    logger.info(`Reusing service zone ${serviceZoneId} for ${LOCATION_NAME}.`);
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "service_zone_id"],
    filters: { service_zone_id: serviceZoneId },
  });
  if (existingOptions.length) {
    logger.info(
      `${LOCATION_NAME} already has ${existingOptions.length} shipping option(s); nothing to create.`,
    );
    return;
  }

  await createSellerShippingOptionsWorkflow(container).run({
    input: {
      seller_id: seller.id,
      shipping_options: [
        {
          name: "Standard Shipping",
          price_type: "flat",
          provider_id: PROVIDER_ID,
          service_zone_id: serviceZoneId,
          shipping_profile_id: profile.id,
          type: {
            label: "Standard",
            description: "Ship in 2-3 days.",
            code: "standard",
          },
          prices: [
            { currency_code: "inr", amount: 9900 },
            { region_id: region.id, amount: 9900 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
        {
          name: "Express Shipping",
          price_type: "flat",
          provider_id: PROVIDER_ID,
          service_zone_id: serviceZoneId,
          shipping_profile_id: profile.id,
          type: {
            label: "Express",
            description: "Ship in 24 hours.",
            code: "express",
          },
          prices: [
            { currency_code: "inr", amount: 19900 },
            { region_id: region.id, amount: 19900 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    },
  });

  logger.info(`Created standard and express shipping options for ${SELLER_NAME}.`);
}
