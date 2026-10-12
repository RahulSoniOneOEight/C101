import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_SETTLEMENT_MODULE } from "../../../../../modules/marketplace-settlement";
import type MarketplaceSettlementModuleService from "../../../../../modules/marketplace-settlement/service";
import { isStagingFinanceEnabled } from "../../../../../staging-finance/runtime";
import { serializeSettlementStatement } from "../serializers";
import type { AdminSettlementStatementResponse } from "../types";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminSettlementStatementResponse>,
): Promise<void> {
  if (!isStagingFinanceEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }

  const service = req.scope.resolve(
    MARKETPLACE_SETTLEMENT_MODULE,
  ) as MarketplaceSettlementModuleService;
  const [statement] = await service.listSettlementStatements({
    id: req.params.id,
  });
  if (!statement) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Simulated settlement statement not found.",
    );
  }

  res.json({
    statement: serializeSettlementStatement(statement),
    test_data: true,
    payment_mode: "simulated",
    payout_execution_authorized: false,
  });
}
