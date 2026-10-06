import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import {
  resolvePaymentRuntime,
  SIMULATED_PAYMENT_PROVIDER_ID,
} from "../config/payment-runtime";

type RegionWithPaymentProviders = {
  id: string;
  name: string;
  countries?: { iso_2: string }[];
  payment_providers?: { id: string }[];
};

/** Idempotently enables the local simulated provider on the existing India region. */
export default async function configureSimulatedPayment({ container }: ExecArgs) {
  const runtime = resolvePaymentRuntime(process.env);
  if (!runtime.simulatedProviderEnabled) {
    throw new Error("PAYMENT_ADAPTER_MODE must be simulated for this staging-only command.");
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
  providerIds.add(SIMULATED_PAYMENT_PROVIDER_ID);

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: indiaRegion.id },
      update: { payment_providers: [...providerIds] },
    },
  });

  logger.info(
    `Enabled ${SIMULATED_PAYMENT_PROVIDER_ID} on ${indiaRegion.name} (${indiaRegion.id}) ` +
      "alongside pp_system_default.",
  );
}
