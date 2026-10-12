import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { merchandisingPresetCatalogue } from "../../../../staging-merchandising/presets";
import { isStagingMerchandisingEnabled } from "../../../../staging-merchandising/runtime";

export type MerchandisingPresetCatalogueResponse = ReturnType<
  typeof merchandisingPresetCatalogue
>;

/**
 * CHG-029 read-only operator catalogue of bounded-staging merchandising presets.
 *
 * Returns the reviewed preset pack verbatim. It cannot create, activate or discount anything, and
 * is unavailable outside `BUILDKART_ENVIRONMENT=staging`.
 */
export async function GET(
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse<MerchandisingPresetCatalogueResponse>,
): Promise<void> {
  if (!isStagingMerchandisingEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }

  res.json(merchandisingPresetCatalogue());
}
