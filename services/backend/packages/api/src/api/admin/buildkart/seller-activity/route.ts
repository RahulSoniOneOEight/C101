import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const params = new URLSearchParams();
  const limit = String(req.query.limit ?? "100");
  const eventType = String(req.query.event_type ?? "seller.");
  params.set("limit", limit);
  params.set("event_type", eventType);
  const result = await experienceAdminFetch(
    "/v1/admin/seller-activity",
    {
      actorId: req.auth_context?.actor_id,
      query: params.toString(),
    },
  );
  res.status(result.status).json(result.body);
}
