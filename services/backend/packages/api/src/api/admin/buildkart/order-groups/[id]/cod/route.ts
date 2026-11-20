import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../../lib/rbac";

type CodBody = Record<string, unknown>;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.read")) {
    res.status(403).json({ message: "Missing permission: delivery.read." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/orders/${encodeURIComponent(req.params.id)}/cod`,
    { actorId: req.auth_context?.actor_id },
  );
  res.status(result.status).json(result.body as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest<CodBody>,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "delivery.update")) {
    res.status(403).json({ message: "Missing permission: delivery.update." } as never);
    return;
  }
  const result = await experienceAdminFetch(
    `/v1/admin/orders/${encodeURIComponent(req.params.id)}/cod`,
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      body: req.body ?? {},
    },
  );
  res.status(result.status).json(result.body as never);
}
