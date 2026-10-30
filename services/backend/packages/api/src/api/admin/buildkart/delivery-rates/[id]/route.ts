import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { hasPermission, permissionDenied } from "../../../../../lib/rbac";
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

export async function PATCH(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.update")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.update") } as never);
    return;
  }
  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const id = req.params.id;

  const existing = await service.listSellerDeliveryRates({ id }, { take: 1 });
  if (!existing.length) {
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
    id,
    ...(fee !== undefined ? { flat_fee_minor: fee } : {}),
    ...(body.active !== undefined
      ? { active: parseBoolean(body.active, existing[0].active) }
      : {}),
    updated_by: "admin",
  });

  res.json({ delivery_rate } as never);
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.update")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.update") } as never);
    return;
  }
  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const id = req.params.id;

  const existing = await service.listSellerDeliveryRates({ id }, { take: 1 });
  if (!existing.length) {
    res.status(404).json({ message: "Delivery rate not found." } as never);
    return;
  }

  await service.deleteSellerDeliveryRates(id);
  res.json({ id, deleted: true } as never);
}
