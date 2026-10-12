import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_SETTLEMENT_MODULE } from "../../../../modules/marketplace-settlement";
import type MarketplaceSettlementModuleService from "../../../../modules/marketplace-settlement/service";
import { isStagingFinanceEnabled } from "../../../../staging-finance/runtime";
import { serializeSettlementStatement } from "./serializers";
import type { AdminSettlementStatementListResponse } from "./types";
import type { AdminGetSettlementStatementsParamsType } from "./validators";

const assertStagingFinanceEnabled = (): void => {
  if (!isStagingFinanceEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }
};

export async function GET(
  req: AuthenticatedMedusaRequest<AdminGetSettlementStatementsParamsType>,
  res: MedusaResponse<AdminSettlementStatementListResponse>,
): Promise<void> {
  assertStagingFinanceEnabled();

  const service = req.scope.resolve(
    MARKETPLACE_SETTLEMENT_MODULE,
  ) as MarketplaceSettlementModuleService;
  const { seller_id: sellerId, status } = req.validatedQuery;
  const statements = await service.listSettlementStatements();
  const filtered = statements
    .filter((statement) => !sellerId || statement.seller_id === sellerId)
    .filter((statement) => !status || statement.status === status)
    .sort(
      (left, right) => right.period_end.getTime() - left.period_end.getTime(),
    )
    .map(serializeSettlementStatement);

  res.json({
    statements: filtered,
    count: filtered.length,
    test_data: true,
    payment_mode: "simulated",
    payout_execution_authorized: false,
  });
}
