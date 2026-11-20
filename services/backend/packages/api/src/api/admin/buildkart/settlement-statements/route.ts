import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../lib/experience-admin";
import type { AdminSettlementStatementListResponse } from "./types";
import type { AdminGetSettlementStatementsParamsType } from "./validators";

/**
 * Seller settlement statements sourced from the COD dues ledger.
 *
 * The Experience API owns the ledger and the per-order statement lines; this route only
 * proxies the operator session. The former Mercur fixture statements are no longer shown.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<AdminGetSettlementStatementsParamsType>,
  res: MedusaResponse<AdminSettlementStatementListResponse>,
): Promise<void> {
  const { period, seller_id: sellerId } =
    req.validatedQuery as AdminGetSettlementStatementsParamsType;
  const query = [
    period ? `period=${encodeURIComponent(period)}` : "",
    sellerId ? `seller_id=${encodeURIComponent(sellerId)}` : "",
  ]
    .filter(Boolean)
    .join("&");

  const result = await experienceAdminFetch("/v1/admin/cod/settlement-statements", {
    actorId: req.auth_context?.actor_id,
    query: query || undefined,
  });
  res.status(result.status).json(result.body as never);
}
