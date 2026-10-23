import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../../lib/experience-admin";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const actorId =
    (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
    "admin_console";
  const result = await experienceAdminFetch(
    `/v1/internal/inventory/requests/${encodeURIComponent(req.params.id)}/approve`,
    {
      method: "POST",
      actorId,
      body: { note: (req.body as { note?: string } | undefined)?.note ?? null },
    },
  );
  res.status(result.status).json(result.body as never);
}
