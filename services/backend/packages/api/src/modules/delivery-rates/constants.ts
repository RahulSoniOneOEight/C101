/**
 * Shared constants for the pincode delivery rate module.
 *
 * `DEFAULT_DELIVERY_FEE_MINOR` is the fallback fee (Rs 99) charged per seller
 * when no active `seller_delivery_rate` row exists for the cart's pincode.
 * Delivery is never free.
 */
export const DEFAULT_DELIVERY_FEE_MINOR = 9900;

/**
 * Key under which the app-side pricing hook injects the resolved pincode fees
 * into the fulfillment provider's `calculatePrice` context.
 *
 * The fulfillment provider runs inside the fulfillment module's own container,
 * so it cannot resolve the `delivery_rates` module directly. Medusa's
 * `setCalculatedShippingPricingContext` hook is the supported injection point.
 */
export const PINCODE_DELIVERY_CONTEXT_KEY = "u009_delivery_rates";

export type PincodeDeliveryContext = {
  pincode: string;
  fees: Record<string, number>;
};
