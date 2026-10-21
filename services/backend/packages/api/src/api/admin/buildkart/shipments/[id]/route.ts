import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import type { AdminShipmentDetailResponse } from "../types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentDetailResponse>,
): Promise<void> {
  const result = await experienceAdminFetch(
    `/v1/admin/shipments/${encodeURIComponent(req.params.id)}`,
    { actorId: req.auth_context?.actor_id },
  );
  res.status(result.status).json(result.body as unknown as AdminShipmentDetailResponse);
}
