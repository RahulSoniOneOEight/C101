import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";
import type { AdminShipmentExceptionResponse } from "../shipments/types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentExceptionResponse>,
): Promise<void> {
  const limit = typeof req.query.limit === "string" ? req.query.limit : "100";
  const result = await experienceAdminFetch("/v1/admin/shipment-exceptions", {
    actorId: req.auth_context?.actor_id,
    query: `limit=${encodeURIComponent(limit)}`,
  });
  res.status(result.status).json(result.body as unknown as AdminShipmentExceptionResponse);
}
