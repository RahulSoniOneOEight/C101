import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission, permissionDenied } from "../../../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "merchandising.read")) {
    res.status(403).json({ message: permissionDenied("merchandising.read") } as never);
    return;
  }
  const params = new URLSearchParams();
  for (const key of ["query", "channel"]) {
    const value = req.query[key];
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  const result = await experienceAdminFetch(
    "/v1/admin/merchandising/bought-together/candidates",
    {
      actorId: req.auth_context?.actor_id,
      query: params.toString(),
    },
  );
  res.status(result.status).json(result.body as never);
}
