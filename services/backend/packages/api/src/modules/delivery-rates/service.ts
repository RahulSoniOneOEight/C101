import { MedusaService } from "@medusajs/framework/utils";
import SellerDeliveryRate from "./models/seller-delivery-rate";
import { DEFAULT_DELIVERY_FEE_MINOR } from "./constants";
import type { ParsedRate } from "./validation";
import { MAX_BULK_ROWS } from "./validation";

export type RateActor = "admin" | "seller";

export type UpsertRateInput = {
  seller_id: string;
  pincode: string;
  flat_fee_minor: number;
  active?: boolean;
  updated_by: RateActor;
};

export type BulkUpsertResult = {
  created: number;
  updated: number;
  unchanged: number;
};

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
  async listFeesForPincode(pincode: string): Promise<Record<string, number>> {
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

  /**
   * Creates or updates one exact rate. Admin and seller writes both land here;
   * `updated_by` records the actor and `updated_at` moves on every write.
   */
  async upsertRate(input: UpsertRateInput) {
    const existing = await this.listSellerDeliveryRates(
      { seller_id: input.seller_id, pincode: input.pincode },
      { take: 1 },
    );
    const current = existing[0];
    if (current) {
      return this.updateSellerDeliveryRates({
        id: current.id,
        flat_fee_minor: input.flat_fee_minor,
        active: input.active ?? true,
        updated_by: input.updated_by,
      });
    }
    return this.createSellerDeliveryRates({
      seller_id: input.seller_id,
      pincode: input.pincode,
      flat_fee_minor: input.flat_fee_minor,
      active: input.active ?? true,
      updated_by: input.updated_by,
    });
  }

  /**
   * Upserts a parsed batch for one seller. The caller validates shapes first;
   * this method only groups rows into create/update sets.
   */
  async bulkUpsertRates(
    sellerId: string,
    rows: ParsedRate[],
    updatedBy: RateActor,
  ): Promise<BulkUpsertResult> {
    if (rows.length === 0) return { created: 0, updated: 0, unchanged: 0 };

    const pincodes = rows.map((row) => row.pincode);
    const existing = await this.listSellerDeliveryRates(
      { seller_id: sellerId, pincode: pincodes },
      { take: Math.min(MAX_BULK_ROWS, pincodes.length) },
    );
    const byPincode = new Map(existing.map((row) => [row.pincode, row]));

    const toCreate: Array<{
      seller_id: string;
      pincode: string;
      flat_fee_minor: number;
      active: boolean;
      updated_by: RateActor;
    }> = [];
    const toUpdate: Array<{
      id: string;
      flat_fee_minor: number;
      active: boolean;
      updated_by: RateActor;
    }> = [];
    let unchanged = 0;

    for (const row of rows) {
      const current = byPincode.get(row.pincode);
      if (!current) {
        toCreate.push({
          seller_id: sellerId,
          pincode: row.pincode,
          flat_fee_minor: row.flat_fee_minor,
          active: row.active,
          updated_by: updatedBy,
        });
        continue;
      }
      if (
        Number(current.flat_fee_minor) === row.flat_fee_minor &&
        Boolean(current.active) === row.active
      ) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({
        id: current.id,
        flat_fee_minor: row.flat_fee_minor,
        active: row.active,
        updated_by: updatedBy,
      });
    }

    if (toCreate.length) {
      await this.createSellerDeliveryRates(toCreate);
    }
    if (toUpdate.length) {
      await this.updateSellerDeliveryRates(toUpdate);
    }

    return {
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged,
    };
  }
}

export default DeliveryRatesModuleService;
