import { randomUUID } from "node:crypto";
import pg from "pg";

export interface NotificationRecord {
  id: string;
  user_id: string;
  template_key: string;
  title: string;
  body: string;
  deep_link: string | null;
  source_event_id: string | null;
  read_at: string | null;
  test_data: true;
  created_at: string;
}

export interface DeviceRegistration {
  id: string;
  user_id: string;
  token: string;
}

export interface DeliveryAttempt {
  id: string;
  notification_id: string;
  device_registration_id: string;
  status: "pending" | "sent" | "failed" | "dead_lettered";
  attempt_count: number;
}

export class NotificationStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pilot_notification (
        id               text PRIMARY KEY,
        user_id          text NOT NULL,
        template_key     text NOT NULL,
        title            text NOT NULL,
        body             text NOT NULL,
        deep_link        text,
        source_event_id  text,
        read_at          timestamptz,
        test_data        boolean NOT NULL DEFAULT true CHECK (test_data = true),
        created_at       timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pilot_notification_user_created_idx
        ON pilot_notification (user_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_notification_event_user_uidx
        ON pilot_notification (source_event_id, user_id, template_key)
        WHERE source_event_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS pilot_device_registration (
        id                   text PRIMARY KEY,
        user_id              text NOT NULL,
        token                text NOT NULL UNIQUE,
        platform             text NOT NULL CHECK (platform = 'android'),
        firebase_project_id  text NOT NULL CHECK (firebase_project_id = 'buildkart-staging'),
        active               boolean NOT NULL DEFAULT true,
        test_data            boolean NOT NULL DEFAULT true CHECK (test_data = true),
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pilot_device_user_active_idx
        ON pilot_device_registration (user_id, active, updated_at DESC);

      CREATE TABLE IF NOT EXISTS pilot_notification_delivery_attempt (
        id                    text PRIMARY KEY,
        notification_id       text NOT NULL REFERENCES pilot_notification(id) ON DELETE CASCADE,
        device_registration_id text REFERENCES pilot_device_registration(id) ON DELETE SET NULL,
        provider              text NOT NULL CHECK (provider = 'fcm-staging'),
        status                text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'dead_lettered')),
        attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        provider_message_id   text,
        error_code            text,
        next_attempt_at       timestamptz,
        test_data             boolean NOT NULL DEFAULT true CHECK (test_data = true),
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pilot_delivery_status_retry_idx
        ON pilot_notification_delivery_attempt (status, next_attempt_at);
      CREATE UNIQUE INDEX IF NOT EXISTS pilot_delivery_notification_device_uidx
        ON pilot_notification_delivery_attempt (notification_id, device_registration_id)
        WHERE device_registration_id IS NOT NULL;
    `);
  }

  async create(
    userId: string,
    input: {
      templateKey: string;
      title: string;
      body: string;
      deepLink?: string;
      sourceEventId: string;
    },
  ): Promise<NotificationRecord> {
    await this.ready;
    const id = `notification_${randomUUID()}`;
    const inserted = await this.pool.query(
      `INSERT INTO pilot_notification (
         id, user_id, template_key, title, body, deep_link, source_event_id, test_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (source_event_id, user_id, template_key)
         WHERE source_event_id IS NOT NULL
       DO NOTHING
       RETURNING id, user_id, template_key, title, body, deep_link, source_event_id,
                 read_at, test_data, created_at`,
      [id, userId, input.templateKey, input.title, input.body, input.deepLink ?? null, input.sourceEventId],
    );
    if (inserted.rows[0]) return inserted.rows[0] as NotificationRecord;
    const existing = await this.pool.query(
      `SELECT id, user_id, template_key, title, body, deep_link, source_event_id,
              read_at, test_data, created_at
       FROM pilot_notification
       WHERE source_event_id = $1 AND user_id = $2 AND template_key = $3`,
      [input.sourceEventId, userId, input.templateKey],
    );
    if (!existing.rows[0]) throw new Error("Notification idempotency lookup failed.");
    return existing.rows[0] as NotificationRecord;
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationRecord[]> {
    await this.ready;
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await this.pool.query(
      `SELECT id, user_id, template_key, title, body, deep_link, source_event_id,
              read_at, test_data, created_at
       FROM pilot_notification
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, safeLimit],
    );
    return result.rows;
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE pilot_notification SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE pilot_notification SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async registerDevice(userId: string, token: string): Promise<{ id: string }> {
    await this.ready;
    const id = `device_${randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO pilot_device_registration (
         id, user_id, token, platform, firebase_project_id, active, test_data
       ) VALUES ($1, $2, $3, 'android', 'buildkart-staging', true, true)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         active = true,
         firebase_project_id = 'buildkart-staging',
         updated_at = now()
       RETURNING id`,
      [id, userId, token],
    );
    return { id: result.rows[0].id };
  }

  async activeDevices(userId: string): Promise<DeviceRegistration[]> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT id, user_id, token
       FROM pilot_device_registration
       WHERE user_id = $1 AND active = true
       ORDER BY updated_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async beginDelivery(notificationId: string, deviceId: string): Promise<DeliveryAttempt> {
    await this.ready;
    const id = `delivery_${randomUUID()}`;
    const inserted = await this.pool.query(
      `INSERT INTO pilot_notification_delivery_attempt (
         id, notification_id, device_registration_id, provider, status, test_data
       ) VALUES ($1, $2, $3, 'fcm-staging', 'pending', true)
       ON CONFLICT (notification_id, device_registration_id)
         WHERE device_registration_id IS NOT NULL
       DO UPDATE SET
         status = CASE
           WHEN pilot_notification_delivery_attempt.status = 'sent' THEN 'sent'
           ELSE 'pending'
         END,
         updated_at = now()
       RETURNING id, notification_id, device_registration_id, status, attempt_count`,
      [id, notificationId, deviceId],
    );
    return inserted.rows[0] as DeliveryAttempt;
  }

  async deliverySent(attemptId: string, providerMessageId: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE pilot_notification_delivery_attempt
       SET status = 'sent', attempt_count = attempt_count + 1,
           provider_message_id = $2, error_code = NULL, next_attempt_at = NULL, updated_at = now()
       WHERE id = $1`,
      [attemptId, providerMessageId],
    );
  }

  async deliveryFailed(attemptId: string, errorCode: string, retryDelayMs: number): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE pilot_notification_delivery_attempt
       SET status = 'failed', attempt_count = attempt_count + 1,
           error_code = $2,
           next_attempt_at = now() + ($3 * interval '1 millisecond'),
           updated_at = now()
       WHERE id = $1 AND status <> 'sent'`,
      [attemptId, errorCode.slice(0, 200), retryDelayMs],
    );
  }

  async deadLetterSourceEvent(sourceEventId: string, errorCode: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE pilot_notification_delivery_attempt AS delivery
       SET status = 'dead_lettered', error_code = $2, next_attempt_at = NULL, updated_at = now()
       FROM pilot_notification AS notification
       WHERE delivery.notification_id = notification.id
         AND notification.source_event_id = $1
         AND delivery.status <> 'sent'`,
      [sourceEventId, errorCode.slice(0, 200)],
    );
  }

  async deactivateDevice(deviceId: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `UPDATE pilot_device_registration SET active = false, updated_at = now() WHERE id = $1`,
      [deviceId],
    );
  }

  async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE pilot_device_registration SET active = false, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND active = true`,
      [deviceId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  poolStats(): { total: number; idle: number; waiting: number } {
    return { total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
