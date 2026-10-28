import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";
import type { AdminReturnActionResponse } from "../../types";
import type { RecordRefundSimulationType } from "./validators";

/**
 * Admin-only staging projection. It records explicit simulated refund evidence and closes the
 * return case without calling a PSP, changing Medusa payment state or moving Tryton stock.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<RecordRefundSimulationType>,
  res: MedusaResponse<AdminReturnActionResponse>,
): Promise<void> {
  if (!hasPermission(req, "refund.execute")) {
    res.status(403).json({ message: "Missing permission: refund.execute." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/returns/${encodeURIComponent(req.params.id)}/refund-simulation`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      body: req.validatedBody,
    },
  );
  res.status(result.status).json(result.body as unknown as AdminReturnActionResponse);
}
