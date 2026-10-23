import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import type { AdminReturnActionResponse } from "../../types";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  if (!hasPermission(req, "return.respond")) {
    res.status(403).json({ message: "Missing permission: return.respond." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/returns/${encodeURIComponent(req.params.id)}/reject`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      body: req.body ?? {},
    },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
