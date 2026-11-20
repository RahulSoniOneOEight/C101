import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import {
  COD_PAYMENT_PROVIDER_ID,
  RAZORPAY_PAYMENT_PROVIDER_ID,
  resolvePaymentRuntime,
} from "../config/payment-runtime";

type RegionWithPaymentProviders = {
  id: string;
  name: string;
  countries?: { iso_2: string }[];
  payment_providers?: { id: string }[];
};

/** Idempotently enables Razorpay on the India region for provider-mode staging. */
export default async function configureRazorpayPayment({ container }: ExecArgs) {
  const runtime = resolvePaymentRuntime(process.env);
  if (!runtime.providerEnabled) {
    throw new Error("PAYMENT_ADAPTER_MODE must be provider for this command.");
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionService = container.resolve(Modules.REGION);
  const regions = (await regionService.listRegions(
    {},
    { relations: ["countries", "payment_providers"] },
  )) as RegionWithPaymentProviders[];
  const configuredRegionId = process.env.MEDUSA_REGION_ID;
  const indiaRegion = regions.find((region) =>
    region.id === configuredRegionId ||
    region.name.toLowerCase() === "india" ||
    region.countries?.some((country) => country.iso_2.toLowerCase() === "in"),
  );

  if (!indiaRegion) {
    throw new Error("India region not found; run the governed staging seed first.");
  }

  const providerIds = new Set(
    indiaRegion.payment_providers?.map((provider) => provider.id) ?? [],
  );
  providerIds.add("pp_system_default");
  providerIds.add(RAZORPAY_PAYMENT_PROVIDER_ID);
  providerIds.add(COD_PAYMENT_PROVIDER_ID);

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: indiaRegion.id },
      update: { payment_providers: [...providerIds] },
    },
  });

  logger.info(
    `Enabled ${RAZORPAY_PAYMENT_PROVIDER_ID} and ${COD_PAYMENT_PROVIDER_ID} on ` +
      `${indiaRegion.name} (${indiaRegion.id}) alongside pp_system_default.`,
  );
}
