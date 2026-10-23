import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import type { AdminShipmentActionResponse } from "../../types";
import type { ManualShipmentStatusType } from "./validators";

export async function POST(
  req: AuthenticatedMedusaRequest<ManualShipmentStatusType>,
  res: MedusaResponse<AdminShipmentActionResponse>,
): Promise<void> {
  if (!hasPermission(req, "delivery.update")) {
    res.status(403).json({ message: "Missing permission: delivery.update." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/shipments/${encodeURIComponent(req.params.id)}/status`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      body: req.validatedBody,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminShipmentActionResponse);
}
