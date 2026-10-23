import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import type { AdminReturnActionResponse } from "../types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  const result = await experienceAdminFetch(
    `/v1/admin/returns/${encodeURIComponent(req.params.id)}`,
    { actorId: req.auth_context?.actor_id },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
