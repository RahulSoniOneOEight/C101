import {
  AbstractFulfillmentProviderService,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types";
import {
  DEFAULT_DELIVERY_FEE_MINOR,
  PINCODE_DELIVERY_CONTEXT_KEY,
  type PincodeDeliveryContext,
} from "./constants";

/**
 * One calculated "Delivery" option per seller.
 *
 * A fulfillment provider is instantiated inside the fulfillment module's own
 * container, so it cannot resolve the `delivery_rates` module. The app-side
 * `setCalculatedShippingPricingContext` hook resolves the cart's pincode fees
 * and the workflow forwards them to `calculatePrice` under
 * `PINCODE_DELIVERY_CONTEXT_KEY`.
 *
 * The provider fails closed when that context is absent: a missing hook must
 * never silently charge the default fee for every cart.
 */
export class PincodeDeliveryProviderService extends AbstractFulfillmentProviderService {
  static identifier = "pincode";

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "pincode-delivery" }];
  }

  async canCalculate(): Promise<boolean> {
    return true;
  }

  async validateOption(): Promise<boolean> {
    return true;
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return data;
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    context: Record<string, any>,
  ): Promise<CalculatedShippingOptionPrice> {
    const sellerId = String(optionData?.seller_id ?? "").trim();
    if (!sellerId) {
      throw new Error(
        "Calculated pincode delivery option is missing its seller_id.",
      );
    }

    const deliveryContext = context?.[
      PINCODE_DELIVERY_CONTEXT_KEY
    ] as PincodeDeliveryContext | undefined;
    if (!deliveryContext || typeof deliveryContext !== "object") {
      throw new Error(
        "Calculated pincode delivery context is missing; the pincode delivery pricing hook is not registered.",
      );
    }

    const fee = Number(deliveryContext.fees?.[sellerId]);
    const minor =
      Number.isFinite(fee) && fee >= 0
        ? Math.trunc(fee)
        : DEFAULT_DELIVERY_FEE_MINOR;
    return {
      // Medusa amounts are major units; rates are stored in minor units.
      calculated_amount: minor / 100,
      // The flat fee is quoted including GST, so Medusa extracts tax from the
      // fee instead of adding it on top (the customer pays the quoted amount).
      is_calculated_price_tax_inclusive: true,
    };
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] };
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {};
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] };
  }
}

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [PincodeDeliveryProviderService],
});
