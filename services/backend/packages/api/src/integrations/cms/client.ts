export type CmsContentType = "banners" | "campaigns" | "curated-collections" | "storefront-layouts";

export interface CmsDocument {
  documentId: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  [key: string]: unknown;
}

export interface CmsHealth {
  status: "ok";
  service: string;
  environment: string;
  test_data: true;
}

export interface CmsListResponse {
  data: CmsDocument[];
  meta: {
    status?: "draft" | "published";
    count: number;
    test_data: true;
  };
}

export interface CmsCommandResponse {
  data: CmsDocument | CmsDocument[] | null;
  meta: {
    commandId: string;
    idempotentReplay?: boolean;
    test_data?: true;
  };
}

export interface CmsAuditRecord extends CmsDocument {
  commandId: string;
  correlationId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  reason: string;
  outcome: "succeeded" | "failed";
  testData: true;
}

export interface CmsAuditResponse {
  data: CmsAuditRecord[];
  meta: { count: number; test_data: true };
}

export type CmsCommand =
  | { operation: "create"; type: CmsContentType; data: Record<string, unknown> }
  | { operation: "update"; type: CmsContentType; documentId: string; data: Record<string, unknown> }
  | { operation: "publish" | "unpublish"; type: CmsContentType; documentId: string };

export interface CmsCommandContext {
  commandId: string;
  correlationId: string;
  actorId: string;
  reason: string;
}

export class CmsUnavailableError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
    this.name = "CmsUnavailableError";
  }
}

export class BuildKartCmsClient {
  private readonly baseUrl: string;
  private readonly internalKey: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.baseUrl = (env.CMS_BASE_URL ?? "http://cms:1337").replace(/\/$/, "");
    this.internalKey = env.CMS_INTERNAL_KEY?.trim() ?? "";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.internalKey) {
      throw new CmsUnavailableError("CMS_INTERNAL_KEY is not configured.");
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/buildkart${path}`, {
        ...init,
        signal: AbortSignal.timeout(5000),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-buildkart-cms-key": this.internalKey,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new CmsUnavailableError(`CMS request failed: ${(error as Error).message}`);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && typeof body === "object" && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
      throw new CmsUnavailableError(`CMS rejected the request: ${detail}`, response.status);
    }
    return body as T;
  }

  health(): Promise<CmsHealth> {
    return this.request<CmsHealth>("/health");
  }

  list(type: CmsContentType, status: "draft" | "published" = "draft"): Promise<CmsListResponse> {
    return this.request<CmsListResponse>(`/content/${type}?status=${status}`);
  }

  audit(limit = 100): Promise<CmsAuditResponse> {
    return this.request<CmsAuditResponse>(`/audit?limit=${Math.max(1, Math.min(limit, 200))}`);
  }

  execute(command: CmsCommand, context: CmsCommandContext): Promise<CmsCommandResponse> {
    const documentPath = "documentId" in command ? `/${command.documentId}` : "";
    const operationPath = command.operation === "publish" || command.operation === "unpublish"
      ? `/${command.operation}`
      : "";
    return this.request<CmsCommandResponse>(`/content/${command.type}${documentPath}${operationPath}`, {
      method: "POST",
      headers: {
        "idempotency-key": context.commandId,
        "x-correlation-id": context.correlationId,
        "x-buildkart-actor-id": context.actorId,
      },
      body: JSON.stringify({
        reason: context.reason,
        ...(command.operation === "create" || command.operation === "update" ? { data: command.data } : {}),
      }),
    });
  }
}
