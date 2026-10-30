import type { LoaderOptions } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";
import {
  PINCODE_DELIVERY_CONTEXT_KEY,
  type PincodeDeliveryContext,
} from "../modules/delivery-rates/constants";
import type DeliveryRatesModuleService from "../modules/delivery-rates/service";

/**
 * Injects the cart's per-seller pincode delivery fees into the calculated
 * shipping price context.
 *
 * Medusa merges the `setCalculatedShippingPricingContext` hook result into the
 * `context` passed to every calculated fulfillment provider's
 * `calculatePrice`. The provider itself runs in the fulfillment module's
 * container and cannot resolve `delivery_rates`, so this hook is the bridge.
 */
export default async function pincodeDeliveryPricingLoader({
  container,
}: LoaderOptions) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  listShippingOptionsForCartWithPricingWorkflow.hooks.setCalculatedShippingPricingContext(
    async ({ input }, { container: requestContainer }) => {
      const query = requestContainer.resolve(ContainerRegistrationKeys.QUERY);
      const deliveryRates = requestContainer.resolve(
        "delivery_rates",
      ) as DeliveryRatesModuleService;

      const {
        data: [cart],
      } = await query.graph({
        entity: "cart",
        fields: ["id", "shipping_address.postal_code"],
        filters: { id: input.cart_id },
      });

      const pincode = String(cart?.shipping_address?.postal_code ?? "").replace(
        /\D/g,
        "",
      );
      const context: PincodeDeliveryContext = {
        pincode,
        fees: await deliveryRates.listFeesForPincode(pincode),
      };

      return new StepResponse({
        [PINCODE_DELIVERY_CONTEXT_KEY]: context,
      });
    },
  );

  logger.info(
    "Registered pincode delivery calculated-pricing hook (setCalculatedShippingPricingContext).",
  );
}
