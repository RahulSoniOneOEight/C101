import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { merchandisingOfferCatalogue } from "../../../../staging-merchandising/offer-patterns";
import { isStagingMerchandisingEnabled } from "../../../../staging-merchandising/runtime";

export type MerchandisingOfferCatalogueResponse = ReturnType<
  typeof merchandisingOfferCatalogue
>;

/**
 * CHG-030 read-only operator catalogue of the bounded-staging offer lab.
 *
 * Returns the declared offer patterns and their engine-verified configuration. It cannot create,
 * activate or discount anything, and is unavailable outside `BUILDKART_ENVIRONMENT=staging`.
 */
export async function GET(
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse<MerchandisingOfferCatalogueResponse>,
): Promise<void> {
  if (!isStagingMerchandisingEnabled()) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }

  res.json(merchandisingOfferCatalogue());
}
