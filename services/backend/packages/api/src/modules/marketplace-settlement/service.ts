import { MedusaService } from "@medusajs/framework/utils";
import SettlementStatement from "./models/settlement-statement";

class MarketplaceSettlementModuleService extends MedusaService({
  SettlementStatement,
}) {}

export default MarketplaceSettlementModuleService;
