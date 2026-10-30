import { MedusaService } from "@medusajs/framework/utils";
import SellerDeliveryRate from "./models/seller-delivery-rate";
import { DEFAULT_DELIVERY_FEE_MINOR } from "./constants";

/**
 * Delivery rates are exact (seller_id, 6-digit pincode) rows. A missing or
 * inactive row resolves to the Rs 99 default; it is never free.
 */
class DeliveryRatesModuleService extends MedusaService({
  SellerDeliveryRate,
}) {
  private static normalizePincode(pincode: unknown): string {
    return String(pincode ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
  }

  async resolveFee(sellerId: string, pincode: string): Promise<number> {
    const normalized = DeliveryRatesModuleService.normalizePincode(pincode);
    if (!sellerId || normalized.length !== 6) {
      return DEFAULT_DELIVERY_FEE_MINOR;
    }

    const rows = await this.listSellerDeliveryRates(
      { seller_id: sellerId, pincode: normalized, active: true },
      { take: 1, order: { updated_at: "DESC" } },
    );
    const fee = Number(rows[0]?.flat_fee_minor);
    return Number.isFinite(fee) && fee >= 0
      ? Math.trunc(fee)
      : DEFAULT_DELIVERY_FEE_MINOR;
  }

  /**
   * All active seller fees for one pincode, keyed by seller id.
   *
   * At most one row per seller can be active for a pincode (unique index), so
   * this is a small map. The pricing hook forwards it to the fulfillment
   * provider, which picks the fee for the option's seller.
   */
  async listFeesForPincode(
    pincode: string,
  ): Promise<Record<string, number>> {
    const normalized = DeliveryRatesModuleService.normalizePincode(pincode);
    if (normalized.length !== 6) {
      return {};
    }

    const rows = await this.listSellerDeliveryRates(
      { pincode: normalized, active: true },
      { take: 500 },
    );
    const fees: Record<string, number> = {};
    for (const row of rows) {
      const fee = Number(row.flat_fee_minor);
      if (Number.isFinite(fee) && fee >= 0) {
        fees[row.seller_id] = Math.trunc(fee);
      }
    }
    return fees;
  }
}

export default DeliveryRatesModuleService;
