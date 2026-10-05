import { loadConfig } from "../config.js";
import { NatsSubscriber } from "../events/nats-subscriber.js";

/**
 * Demo NATS consumers proving the cross-system event pipeline end-to-end: the Experience API
 * publishes domain events to JetStream (outbox), and each owner service consumes its slice with a
 * durable consumer. Handlers log the reaction a real consumer would perform.
 */

const config = loadConfig(process.env);
const sub = new NatsSubscriber(config.natsUrl);
await sub.connect();

const consumers = [
  {
    name: "mercur-allocation",
    subject: "commerce.>",
    react: (e: Record<string, unknown>) =>
      `Mercur allocates seller for order ${e.aggregate_id}`,
  },
  {
    name: "tryton-reservation",
    subject: "inventory.>",
    react: (e: Record<string, unknown>) =>
      `Tryton reserves stock — ${e.event_type} (${e.aggregate_id})`,
  },
  {
    name: "reconciliation-tracker",
    subject: "logistics.>",
    react: (e: Record<string, unknown>) =>
      `Reconciliation tracks ${e.event_type} (correlation ${e.correlation_id})`,
  },
];

let total = 0;
for (const c of consumers) {
  const n = await sub.consume(c.name, c.subject, async (e) => {
    console.log(`  [${c.name}] ${c.react(e)}`);
  });
  total += n;
  console.log(`[${c.name}] consumed ${n} message(s)`);
}

console.log(total > 0 ? `PASS: ${total} cross-system event(s) consumed end-to-end` : "FAIL: nothing consumed");
await sub.close();
process.exit(total > 0 ? 0 : 1);
