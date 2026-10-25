import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../../lib/experience-admin";
import { hasPermission, permissionDenied } from "../../../../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "merchandising.read")) {
    res.status(403).json({ message: permissionDenied("merchandising.read") } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/merchandising/bought-together/${encodeURIComponent(String(req.params.id))}/audit`,
    { actorId: req.auth_context?.actor_id },
  );
  res.status(result.status).json(result.body as never);
}
