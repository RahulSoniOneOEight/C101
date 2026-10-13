import { randomUUID } from "node:crypto";
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  loadCmsOperatorClient,
  type CmsContentListResponse,
  type CmsMutationResponse,
} from "../../../../integrations/cms-operator-client";
import type { AdminGetCmsContentType, AdminMutateCmsContentType } from "./validators";

function identity(req: AuthenticatedMedusaRequest): { actorId: string; correlationId: string } {
  const incoming = req.headers["x-correlation-id"];
  return {
    actorId: req.auth_context.actor_id,
    correlationId: typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID(),
  };
}

export async function GET(
  req: AuthenticatedMedusaRequest<AdminGetCmsContentType>,
  res: MedusaResponse<CmsContentListResponse>,
): Promise<void> {
  const query = req.validatedQuery as AdminGetCmsContentType;
  const result = await loadCmsOperatorClient().list(query.kind, query.locale, identity(req));
  res.json(result);
}

export async function POST(
  req: AuthenticatedMedusaRequest<AdminMutateCmsContentType>,
  res: MedusaResponse<CmsMutationResponse>,
): Promise<void> {
  const body = req.validatedBody;
  const result = await loadCmsOperatorClient().mutate(
    body.kind,
    {
      operation: body.operation,
      documentId: body.documentId,
      locale: body.locale,
      data: body.data,
    },
    identity(req),
  );
  res.status(body.operation === "create-draft" ? 201 : 200).json(result);
}
