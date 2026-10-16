import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { randomUUID } from "node:crypto";
import { loadCmsOperatorClient } from "../../../../../integrations/cms-operator-client";
import {
  loadExperiencePreviewClient,
  type BannerPreviewResponse,
} from "../../../../../integrations/experience-preview-client";
import type { AdminPreviewCmsContentType } from "../validators";

/**
 * Authenticated draft preview.
 *
 * The browser posts unsaved form values here. This handler allowlists them against the live CMS
 * content definition, then asks the Experience API for the projection produced by the same mapping
 * rules that deliver published content. Neither the CMS credential nor the preview secret reaches
 * the browser, and the preview never persists anything.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<AdminPreviewCmsContentType>,
  res: MedusaResponse<BannerPreviewResponse>,
): Promise<void> {
  const body = req.validatedBody;
  if (body.kind !== "banner") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Draft preview is available for banners only in this increment.",
    );
  }

  const incoming = req.headers["x-correlation-id"];
  const correlationId =
    typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();

  const operator = loadCmsOperatorClient();
  const definitionResponse = await operator.list(body.kind, body.locale, {
    actorId: req.auth_context.actor_id,
    correlationId,
  });
  const allowed = new Set(definitionResponse.definition.fields.map((field) => field.name));
  const data = Object.fromEntries(
    Object.entries(body.data).filter(([key]) => allowed.has(key)),
  );

  const preview = await loadExperiencePreviewClient().previewBanner(
    body.locale,
    data,
    correlationId,
  );
  res.json(preview);
}
