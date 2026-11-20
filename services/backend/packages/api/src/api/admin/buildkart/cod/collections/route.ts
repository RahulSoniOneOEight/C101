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
  if (!hasPermission(req, "payment.read")) {
    res.status(403).json({ message: "Missing permission: payment.read." } as never);
    return;
  }
  const status =
    typeof req.query.status === "string"
      ? `status=${encodeURIComponent(req.query.status)}`
      : "";
  const result = await experienceAdminFetch("/v1/admin/cod/collections", {
    actorId: req.auth_context?.actor_id,
    query: status || undefined,
  });
  res.status(result.status).json(result.body as never);
}
