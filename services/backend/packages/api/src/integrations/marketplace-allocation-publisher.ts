import {
  StringCodec,
  connect,
  type JetStreamClient,
  type NatsConnection,
  type PubAck,
} from "nats";
import {
  MARKETPLACE_ALLOCATION_SUBJECT,
  type MarketplaceAllocationEvent,
} from "./marketplace-allocation-event";

const STREAM = "BUILDKART_EVENTS";
const STREAM_SUBJECTS = [
  "commerce.>",
  "inventory.>",
  "logistics.>",
  "return.>",
  "marketplace-allocation.>",
  "buildkart.>",
];
const codec = StringCodec();

/** JetStream publisher owned by the Mercur worker process. */
export class MarketplaceAllocationPublisher {
  private connection: NatsConnection | null = null;
  private jetstream: JetStreamClient | null = null;
  private connecting: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    private readonly auth?: { user?: string; password?: string },
  ) {}

  async connect(): Promise<void> {
    if (this.jetstream) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async open(): Promise<void> {
    const connection = await connect({
      servers: this.url,
      ...(this.auth?.user
        ? { user: this.auth.user, pass: this.auth.password }
        : {}),
    });
    const manager = await connection.jetstreamManager();
    try {
      const info = await manager.streams.info(STREAM);
      const configured = info.config.subjects ?? [];
      const subjects = [...new Set([...configured, ...STREAM_SUBJECTS])];
      if (subjects.length !== configured.length) {
        await manager.streams.update(STREAM, { subjects });
      }
    } catch {
      await manager.streams.add({ name: STREAM, subjects: STREAM_SUBJECTS });
    }
    this.connection = connection;
    this.jetstream = connection.jetstream();
  }

  async publish(event: MarketplaceAllocationEvent): Promise<PubAck> {
    await this.connect();
    if (!this.jetstream)
      throw new Error("Mercur allocation publisher is not connected.");
    return this.jetstream.publish(
      MARKETPLACE_ALLOCATION_SUBJECT,
      codec.encode(JSON.stringify(event)),
      { msgID: event.id },
    );
  }

  async close(): Promise<void> {
    await this.connection?.drain();
    this.connection = null;
    this.jetstream = null;
  }
}
