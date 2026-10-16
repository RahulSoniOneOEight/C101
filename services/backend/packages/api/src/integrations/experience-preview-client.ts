import { MedusaError } from "@medusajs/framework/utils";

/**
 * Private client for the Experience API draft preview projection.
 *
 * This is a separate service and a separate secret from the CMS operator boundary: the preview
 * projection must reuse the delivery mapping rules, and reusing the CMS operator secret for that
 * purpose would conflate two different trust relationships. The browser never calls this service;
 * only the authenticated Medusa admin route does.
 */

export interface BannerPreviewPresentation {
  content_key: string;
  placement: string;
  title: string;
  body?: string;
  image_uri?: string;
  image_alt: string;
  action_label?: string;
  action_uri?: string;
  theme_key: "primary" | "trust" | "promotion" | "neutral";
  priority: number;
}

export type BannerPreviewEligibility = "eligible" | "scheduled" | "expired";

export interface BannerPreviewResponse {
  kind: "banner";
  locale: string;
  presentation: BannerPreviewPresentation | null;
  eligibility: BannerPreviewEligibility;
  complete: boolean;
  illustrative: true;
  generated_at: string;
}

export class ExperiencePreviewClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async previewBanner(
    locale: string,
    data: Record<string, unknown>,
    correlationId: string,
  ): Promise<BannerPreviewResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/internal/content/preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.secret}`,
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({ kind: "banner", locale, data }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Preview service unavailable: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new MedusaError(
        response.status >= 500
          ? MedusaError.Types.UNEXPECTED_STATE
          : MedusaError.Types.INVALID_DATA,
        `Preview service returned HTTP ${response.status}.`,
      );
    }
    return await response.json() as BannerPreviewResponse;
  }
}

export function loadExperiencePreviewClient(): ExperiencePreviewClient {
  const baseUrl = process.env.EXPERIENCE_OPERATOR_BASE_URL?.trim();
  const secret = process.env.EXPERIENCE_OPERATOR_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Draft preview is not configured for this environment.",
    );
  }
  return new ExperiencePreviewClient(baseUrl, secret);
}
