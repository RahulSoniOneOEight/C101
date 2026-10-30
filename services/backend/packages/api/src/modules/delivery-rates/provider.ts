import {
  AbstractFulfillmentProviderService,
} from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types";
import DeliveryRatesModuleService from "./service";

type InjectedDependencies = {
  delivery_rates: DeliveryRatesModuleService;
};

/**
 * One calculated "Delivery" option per seller.
 *
 * Medusa passes the cart (including shipping_address) as the calculation
 * context and each shipping option's `data` as `optionData`. We deliberately
 * require the seller in optionData so a pincode fee can never be applied to
 * another seller's items.
 */
class PincodeDeliveryProviderService extends AbstractFulfillmentProviderService {
  static identifier = "pincode";

  protected readonly deliveryRates_: DeliveryRatesModuleService;

  constructor({ delivery_rates }: InjectedDependencies) {
    super();
    this.deliveryRates_ = delivery_rates;
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "pincode-delivery", seller_id_required: true }];
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
    data: Record<string, unknown>,
    context: Record<string, any>,
  ): Promise<CalculatedShippingOptionPrice> {
    const sellerId = String(
      optionData?.seller_id ?? data?.seller_id ?? "",
    ).trim();
    if (!sellerId) {
      throw new Error(
        "Calculated pincode delivery option is missing its seller_id.",
      );
    }
    const pincode = String(
      context?.shipping_address?.postal_code ?? "",
    ).trim();
    const calculatedAmount = await this.deliveryRates_.resolveFee(
      sellerId,
      pincode,
    );
    return {
      calculated_amount: calculatedAmount,
      is_calculated_price_tax_inclusive: false,
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

export default PincodeDeliveryProviderService;
