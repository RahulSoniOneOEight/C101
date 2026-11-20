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
  const result = await experienceAdminFetch("/v1/admin/cod/policies", {
    actorId: req.auth_context?.actor_id,
  });
  res.status(result.status).json(result.body as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest<Record<string, unknown>>,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "reconciliation.read")) {
    res.status(403).json({ message: "Missing permission: finance." } as never);
    return;
  }
  const result = await experienceAdminFetch("/v1/admin/cod/policies", {
    method: "POST",
    actorId: req.auth_context?.actor_id,
    body: req.body ?? {},
  });
  res.status(result.status).json(result.body as never);
}
