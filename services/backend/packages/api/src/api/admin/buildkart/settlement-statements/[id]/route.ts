import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import type {
  AdminCodSettlementStatement,
  AdminSettlementStatementListResponse,
  AdminSettlementStatementResponse,
} from "../types";

/**
 * One COD statement, addressed as `<period>~<seller_id>`.
 * The list endpoint is filtered rather than adding a second ledger query.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminSettlementStatementResponse>,
): Promise<void> {
  const id = req.params.id ?? "";
  const [period, sellerId] = id.split("~");
  if (!period || !sellerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Settlement statement not found.");
  }

  const result = await experienceAdminFetch("/v1/admin/cod/settlement-statements", {
    actorId: req.auth_context?.actor_id,
    query: `period=${encodeURIComponent(period)}&seller_id=${encodeURIComponent(sellerId)}`,
  });
  if (result.status >= 400) {
    res.status(result.status).json(result.body as never);
    return;
  }
  const body = result.body as unknown as AdminSettlementStatementListResponse;
  const statement = (body.statements ?? []).find(
    (candidate: AdminCodSettlementStatement) => candidate.id === id,
  );
  if (!statement) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Settlement statement not found.");
  }

  res.json({
    statement,
    test_data: body.test_data ?? true,
    correlation_id: body.correlation_id,
  });
}
