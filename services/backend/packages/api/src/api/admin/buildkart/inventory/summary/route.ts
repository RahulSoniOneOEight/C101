import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const body = (req.body ?? {}) as { skus?: string[] };
  const skus = Array.isArray(body.skus) ? body.skus : [];
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const result = await experienceAdminFetch("/v1/internal/inventory/summary", {
    method: "POST",
    actorId,
    body: { skus },
  });
  res.status(result.status).json(result.body as never);
}
