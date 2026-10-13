import pg from "pg";

export interface StoredCmsProjection<T> {
  projectionKey: string;
  cmsDocumentId: string;
  version: string;
  payload: T;
  observedAt: string;
  invalidatedAt?: string;
}

export interface CmsWebhookRecord {
  eventId: string;
  eventVersion: string;
  action: "publish" | "unpublish";
  uid: string;
  documentId: string;
  occurredAt: string;
}

/**
 * Durable editorial read-model storage. Webhooks only invalidate this projection; content is always
 * re-read from Strapi before replacing it, so replayed or out-of-order events cannot inject content.
 */
export class CmsContentStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 3 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cms_content_projections (
        projection_key   text PRIMARY KEY,
        cms_document_id  text NOT NULL,
        version          text NOT NULL,
        payload          jsonb NOT NULL,
        observed_at      timestamptz NOT NULL,
        invalidated_at   timestamptz,
        revoked          boolean NOT NULL DEFAULT false,
        test_data        boolean NOT NULL DEFAULT true CHECK (test_data = true)
      );
      CREATE INDEX IF NOT EXISTS cms_content_projections_document_idx
        ON cms_content_projections (cms_document_id);

      CREATE TABLE IF NOT EXISTS cms_webhook_receipts (
        event_id        text PRIMARY KEY,
        event_version   text NOT NULL,
        action          text NOT NULL CHECK (action IN ('publish', 'unpublish')),
        cms_uid         text NOT NULL,
        document_id     text NOT NULL,
        occurred_at     timestamptz NOT NULL,
        received_at     timestamptz NOT NULL DEFAULT now(),
        test_data       boolean NOT NULL DEFAULT true CHECK (test_data = true)
      );

      CREATE TABLE IF NOT EXISTS cms_document_webhook_state (
        document_id     text PRIMARY KEY,
        last_event_id   text NOT NULL,
        last_event_at   timestamptz NOT NULL,
        revoked         boolean NOT NULL,
        updated_at      timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async get<T>(projectionKey: string): Promise<StoredCmsProjection<T> | undefined> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT projection_key, cms_document_id, version, payload, observed_at, invalidated_at
       FROM cms_content_projections
       WHERE projection_key = $1 AND revoked = false`,
      [projectionKey],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      projectionKey: row.projection_key,
      cmsDocumentId: row.cms_document_id,
      version: row.version,
      payload: row.payload as T,
      observedAt: new Date(row.observed_at).toISOString(),
      invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at).toISOString() : undefined,
    };
  }

  async put<T>(input: StoredCmsProjection<T>): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO cms_content_projections (
         projection_key, cms_document_id, version, payload, observed_at,
         invalidated_at, revoked, test_data
       ) VALUES ($1, $2, $3, $4, $5, NULL, false, true)
       ON CONFLICT (projection_key) DO UPDATE SET
         cms_document_id = EXCLUDED.cms_document_id,
         version = EXCLUDED.version,
         payload = EXCLUDED.payload,
         observed_at = EXCLUDED.observed_at,
         invalidated_at = NULL,
         revoked = false,
         test_data = true`,
      [
        input.projectionKey,
        input.cmsDocumentId,
        input.version,
        JSON.stringify(input.payload),
        input.observedAt,
      ],
    );
  }

  async clear(projectionKey: string): Promise<void> {
    await this.ready;
    await this.pool.query(`DELETE FROM cms_content_projections WHERE projection_key = $1`, [projectionKey]);
  }

  async recordWebhook(
    input: CmsWebhookRecord,
  ): Promise<{ duplicate: boolean; applied: boolean }> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const receipt = await client.query(
        `INSERT INTO cms_webhook_receipts (
           event_id, event_version, action, cms_uid, document_id, occurred_at, test_data
         ) VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [input.eventId, input.eventVersion, input.action, input.uid, input.documentId, input.occurredAt],
      );
      if (receipt.rowCount === 0) {
        await client.query("COMMIT");
        return { duplicate: true, applied: false };
      }

      const state = await client.query(
        `INSERT INTO cms_document_webhook_state (
           document_id, last_event_id, last_event_at, revoked, updated_at
         ) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (document_id) DO UPDATE SET
           last_event_id = EXCLUDED.last_event_id,
           last_event_at = EXCLUDED.last_event_at,
           revoked = EXCLUDED.revoked,
           updated_at = now()
         WHERE EXCLUDED.last_event_at > cms_document_webhook_state.last_event_at
         RETURNING document_id`,
        [input.documentId, input.eventId, input.occurredAt, input.action === "unpublish"],
      );
      const applied = (state.rowCount ?? 0) > 0;
      if (applied) {
        if (input.uid === "api::storefront-layout.storefront-layout") {
          await client.query(
            `UPDATE cms_content_projections
             SET invalidated_at = now(),
                 revoked = CASE
                   WHEN cms_document_id = $1 AND $2 = true THEN true
                   ELSE revoked
                 END
             WHERE projection_key LIKE 'storefront-layout:%'`,
            [input.documentId, input.action === "unpublish"],
          );
        }
      }
      await client.query("COMMIT");
      return { duplicate: false, applied };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
