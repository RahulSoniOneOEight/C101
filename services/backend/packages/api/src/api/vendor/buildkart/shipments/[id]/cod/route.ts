import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";

type CodBody = Record<string, unknown>;

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
    res.status(403).json({ message: "Missing permission: delivery.read." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}/cod`,
    { actorId: req.auth_context?.actor_id ?? sellerId, sellerId },
  );
  res.status(result.status).json(result.body as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest<CodBody>,
  res: MedusaResponse,
): Promise<void> {
  const sellerId = vendorSellerId(req);
  if (!sellerId) {
    res.status(401).json({ message: "Seller authentication required." } as never);
    return;
  }
  if (!hasPermission(req, "delivery.update")) {
    res.status(403).json({ message: "Missing permission: delivery.update." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/seller/shipments/${encodeURIComponent(req.params.id)}/cod`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id ?? sellerId,
      sellerId,
      body: req.body ?? {},
    },
  );
  res.status(result.status).json(result.body as never);
}
