import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadStudioMeta,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../lib/product-studio";
import { vendorSellerId } from "../../../../lib/vendor-seller";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  const search = typeof req.query.q === "string" ? req.query.q : "";
  const meta = await loadStudioMeta(req.scope, "vendor", sellerId, search);
  res.json(meta);
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    const sellerId = vendorSellerId(req);
    if (!sellerId) {
      res
        .status(401)
        .json({ message: "Seller authentication required." } as never);
      return;
    }
    const { product } = await saveStudioProduct(
      req.scope,
      "vendor",
      sellerId,
      sellerId,
      null,
      (req.body ?? {}) as StudioSaveInput,
    );
    res.status(201).json({ product });
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
}
