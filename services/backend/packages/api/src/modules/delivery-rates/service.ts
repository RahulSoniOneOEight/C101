import { MedusaService } from "@medusajs/framework/utils";
import SellerDeliveryRate from "./models/seller-delivery-rate";

export const DEFAULT_DELIVERY_FEE_MINOR = 9900;

/**
 * Delivery rates are exact (seller_id, 6-digit pincode) rows. A missing or
 * inactive row resolves to the ₹99 default; it is never free.
 */
class DeliveryRatesModuleService extends MedusaService({
  SellerDeliveryRate,
}) {
  async resolveFee(sellerId: string, pincode: string): Promise<number> {
    const normalized = String(pincode ?? "").replace(/\D/g, "").slice(0, 6);
    if (!sellerId || normalized.length !== 6) {
      return DEFAULT_DELIVERY_FEE_MINOR;
    }

    const rows = await this.listSellerDeliveryRates(
      {
        seller_id: sellerId,
        pincode: normalized,
        active: true,
      },
      { take: 1, order: { updated_at: "DESC" } },
    );
    const fee = Number(rows[0]?.flat_fee_minor);
    return Number.isFinite(fee) && fee >= 0
      ? Math.trunc(fee)
      : DEFAULT_DELIVERY_FEE_MINOR;
  }
}

export default DeliveryRatesModuleService;
