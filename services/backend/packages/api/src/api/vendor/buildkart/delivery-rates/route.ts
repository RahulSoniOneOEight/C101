import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { hasPermission, permissionDenied } from "../../../../lib/rbac";
import { vendorSellerId } from "../../../../lib/vendor-seller";
import type DeliveryRatesModuleService from "../../../../modules/delivery-rates/service";
import {
  normalizeFeeMinor,
  normalizePincode,
  parseBoolean,
} from "../../../../modules/delivery-rates/validation";

const MAX_LIMIT = 200;

type RateBody = {
  pincode?: string;
  fee?: number | string;
  flat_fee_minor?: number;
  flat_fee_rupees?: number | string;
  active?: boolean;
};

function readFeeMinor(body: RateBody): number | null {
  if (body.flat_fee_minor !== undefined) {
    const minor = Number(body.flat_fee_minor);
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  }
  return normalizeFeeMinor(body.fee ?? body.flat_fee_rupees);
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "delivery.read")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.read") } as never);
    return;
  }

  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const limit = Math.min(
    Math.max(Number(req.query.limit ?? 50) || 50, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

  // Seller scope is never taken from the request body or query.
  const filters: Record<string, unknown> = { seller_id: sellerId };
  if (typeof req.query.pincode === "string" && req.query.pincode) {
    filters.pincode = req.query.pincode.replace(/\D/g, "");
  }
  if (typeof req.query.q === "string" && req.query.q) {
    const digits = req.query.q.replace(/\D/g, "");
    if (digits) filters.pincode = { $ilike: `${digits}%` };
  }
  if (req.query.active === "true" || req.query.active === "false") {
    filters.active = req.query.active === "true";
  }

  const [delivery_rates, count] = await service.listAndCountSellerDeliveryRates(
    filters,
    { take: limit, skip: offset, order: { updated_at: "DESC" } },
  );

  res.json({ delivery_rates, count, limit, offset } as never);
}

export async function POST(
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

  const body = (req.body ?? {}) as RateBody;
  const pincode = normalizePincode(body.pincode);
  if (!pincode) {
    res
      .status(422)
      .json({ message: "pincode must be exactly six digits." } as never);
    return;
  }
  const fee = readFeeMinor(body);
  if (fee === null) {
    res
      .status(422)
      .json({ message: "A fee of zero or more is required." } as never);
    return;
  }

  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const delivery_rate = await service.upsertRate({
    seller_id: sellerId,
    pincode,
    flat_fee_minor: fee,
    active: parseBoolean(body.active, true),
    updated_by: "seller",
  });

  res.status(201).json({ delivery_rate } as never);
}
