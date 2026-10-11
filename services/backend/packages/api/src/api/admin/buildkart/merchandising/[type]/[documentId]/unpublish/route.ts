import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { CmsCommandResponse } from "../../../../../../../integrations/cms/client";
import { cmsCommandWorkflow } from "../../../../../../../workflows/cms-command";
import type { AdminCmsPublicationCommandType } from "../../../validators";
import { assertCmsPermission, cmsCommandContext, cmsContentType, rethrowCmsError } from "../../../route-helpers";

export async function POST(
  req: AuthenticatedMedusaRequest<AdminCmsPublicationCommandType>,
  res: MedusaResponse<CmsCommandResponse>,
) {
  try {
    assertCmsPermission(req, "content.publish");
    const { result } = await cmsCommandWorkflow(req.scope).run({
      input: {
        command: {
          operation: "unpublish",
          type: cmsContentType(req.params.type),
          documentId: req.params.documentId,
        },
        context: cmsCommandContext(req),
      },
    });
    res.json(result);
  } catch (error) {
    rethrowCmsError(error);
  }
}
