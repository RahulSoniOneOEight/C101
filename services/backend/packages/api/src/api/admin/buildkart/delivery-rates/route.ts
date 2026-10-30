import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { hasPermission, permissionDenied } from "../../../../lib/rbac";
import type DeliveryRatesModuleService from "../../../../modules/delivery-rates/service";
import {
  normalizeFeeMinor,
  normalizePincode,
  parseBoolean,
} from "../../../../modules/delivery-rates/validation";

const MAX_LIMIT = 200;

type RateBody = {
  seller_id?: string;
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

async function sellerExists(
  req: AuthenticatedMedusaRequest,
  sellerId: string,
): Promise<boolean> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { id: sellerId },
  });
  return data.length > 0;
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.read")) {
    res.status(403).json({ message: permissionDenied("delivery.read") } as never);
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

  const filters: Record<string, unknown> = {};
  if (typeof req.query.seller_id === "string" && req.query.seller_id) {
    filters.seller_id = req.query.seller_id;
  }
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
    {
      take: limit,
      skip: offset,
      order: { updated_at: "DESC" },
    },
  );

  res.json({
    delivery_rates,
    count,
    limit,
    offset,
  } as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.update")) {
    res
      .status(403)
      .json({ message: permissionDenied("delivery.update") } as never);
    return;
  }
  const body = (req.body ?? {}) as RateBody;
  const sellerId = String(body.seller_id ?? "").trim();
  if (!sellerId) {
    res.status(422).json({ message: "seller_id is required." } as never);
    return;
  }
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
  if (!(await sellerExists(req, sellerId))) {
    res.status(404).json({ message: "Seller not found." } as never);
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
    updated_by: "admin",
  });

  res.status(201).json({ delivery_rate } as never);
}
