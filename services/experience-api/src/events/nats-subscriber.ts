import { AckPolicy, connect, DeliverPolicy, StringCodec, type NatsConnection } from "nats";

/**
 * NATS JetStream subscriber for cross-system business events. Each consuming service (Mercur,
 * Tryton, reconciliation) uses a durable consumer so it can resume where it left off and acks only
 * after successful processing (at-least-once delivery).
 */

const STREAM = "BUILDKART_EVENTS";
const sc = StringCodec();

export type EventHandler = (payload: Record<string, unknown>, subject: string) => Promise<void>;

export class NatsSubscriber {
  private nc: NatsConnection | null = null;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.nc = await connect({ servers: this.url });
  }

  /**
   * Create (or bind) a durable consumer and process one batch of messages, acking each after its
   * handler succeeds. Returns the number processed.
   */
  async consume(
    durable: string,
    subject: string,
    handler: EventHandler,
    opts: { maxMessages?: number; expiresMs?: number; deliverPolicy?: DeliverPolicy } = {},
  ): Promise<number> {
    if (!this.nc) throw new Error("not connected");
    const js = this.nc.jetstream();
    const jsm = await this.nc.jetstreamManager();
    try {
      await jsm.consumers.add(STREAM, {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: opts.deliverPolicy ?? DeliverPolicy.All,
        filter_subject: subject,
      });
    } catch {
      // durable consumer already exists
    }
    const consumer = await js.consumers.get(STREAM, durable);
    const messages = await consumer.fetch({
      max_messages: opts.maxMessages ?? 10,
      expires: opts.expiresMs ?? 2000,
    });

    let count = 0;
    for await (const msg of messages) {
      try {
        const payload = JSON.parse(sc.decode(msg.data)) as Record<string, unknown>;
        await handler(payload, msg.subject);
      } catch (err) {
        console.warn(`[subscriber:${durable}] handler failed:`, (err as Error).message);
      }
      msg.ack();
      count++;
    }
    return count;
  }

  async close(): Promise<void> {
    await this.nc?.drain();
  }
}
