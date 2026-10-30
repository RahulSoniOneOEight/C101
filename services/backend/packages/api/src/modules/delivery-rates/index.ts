import { Module } from "@medusajs/framework/utils";
import DeliveryRatesModuleService from "./service";

export const DELIVERY_RATES_MODULE = "delivery_rates";

export default Module(DELIVERY_RATES_MODULE, {
  service: DeliveryRatesModuleService,
});
