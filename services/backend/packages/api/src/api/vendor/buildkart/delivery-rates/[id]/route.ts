import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { hasPermission, permissionDenied } from "../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../lib/vendor-seller";
import type DeliveryRatesModuleService from "../../../../../modules/delivery-rates/service";
import {
  normalizeFeeMinor,
  parseBoolean,
} from "../../../../../modules/delivery-rates/validation";

type UpdateBody = {
  fee?: number | string;
  flat_fee_minor?: number;
  flat_fee_rupees?: number | string;
  active?: boolean;
};

function readFeeMinor(body: UpdateBody): number | null | undefined {
  if (body.flat_fee_minor !== undefined) {
    const minor = Number(body.flat_fee_minor);
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  }
  if (body.fee !== undefined || body.flat_fee_rupees !== undefined) {
    return normalizeFeeMinor(body.fee ?? body.flat_fee_rupees);
  }
  return undefined;
}

async function ownRate(
  req: AuthenticatedMedusaRequest,
  sellerId: string,
) {
  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const rows = await service.listSellerDeliveryRates(
    { id: req.params.id, seller_id: sellerId },
    { take: 1 },
  );
  return { service, row: rows[0] };
}

export async function PATCH(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "delivery.update")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.update") } as never);
    return;
  }

  const { service, row } = await ownRate(req, sellerId);
  if (!row) {
    res.status(404).json({ message: "Delivery rate not found." } as never);
    return;
  }

  const body = (req.body ?? {}) as UpdateBody;
  const fee = readFeeMinor(body);
  if (fee === null) {
    res
      .status(422)
      .json({ message: "A fee of zero or more is required." } as never);
    return;
  }

  const delivery_rate = await service.updateSellerDeliveryRates({
    id: row.id,
    ...(fee !== undefined ? { flat_fee_minor: fee } : {}),
    ...(body.active !== undefined
      ? { active: parseBoolean(body.active, row.active) }
      : {}),
    updated_by: "seller",
  });

  res.json({ delivery_rate } as never);
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "delivery.update")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.update") } as never);
    return;
  }

  const { service, row } = await ownRate(req, sellerId);
  if (!row) {
    res.status(404).json({ message: "Delivery rate not found." } as never);
    return;
  }

  await service.deleteSellerDeliveryRates(row.id);
  res.json({ id: row.id, deleted: true } as never);
}
