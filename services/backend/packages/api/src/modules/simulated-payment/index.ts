import {
  AbstractPaymentProvider,
  ModuleProvider,
  Modules,
} from "@medusajs/framework/utils";
import SimulatedPaymentProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [SimulatedPaymentProviderService],
});
