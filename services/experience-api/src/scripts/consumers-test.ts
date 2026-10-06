import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import { EventWorkers } from "../events/event-workers.js";
import { NatsPublisher } from "../events/nats-publisher.js";

/**
 * E-017 cross-system operational-consumer evidence.
 *
 * Proves the continuously running workers process events as they arrive, are idempotent against a
 * duplicate event id, and dead-letter a poison message after the retry cap instead of blocking.
 */

const config = loadConfig(process.env);
const runId = Date.now();
const okName = `test-ok-${runId}`;
const poisonName = `test-poison-${runId}`;
const okSubject = `buildkart.test.ok.${runId}`;
const poisonSubject = `buildkart.test.poison.${runId}`;

const workers = new EventWorkers(config.natsUrl);
await workers.connect();
await workers.start(
  [
    {
      name: okName,
      subject: okSubject,
      handle: async (event) => {
        assert.equal(event.event_type, "test.ok");
      },
    },
    {
      name: poisonName,
      subject: poisonSubject,
      handle: async () => {
        throw new Error("poison message");
      },
    },
  ],
  { maxDeliver: 2 },
);

const publisher = new NatsPublisher(config.natsUrl);
await publisher.connect();

// Normal event, then the same event id again to prove in-run idempotency.
await publisher.publish(okSubject, { id: `ok-${runId}`, event_type: "test.ok", aggregate_id: "a1" });
await publisher.publish(okSubject, { id: `ok-${runId}`, event_type: "test.ok", aggregate_id: "a1" });
// Poison event: always fails, must be dead-lettered after maxDeliver rather than looping forever.
await publisher.publish(poisonSubject, {
  id: `poison-${runId}`,
  event_type: "test.poison",
  aggregate_id: "p1",
});

const statsOf = (name: string) => workers.stats().find((s) => s.name === name)!;

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await Bun.sleep(100);
  }
  return false;
}

try {
  const ok = await waitFor(
    () => statsOf(okName).processed >= 1 && statsOf(okName).duplicates >= 1,
    15_000,
  );
  assert.equal(ok, true, "ok consumer did not process and dedupe");
  assert.equal(statsOf(okName).processed, 1, "duplicate event must not be processed twice");

  const dlq = await waitFor(() => statsOf(poisonName).deadLettered >= 1, 20_000);
  assert.equal(dlq, true, "poison consumer was not dead-lettered");
  assert.ok(
    statsOf(poisonName).failed >= 2,
    "poison handler should fail at least maxDeliver times before dead-lettering",
  );

  console.log("PASS: continuous consumers process, dedupe and dead-letter.");
  console.log(
    `  ok: processed=${statsOf(okName).processed} duplicates=${statsOf(okName).duplicates}`,
  );
  console.log(
    `  poison: failed=${statsOf(poisonName).failed} deadLettered=${statsOf(poisonName).deadLettered}`,
  );
} finally {
  await workers.stop();
  await publisher.close();
}
