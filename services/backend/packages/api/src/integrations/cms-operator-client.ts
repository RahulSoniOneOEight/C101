import { MedusaError } from "@medusajs/framework/utils";

export const CMS_CONTENT_KINDS = [
  "storefront-layout",
  "banner",
  "curated-collection",
  "category-editorial",
  "product-editorial",
  "faq-article",
] as const;

export type CmsContentKind = (typeof CMS_CONTENT_KINDS)[number];
export type CmsPublicationStatus = "draft" | "published" | "modified";
export type CmsFieldType = "string" | "text" | "richtext" | "enum" | "datetime" | "integer" | "url" | "json";

export interface CmsContentField {
  name: string;
  label: string;
  type: CmsFieldType;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface CmsContentDefinition {
  kind: CmsContentKind;
  label: string;
  description: string;
  keyField: string;
  titleField: string;
  fields: CmsContentField[];
}

export interface CmsContentDocument {
  documentId: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  publicationStatus: CmsPublicationStatus;
  [key: string]: unknown;
}

export interface CmsContentListResponse {
  kind: CmsContentKind;
  locale: string;
  definition: CmsContentDefinition;
  documents: CmsContentDocument[];
}

export type CmsMutationOperation = "create-draft" | "update-draft" | "publish" | "unpublish";

export interface CmsMutationRequest {
  operation: CmsMutationOperation;
  documentId?: string;
  locale: string;
  data?: Record<string, unknown>;
}

export interface CmsMutationResponse {
  kind: CmsContentKind;
  operation: CmsMutationOperation;
  document: Omit<CmsContentDocument, "publicationStatus"> | null;
}

interface OperatorIdentity {
  actorId: string;
  correlationId: string;
}

export class CmsOperatorClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async list(
    kind: CmsContentKind,
    locale: string,
    identity: OperatorIdentity,
  ): Promise<CmsContentListResponse> {
    const query = new URLSearchParams({ locale });
    return this.request<CmsContentListResponse>(
      `/api/operator-content/${encodeURIComponent(kind)}?${query}`,
      { method: "GET" },
      identity,
    );
  }

  async mutate(
    kind: CmsContentKind,
    input: CmsMutationRequest,
    identity: OperatorIdentity,
  ): Promise<CmsMutationResponse> {
    return this.request<CmsMutationResponse>(
      `/api/operator-content/${encodeURIComponent(kind)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
      identity,
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    identity: OperatorIdentity,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${this.secret}`,
          "x-cms-operator-id": identity.actorId,
          "x-correlation-id": identity.correlationId,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `CMS operator service unavailable: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      let message = `CMS operator service returned HTTP ${response.status}.`;
      try {
        const body = await response.json() as { error?: { message?: string }; message?: string };
        message = body.error?.message ?? body.message ?? message;
      } catch {
        // Keep the status-only message; never echo HTML or credentials into the admin response.
      }
      throw new MedusaError(
        response.status >= 500 ? MedusaError.Types.UNEXPECTED_STATE : MedusaError.Types.INVALID_DATA,
        message,
      );
    }
    return await response.json() as T;
  }
}

export function loadCmsOperatorClient(): CmsOperatorClient {
  const baseUrl = process.env.CMS_OPERATOR_BASE_URL?.trim();
  const secret = process.env.CMS_OPERATOR_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "CMS operator integration is not configured.");
  }
  return new CmsOperatorClient(baseUrl, secret);
}
