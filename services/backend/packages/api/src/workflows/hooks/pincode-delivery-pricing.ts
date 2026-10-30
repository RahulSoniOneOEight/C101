import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows";
import {
  PINCODE_DELIVERY_CONTEXT_KEY,
  type PincodeDeliveryContext,
} from "../../modules/delivery-rates/constants";
import type DeliveryRatesModuleService from "../../modules/delivery-rates/service";

/**
 * Injects the cart's per-seller pincode delivery fees into the calculated
 * shipping price context.
 *
 * Medusa merges the `setCalculatedShippingPricingContext` hook result into the
 * `context` passed to every calculated fulfillment provider's
 * `calculatePrice`. The provider itself is instantiated in the fulfillment
 * module's container and cannot resolve `delivery_rates`, so this hook is the
 * supported bridge.
 *
 * Medusa's WorkflowLoader imports every file under `src/workflows`, so this
 * registration runs at boot. Do not move it into `src/loaders`: project
 * loaders are not loaded by Medusa v2.
 */
listShippingOptionsForCartWithPricingWorkflow.hooks.setCalculatedShippingPricingContext(
  async ({ input }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const deliveryRates = container.resolve(
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
