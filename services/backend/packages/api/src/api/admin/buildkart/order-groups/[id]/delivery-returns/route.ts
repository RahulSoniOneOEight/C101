import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../../lib/experience-admin";
import type { AdminOrderGroupDeliveryReturnsResponse } from "./types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminOrderGroupDeliveryReturnsResponse>,
): Promise<void> {
  const result = await experienceAdminFetch(
    `/v1/admin/order-groups/${encodeURIComponent(req.params.id)}/delivery-returns`,
    { actorId: req.auth_context?.actor_id },
  );
  res
    .status(result.status)
    .json(result.body as unknown as AdminOrderGroupDeliveryReturnsResponse);
}
