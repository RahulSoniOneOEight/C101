import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { CmsContentStore } from "../store/cms-content-store.js";

const connectionString = process.env.EXPERIENCE_DATABASE_URL ??
  "postgres://buildkart:buildkart@localhost:5433/buildkart_experience";
const suffix = randomUUID();
const documentId = `cms-store-test-document-${suffix}`;
const projectionKey = `storefront-layout:store-test:${suffix}`;
const eventIds = [`publish-${suffix}`, `older-unpublish-${suffix}`, `newer-unpublish-${suffix}`];
const store = new CmsContentStore(connectionString);

try {
  await store.put({
    projectionKey,
    cmsDocumentId: documentId,
    version: "v2",
    payload: { layout: { layout_key: "store-test" } },
    observedAt: "2026-10-20T10:00:00.000Z",
  });

  const publish = await store.recordWebhook({
    eventId: eventIds[0],
    eventVersion: "v2",
    action: "publish",
    uid: "api::storefront-layout.storefront-layout",
    documentId,
    occurredAt: "2026-10-20T10:01:00.000Z",
  });
  assert.deepEqual(publish, { duplicate: false, applied: true });

  const duplicate = await store.recordWebhook({
    eventId: eventIds[0],
    eventVersion: "v2",
    action: "publish",
    uid: "api::storefront-layout.storefront-layout",
    documentId,
    occurredAt: "2026-10-20T10:01:00.000Z",
  });
  assert.deepEqual(duplicate, { duplicate: true, applied: false });

  const older = await store.recordWebhook({
    eventId: eventIds[1],
    eventVersion: "v1",
    action: "unpublish",
    uid: "api::storefront-layout.storefront-layout",
    documentId,
    occurredAt: "2026-10-20T09:59:00.000Z",
  });
  assert.deepEqual(older, { duplicate: false, applied: false });
  assert.ok(await store.get(projectionKey), "an older unpublish must not revoke newer content");

  const newer = await store.recordWebhook({
    eventId: eventIds[2],
    eventVersion: "v3",
    action: "unpublish",
    uid: "api::storefront-layout.storefront-layout",
    documentId,
    occurredAt: "2026-10-20T10:02:00.000Z",
  });
  assert.deepEqual(newer, { duplicate: false, applied: true });
  assert.equal(await store.get(projectionKey), undefined, "a newer unpublish must revoke last-valid content");

  console.log("cms-content-store-test: PASS (dedupe, out-of-order suppression, unpublish revocation)");
} finally {
  await store.close();
  const cleanup = new pg.Pool({ connectionString, max: 1 });
  await cleanup.query(`DELETE FROM cms_content_projections WHERE projection_key = $1`, [projectionKey]);
  await cleanup.query(`DELETE FROM cms_webhook_receipts WHERE event_id = ANY($1::text[])`, [eventIds]);
  await cleanup.query(`DELETE FROM cms_document_webhook_state WHERE document_id = $1`, [documentId]);
  await cleanup.end();
}
