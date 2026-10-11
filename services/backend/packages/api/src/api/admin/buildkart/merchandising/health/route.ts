import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { BuildKartCmsClient, type CmsHealth } from "../../../../../integrations/cms/client";
import { rethrowCmsError } from "../route-helpers";

export async function GET(
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse<CmsHealth>,
) {
  try {
    res.json(await new BuildKartCmsClient().health());
  } catch (error) {
    rethrowCmsError(error);
  }
}
