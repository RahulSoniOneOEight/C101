import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { BuildKartCmsClient, type CmsAuditResponse } from "../../../../integrations/cms/client";
import { assertCmsPermission, rethrowCmsError } from "../merchandising/route-helpers";

export async function GET(
  req: AuthenticatedMedusaRequest<{ limit?: number }>,
  res: MedusaResponse<CmsAuditResponse>,
) {
  try {
    assertCmsPermission(req, "audit.view");
    const limit = Number(req.query.limit ?? 100);
    res.json(await new BuildKartCmsClient().audit(limit));
  } catch (error) {
    rethrowCmsError(error);
  }
}
