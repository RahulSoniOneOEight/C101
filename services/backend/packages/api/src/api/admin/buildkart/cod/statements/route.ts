import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "reconciliation.read")) {
    res.status(403).json({ message: "Missing permission: finance." } as never);
    return;
  }
  const period =
    typeof req.query.period === "string" ? `period=${encodeURIComponent(req.query.period)}` : "";
  const result = await experienceAdminFetch("/v1/admin/cod/statements", {
    actorId: req.auth_context?.actor_id,
    query: period || undefined,
  });
  res.status(result.status).json(result.body as never);
}
