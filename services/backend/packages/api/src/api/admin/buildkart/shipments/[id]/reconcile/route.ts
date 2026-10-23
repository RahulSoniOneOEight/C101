import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import type { AdminShipmentActionResponse } from "../../types";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminShipmentActionResponse>,
): Promise<void> {
  const result = await experienceAdminFetch(
    `/v1/admin/shipments/${encodeURIComponent(req.params.id)}/reconcile`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminShipmentActionResponse);
}
