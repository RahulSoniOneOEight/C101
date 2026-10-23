import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadStudioProduct,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../../lib/product-studio";
import { vendorSellerId } from "../../../../../lib/vendor-seller";

export async function GET(
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
    const result = await loadStudioProduct(
      req.scope,
      "vendor",
      sellerId,
      req.params.id,
    );
    res.json(result);
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
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
    const result = await saveStudioProduct(
      req.scope,
      "vendor",
      sellerId,
      sellerId,
      req.params.id,
      (req.body ?? {}) as StudioSaveInput,
    );
    res.json(result);
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
}
