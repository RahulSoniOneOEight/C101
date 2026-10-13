import { createHmac, timingSafeEqual } from "node:crypto";

export const CMS_EDITORIAL_UIDS = new Set([
  "api::banner.banner",
  "api::storefront-layout.storefront-layout",
  "api::curated-collection.curated-collection",
  "api::product-editorial.product-editorial",
  "api::category-editorial.category-editorial",
  "api::faq-article.faq-article",
]);

export interface CmsWebhookPayload {
  schema_version: 1;
  event_id: string;
  event: "entry.publish" | "entry.unpublish";
  uid: string;
  document_id: string;
  locale?: string;
  version: string;
  occurred_at: string;
}

export type CmsWebhookVerification =
  | { ok: true; payload: CmsWebhookPayload }
  | { ok: false; status: 400 | 401; reason: string };

function safeHexEqual(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(supplied, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signCmsWebhook(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyCmsWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  now: Date,
  toleranceSeconds: number,
): CmsWebhookVerification {
  const timestamp = headers.get("x-cms-webhook-timestamp")?.trim() ?? "";
  const eventId = headers.get("x-cms-webhook-id")?.trim() ?? "";
  const signatureHeader = headers.get("x-cms-webhook-signature")?.trim() ?? "";
  const signature = signatureHeader.startsWith("v1=") ? signatureHeader.slice(3) : "";
  if (!timestamp || !eventId || !signature) {
    return { ok: false, status: 401, reason: "missing-signature-headers" };
  }
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { ok: false, status: 401, reason: "invalid-signature-timestamp" };
  }
  const age = Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds);
  if (age > toleranceSeconds) {
    return { ok: false, status: 401, reason: "expired-signature-timestamp" };
  }
  const expected = signCmsWebhook(rawBody, timestamp, secret);
  if (!safeHexEqual(expected, signature)) {
    return { ok: false, status: 401, reason: "invalid-signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, reason: "invalid-json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, reason: "invalid-payload" };
  }
  const value = parsed as Record<string, unknown>;
  const event = value.event;
  const occurredAt = typeof value.occurred_at === "string" ? value.occurred_at : "";
  if (
    value.schema_version !== 1 ||
    value.event_id !== eventId ||
    (event !== "entry.publish" && event !== "entry.unpublish") ||
    typeof value.uid !== "string" ||
    !CMS_EDITORIAL_UIDS.has(value.uid) ||
    typeof value.document_id !== "string" ||
    !value.document_id.trim() ||
    typeof value.version !== "string" ||
    !value.version.trim() ||
    !occurredAt ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    return { ok: false, status: 400, reason: "invalid-payload" };
  }
  return { ok: true, payload: value as unknown as CmsWebhookPayload };
}
