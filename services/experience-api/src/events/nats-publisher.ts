import { connect, StringCodec, type JetStreamClient, type NatsConnection } from "nats";

/**
 * NATS JetStream publisher for cross-system business events (outbox → NATS).
 *
 * Distinction (per the target architecture): Medusa's *internal* jobs/events stay on Redis/BullMQ;
 * only *cross-system* domain events (order created, inventory reservation, shipment) are published to
 * NATS JetStream so Mercur, Tryton and reconciliation can subscribe. The Experience API's durable
 * `domain_event` table is the transactional outbox; this publisher drains it.
 */

const SUBJECT_BY_EVENT: Record<string, string> = {
  "order.confirmed": "commerce.order.created.v1",
  "inventory.reservation_created": "inventory.reservation.created.v1",
  "inventory.reservation_committed": "inventory.reservation.committed.v1",
  "inventory.reservation_released": "inventory.reservation.released.v1",
  "shipment.status_changed": "logistics.shipment.status-changed.v1",
};

export function eventSubject(eventType: string): string {
  return SUBJECT_BY_EVENT[eventType] ?? `buildkart.${eventType}`;
}

const STREAM = "BUILDKART_EVENTS";
const sc = StringCodec();

export class NatsPublisher {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;

  constructor(
    private readonly url: string,
    private readonly auth?: { user?: string; password?: string },
  ) {}

  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.url,
      ...(this.auth?.user ? { user: this.auth.user, pass: this.auth.password } : {}),
    });
    const jsm = await this.nc.jetstreamManager();
    try {
      await jsm.streams.add({
        name: STREAM,
        subjects: ["commerce.>", "inventory.>", "logistics.>", "buildkart.>"],
      });
    } catch {
      // stream already exists
    }
    this.js = this.nc.jetstream();
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    if (!this.js) throw new Error("NATS not connected");
    await this.js.publish(subject, sc.encode(JSON.stringify(payload)));
  }

  get connected(): boolean {
    return this.js !== null;
  }

  /** Pending+ack-pending message count per durable consumer (operational lag / backpressure). */
  async consumerLag(names: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    if (!this.nc) return result;
    const jsm = await this.nc.jetstreamManager();
    for (const name of names) {
      try {
        const info = await jsm.consumers.info(STREAM, name);
        result[name] = (info.num_pending ?? 0) + (info.num_ack_pending ?? 0);
      } catch {
        result[name] = -1;
      }
    }
    return result;
  }

  async close(): Promise<void> {
    await this.nc?.drain();
  }
}
