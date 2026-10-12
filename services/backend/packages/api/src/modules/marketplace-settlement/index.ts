import { Module } from "@medusajs/framework/utils";
import MarketplaceSettlementModuleService from "./service";

export const MARKETPLACE_SETTLEMENT_MODULE = "marketplace_settlement";

export default Module(MARKETPLACE_SETTLEMENT_MODULE, {
  service: MarketplaceSettlementModuleService,
});
