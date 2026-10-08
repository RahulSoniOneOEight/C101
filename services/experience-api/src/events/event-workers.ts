import {
  AckPolicy,
  DeliverPolicy,
  StringCodec,
  connect,
  type Consumer,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from "nats";
import type { EventHandler } from "./nats-subscriber.js";

/**
 * Continuously running, service-owned JetStream consumers for cross-system domain events.
 *
 * Unlike the bounded batch harness (`nats-consume.ts`), this keeps a worker alive per owning
 * service, so events are processed as they arrive instead of only when a script is run. It adds the
 * operational guarantees the pilot needs:
 * - at-least-once delivery with explicit ack only after the handler succeeds;
 * - bounded retry with `nak` backoff;
 * - dead-lettering of poison messages after `maxDeliver`, so one bad event cannot block the stream;
 * - idempotent processing within the run (duplicate event ids are acked without re-handling);
 * - per-consumer lag, processed/failed/dead-letter counters for operational visibility.
 */

const STREAM = "BUILDKART_EVENTS";
export const DEFAULT_DLQ_SUBJECT = "buildkart.dlq.v1";
const sc = StringCodec();

export interface WorkerDefinition {
  /** Durable consumer name (one per owning service). */
  name: string;
  /** JetStream filter subject, e.g. `commerce.>`. */
  subject: string;
  /** Reaction performed by the owning service. Must be idempotent. */
  handle: EventHandler;
  /** Persist consumer-specific terminal failure state before the broker message is acknowledged. */
  onDeadLetter?: (event: Record<string, unknown>, error: string) => Promise<void>;
}

export interface WorkerStats {
  name: string;
  subject: string;
  processed: number;
  duplicates: number;
  failed: number;
  deadLettered: number;
  lag: number;
  lastError: string | null;
  lastActivityAt: string | null;
}

interface WorkerRuntime {
  definition: WorkerDefinition;
  stats: WorkerStats;
  seen: Set<string>;
  stopping: boolean;
}

export class EventWorkers {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private readonly runtimes: WorkerRuntime[] = [];
  private readonly loops: Promise<void>[] = [];
  private stopping = false;

  constructor(
    private readonly url: string,
    private readonly dlqSubject: string = DEFAULT_DLQ_SUBJECT,
    private readonly dedupeWindow = 5000,
    private readonly auth?: { user?: string; password?: string },
  ) {}

  async connect(): Promise<void> {
    this.nc = await connect({
      servers: this.url,
      ...(this.auth?.user ? { user: this.auth.user, pass: this.auth.password } : {}),
    });
    this.js = this.nc.jetstream();
    this.jsm = await this.nc.jetstreamManager();
  }

  get connected(): boolean {
    return this.js !== null;
  }

  async start(
    definitions: WorkerDefinition[],
    opts: { maxDeliver?: number } = {},
  ): Promise<void> {
    if (!this.nc || !this.js || !this.jsm) throw new Error("connect() before start()");
    const maxDeliver = opts.maxDeliver ?? 5;
    for (const definition of definitions) {
      try {
        await this.jsm.consumers.add(STREAM, {
          durable_name: definition.name,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          filter_subject: definition.subject,
          max_deliver: maxDeliver,
        });
      } catch {
        // durable consumer already exists
      }
      const runtime: WorkerRuntime = {
        definition,
        seen: new Set(),
        stopping: false,
        stats: {
          name: definition.name,
          subject: definition.subject,
          processed: 0,
          duplicates: 0,
          failed: 0,
          deadLettered: 0,
          lag: 0,
          lastError: null,
          lastActivityAt: null,
        },
      };
      this.runtimes.push(runtime);
      this.loops.push(this.run(runtime, maxDeliver));
    }
  }

  private async run(runtime: WorkerRuntime, maxDeliver: number): Promise<void> {
    const consumer = await this.js!.consumers.get(STREAM, runtime.definition.name);
    while (!this.stopping && !runtime.stopping) {
      let messages;
      try {
        messages = await consumer.fetch({ max_messages: 10, expires: 1000 });
      } catch {
        await Bun.sleep(250);
        continue;
      }
      for await (const msg of messages) {
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(sc.decode(msg.data)) as Record<string, unknown>;
        } catch {
          payload = {};
        }
        const eventId = String(payload.id ?? msg.seq);
        try {
          if (runtime.seen.has(eventId)) {
            runtime.stats.duplicates++;
            msg.ack();
            continue;
          }
          await runtime.definition.handle(payload, msg.subject);
          runtime.seen.add(eventId);
          if (runtime.seen.size > this.dedupeWindow) {
            const oldest = runtime.seen.values().next().value;
            if (oldest !== undefined) runtime.seen.delete(oldest);
          }
          runtime.stats.processed++;
          runtime.stats.lastActivityAt = new Date().toISOString();
          msg.ack();
        } catch (error) {
          const message = (error as Error).message;
          runtime.stats.failed++;
          runtime.stats.lastError = message;
          runtime.stats.lastActivityAt = new Date().toISOString();
          const deliveryCount = msg.info?.deliveryCount ?? 1;
          if (deliveryCount >= maxDeliver) {
            await this.deadLetter(runtime, msg.subject, payload, message, deliveryCount);
            try {
              await runtime.definition.onDeadLetter?.(payload, message);
            } catch (deadLetterError) {
              runtime.stats.lastError = `${message}; terminal-state update failed: ${(deadLetterError as Error).message}`;
            }
            runtime.stats.deadLettered++;
            msg.ack();
          } else {
            msg.nak(500);
          }
        }
      }
      await this.refreshLag(runtime, consumer);
    }
  }

  private async deadLetter(
    runtime: WorkerRuntime,
    subject: string,
    payload: Record<string, unknown>,
    error: string,
    deliveryCount: number,
  ): Promise<void> {
    await this.js!.publish(
      this.dlqSubject,
      sc.encode(
        JSON.stringify({
          consumer: runtime.definition.name,
          original_subject: subject,
          error,
          delivery_count: deliveryCount,
          dead_lettered_at: new Date().toISOString(),
          payload,
        }),
      ),
    );
  }

  private async refreshLag(runtime: WorkerRuntime, consumer: Consumer): Promise<void> {
    try {
      const info = await consumer.info();
      runtime.stats.lag = (info.num_pending ?? 0) + (info.num_ack_pending ?? 0);
    } catch {
      // lag is best-effort telemetry
    }
  }

  stats(): WorkerStats[] {
    return this.runtimes.map((runtime) => ({ ...runtime.stats }));
  }

  /** Prometheus-style exposition for the operational /metrics endpoint. */
  metrics(): string {
    const lines: string[] = [];
    for (const runtime of this.runtimes) {
      const name = runtime.definition.name;
      const stats = runtime.stats;
      const label = `{consumer="${name}"}`;
      lines.push(`buildkart_worker_processed_total${label} ${stats.processed}`);
      lines.push(`buildkart_worker_duplicates_total${label} ${stats.duplicates}`);
      lines.push(`buildkart_worker_failed_total${label} ${stats.failed}`);
      lines.push(`buildkart_worker_dead_lettered_total${label} ${stats.deadLettered}`);
      lines.push(`buildkart_worker_lag${label} ${stats.lag}`);
    }
    lines.push(`buildkart_worker_consumers ${this.runtimes.length}`);
    return `${lines.join("\n")}\n`;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const runtime of this.runtimes) runtime.stopping = true;
    await Promise.race([
      Promise.allSettled(this.loops).then(() => undefined),
      Bun.sleep(3000),
    ]);
    await this.nc?.drain();
  }
}
