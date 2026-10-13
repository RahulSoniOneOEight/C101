import { createHash, createHmac } from "node:crypto";
import type { Core } from "@strapi/strapi";

const EDITORIAL_UIDS = new Set([
  "api::banner.banner",
  "api::storefront-layout.storefront-layout",
  "api::curated-collection.curated-collection",
  "api::product-editorial.product-editorial",
  "api::category-editorial.category-editorial",
  "api::faq-article.faq-article",
]);

type DocumentAction = "publish" | "unpublish";
type DocumentContext = {
  uid: string;
  action: string;
  params?: { documentId?: string; locale?: string };
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstDocument(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return object(value[0]);
  const result = object(value);
  if (Array.isArray(result?.documents)) return object(result.documents[0]);
  return result;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function deliverWebhook(
  strapi: Core.Strapi,
  context: DocumentContext,
  action: DocumentAction,
  result: unknown,
): Promise<void> {
  const webhookUrl = process.env.CMS_WEBHOOK_URL?.trim();
  const secret = process.env.CMS_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) return;

  const document = firstDocument(result);
  const occurredAt = new Date().toISOString();
  const documentId =
    stringValue(document?.documentId) ??
    stringValue(context.params?.documentId);
  if (!documentId) {
    strapi.log.warn(`[cms-webhook] ${context.uid} ${action} had no documentId; notification skipped`);
    return;
  }
  const locale = stringValue(document?.locale) ?? stringValue(context.params?.locale);
  const version =
    stringValue(document?.updatedAt) ??
    stringValue(document?.publishedAt) ??
    occurredAt;
  const eventId = `cms_${createHash("sha256")
    .update(`${context.uid}|${documentId}|${action}|${version}|${locale ?? ""}`)
    .digest("hex")}`;
  const rawBody = JSON.stringify({
    schema_version: 1,
    event_id: eventId,
    event: `entry.${action}`,
    uid: context.uid,
    document_id: documentId,
    ...(locale ? { locale } : {}),
    version,
    occurred_at: occurredAt,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cms-webhook-id": eventId,
          "x-cms-webhook-timestamp": timestamp,
          "x-cms-webhook-signature": `v1=${signature}`,
        },
        body: rawBody,
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = (error as Error).message;
    }
    if (attempt < 3) await sleep(attempt * 250);
  }
  strapi.log.warn(`[cms-webhook] delivery failed after 3 attempts: ${lastError}`);
}

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.documents.use(async (context, next) => {
      const result = await next();
      const uid = String(context.uid);
      const action = String(context.action);
      if (
        EDITORIAL_UIDS.has(uid) &&
        (action === "publish" || action === "unpublish")
      ) {
        // Publishing is not rolled back when the consumer is unavailable. The Experience API also
        // polls with a short TTL, while this best-effort notification retries and accelerates cache
        // invalidation when both services are healthy.
        void deliverWebhook(
          strapi,
          context as unknown as DocumentContext,
          action,
          result,
        );
      }
      return result;
    });
  },
};
