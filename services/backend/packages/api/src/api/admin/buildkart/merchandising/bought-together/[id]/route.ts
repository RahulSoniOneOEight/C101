import { randomUUID } from "node:crypto";
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission, permissionDenied } from "../../../../../../lib/rbac";

function correlation(req: AuthenticatedMedusaRequest): string {
  const incoming = req.headers["x-correlation-id"];
  return typeof incoming === "string" && incoming.trim()
    ? incoming.trim()
    : randomUUID();
}

export async function PATCH(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "merchandising.update")) {
    res.status(403).json({ message: permissionDenied("merchandising.update") } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/merchandising/bought-together/${encodeURIComponent(String(req.params.id))}`,
    {
      method: "PATCH",
      actorId: req.auth_context?.actor_id,
      correlationId: correlation(req),
      body: req.body,
    },
  );
  res.status(result.status).json(result.body as never);
}
