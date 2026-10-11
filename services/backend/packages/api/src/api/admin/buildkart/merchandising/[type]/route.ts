import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { BuildKartCmsClient, type CmsCommandResponse, type CmsListResponse } from "../../../../../integrations/cms/client";
import { cmsCommandWorkflow } from "../../../../../workflows/cms-command";
import type { AdminCmsContentCommandType } from "../validators";
import { assertCmsPermission, cmsCommandContext, cmsContentType, rethrowCmsError } from "../route-helpers";

export async function GET(
  req: AuthenticatedMedusaRequest<{ status?: "draft" | "published" }>,
  res: MedusaResponse<CmsListResponse>,
) {
  try {
    assertCmsPermission(req, "content.view");
    const status = req.query.status === "published" ? "published" : "draft";
    res.json(await new BuildKartCmsClient().list(cmsContentType(req.params.type), status));
  } catch (error) {
    rethrowCmsError(error);
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest<AdminCmsContentCommandType>,
  res: MedusaResponse<CmsCommandResponse>,
) {
  try {
    assertCmsPermission(req, "content.edit");
    const { result } = await cmsCommandWorkflow(req.scope).run({
      input: {
        command: {
          operation: "create",
          type: cmsContentType(req.params.type),
          data: req.validatedBody.data,
        },
        context: cmsCommandContext(req),
      },
    });
    res.status(201).json(result);
  } catch (error) {
    rethrowCmsError(error);
  }
}
