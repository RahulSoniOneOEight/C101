import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../../lib/rbac";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "inventory-reconciliation.resolve")) {
    res.status(403).json({
      message: "Missing permission: inventory-reconciliation.resolve.",
    } as never);
    return;
  }
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const result = await experienceAdminFetch(
    `/v1/internal/inventory/requests/${encodeURIComponent(
      req.params.id,
    )}/reconcile`,
    { method: "POST", actorId, body: {} },
  );
  res.status(result.status).json(result.body as never);
}
