import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import type { AdminReturnActionResponse } from "../../types";
import type { ReturnInspectionType } from "./validators";

/**
 * Admin inspection is an additive closure action. It records received quantities, condition and
 * disposition; it does not move money or Tryton stock.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<ReturnInspectionType>,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  if (!hasPermission(req, "return.respond")) {
    res.status(403).json({ message: "Missing permission: return.respond." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/returns/${encodeURIComponent(req.params.id)}/inspection`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      body: req.validatedBody,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
