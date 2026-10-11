import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { CmsCommandResponse } from "../../../../../../integrations/cms/client";
import { cmsCommandWorkflow } from "../../../../../../workflows/cms-command";
import type { AdminCmsContentCommandType } from "../../validators";
import { assertCmsPermission, cmsCommandContext, cmsContentType, rethrowCmsError } from "../../route-helpers";

export async function POST(
  req: AuthenticatedMedusaRequest<AdminCmsContentCommandType>,
  res: MedusaResponse<CmsCommandResponse>,
) {
  try {
    assertCmsPermission(req, "content.edit");
    const { result } = await cmsCommandWorkflow(req.scope).run({
      input: {
        command: {
          operation: "update",
          type: cmsContentType(req.params.type),
          documentId: req.params.documentId,
          data: req.validatedBody.data,
        },
        context: cmsCommandContext(req),
      },
    });
    res.json(result);
  } catch (error) {
    rethrowCmsError(error);
  }
}
