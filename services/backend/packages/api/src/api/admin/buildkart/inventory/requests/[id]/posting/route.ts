import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "inventory-adjustment.read")) {
    res.status(403).json({
      message: "Missing permission: inventory-adjustment.read.",
    } as never);
    return;
  }
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const result = await experienceAdminFetch(
    `/v1/internal/inventory/requests/${encodeURIComponent(
      req.params.id,
    )}/posting`,
    { method: "GET", actorId },
  );
  res.status(result.status).json(result.body as never);
}
