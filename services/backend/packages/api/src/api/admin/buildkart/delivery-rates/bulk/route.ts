import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { hasPermission, permissionDenied } from "../../../../../lib/rbac";
import type DeliveryRatesModuleService from "../../../../../modules/delivery-rates/service";
import {
  assertBulkSize,
  normalizeFeeMinor,
  normalizePincode,
  parseBoolean,
  parseBulkRates,
  type BulkLineError,
  type ParsedRate,
} from "../../../../../modules/delivery-rates/validation";

type BulkBody = {
  seller_id?: string;
  csv?: string;
  text?: string;
  rows?: Array<{
    pincode?: string;
    fee?: number | string;
    flat_fee_minor?: number;
    active?: boolean;
  }>;
};

function rowsFromBody(body: BulkBody): {
  rows: ParsedRate[];
  errors: BulkLineError[];
  duplicates: number;
} {
  if (Array.isArray(body.rows)) {
    const rows: ParsedRate[] = [];
    const errors: BulkLineError[] = [];
    body.rows.forEach((row, index) => {
      const pincode = normalizePincode(row.pincode);
      const fee =
        row.flat_fee_minor !== undefined
          ? Number.isSafeInteger(Number(row.flat_fee_minor)) &&
            Number(row.flat_fee_minor) >= 0
            ? Number(row.flat_fee_minor)
            : null
          : normalizeFeeMinor(row.fee);
      if (!pincode || fee === null) {
        errors.push({
          line: index + 1,
          value: JSON.stringify(row),
          message: !pincode
            ? "Pincode must be six digits."
            : "Fee must be zero or more.",
        });
        return;
      }
      rows.push({ pincode, flat_fee_minor: fee, active: parseBoolean(row.active, true) });
    });
    return { rows, errors, duplicates: 0 };
  }
  return parseBulkRates(body.csv ?? body.text ?? "");
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
  const body = (req.body ?? {}) as BulkBody;
  const sellerId = String(body.seller_id ?? "").trim();
  if (!sellerId) {
    res.status(422).json({ message: "seller_id is required." } as never);
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { id: sellerId },
  });
  if (!sellers.length) {
    res.status(404).json({ message: "Seller not found." } as never);
    return;
  }

  const parsed = rowsFromBody(body);
  const sizeError = assertBulkSize(parsed.rows, parsed.errors);
  if (sizeError) {
    res.status(422).json({
      message: sizeError,
      errors: parsed.errors,
    } as never);
    return;
  }

  const service = req.scope.resolve(
    "delivery_rates",
  ) as DeliveryRatesModuleService;
  const result = await service.bulkUpsertRates(
    sellerId,
    parsed.rows,
    "admin",
  );

  res.status(201).json({
    ...result,
    duplicates: parsed.duplicates,
    errors: parsed.errors,
  } as never);
}
