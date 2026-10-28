import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DeliverPolicy, connect } from "nats";
import { loadConfig } from "../config.js";
import { NatsPublisher, eventSubject } from "../events/nats-publisher.js";
import { NatsSubscriber } from "../events/nats-subscriber.js";
import { NotificationProcessor } from "../notifications/processor.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { NotificationStore } from "../store/notification-store.js";

/**
 * CHG-087 isolated event proof. It publishes both canonical closure subjects through JetStream,
 * forces one handler retry per event, republishes the same event ids to prove dedupe, and verifies
 * exactly one owner notification per source event. Run only against disposable local services.
 */
if (process.env.CHG087_ISOLATED_ACCEPTANCE !== "true") {
  throw new Error(
    "Set CHG087_ISOLATED_ACCEPTANCE=true and point the database/NATS URLs at disposable local services.",
  );
}

const config = loadConfig(process.env);
const suffix = randomUUID().slice(0, 8);
const checkoutRef = `chg087_event_checkout_${suffix}`;
const returnId = `chg087_event_return_${suffix}`;
const ownerId = `chg087_event_owner_${suffix}`;
const otherId = `chg087_event_other_${suffix}`;
const inspectionId = randomUUID();
const refundId = randomUUID();
const sourceEventIds = new Set<string>([inspectionId, refundId]);
const inspectionSubject = eventSubject("return.inspection_completed");
const refundSubject = eventSubject("return.refund_simulation_recorded");
const inspectionDurable = `chg087-inspection-${suffix}`;
const refundDurable = `chg087-refund-${suffix}`;

assert.equal(inspectionSubject, "return.inspection-completed.v1");
assert.equal(refundSubject, "return.refund-simulation-recorded.v1");
assert.notEqual(refundSubject, "return.refund-paid.v1");

const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const notifications = new NotificationStore(config.experienceDatabaseUrl);
const processor = new NotificationProcessor(
  notifications,
  correlation,
  [ownerId, otherId],
  null,
);
const publisher = new NatsPublisher(config.natsUrl, {
  user: config.natsUser,
  password: config.natsPassword,
});
const subscriber = new NatsSubscriber(config.natsUrl);
const pool = new pg.Pool({ connectionString: config.experienceDatabaseUrl });
const attempts = new Map<string, number>();
const seen = new Set<string>();
const duplicates = new Map<string, number>();
const receivedSubjects = new Map<string, string>();

const inspectionEvent = {
  id: inspectionId,
  event_type: "return.inspection_completed",
  aggregate_type: "return",
  aggregate_id: returnId,
  correlation_id: `chg087-events-${suffix}`,
  payload: {
    return_id: returnId,
    order_id: checkoutRef,
    status: "inspection_complete",
    test_data: true,
    simulated: true,
    money_effect: "none",
    stock_effect: "none",
  },
};
const refundEvent = {
  id: refundId,
  event_type: "return.refund_simulation_recorded",
  aggregate_type: "return",
  aggregate_id: returnId,
  correlation_id: `chg087-events-${suffix}`,
  payload: {
    return_id: returnId,
    order_id: checkoutRef,
    status: "simulated_completed",
    simulation_reference: `SIM-EVENT-${suffix.toUpperCase()}`,
    test_data: true,
    simulated: true,
    money_effect: "none",
    stock_effect: "none",
  },
};

const handle = async (event: Record<string, unknown>, subject: string) => {
  const id = String(event.id ?? "");
  assert.ok(id);
  const payload = event.payload as Record<string, unknown>;
  assert.equal(payload.test_data, true);
  assert.equal(payload.simulated, true);
  assert.equal(payload.money_effect, "none");
  assert.equal(payload.stock_effect, "none");
  receivedSubjects.set(id, subject);

  if (seen.has(id)) {
    duplicates.set(id, (duplicates.get(id) ?? 0) + 1);
    // Exercise the persistence-level uniqueness guard as well as consumer-level event-id dedupe.
    await processor.process(event);
    return;
  }

  const attempt = (attempts.get(id) ?? 0) + 1;
  attempts.set(id, attempt);
  if (attempt === 1) throw new Error(`forced transient retry for ${id}`);
  await processor.process(event);
  seen.add(id);
};

async function proveEvent(input: {
  durable: string;
  subject: string;
  event: Record<string, unknown>;
}) {
  const firstDelivery = subscriber.consume(input.durable, input.subject, handle, {
    maxMessages: 1,
    expiresMs: 5_000,
    deliverPolicy: DeliverPolicy.New,
  });
  // The durable must exist before publication so DeliverPolicy.New cannot miss the test message.
  await Bun.sleep(500);
  await publisher.publish(input.subject, input.event);
  assert.equal(await firstDelivery, 0, "the forced first attempt must be negatively acknowledged");

  const retryCount = await subscriber.consume(input.durable, input.subject, handle, {
    maxMessages: 1,
    expiresMs: 5_000,
  });
  assert.equal(retryCount, 1, "the negatively acknowledged event must succeed on retry");

  await publisher.publish(input.subject, input.event);
  const duplicateCount = await subscriber.consume(input.durable, input.subject, handle, {
    maxMessages: 1,
    expiresMs: 5_000,
  });
  assert.equal(duplicateCount, 1, "the duplicate publication must be consumed and acknowledged");
}

try {
  await correlation.link(checkoutRef, { ownerUserId: ownerId });
  await publisher.connect();
  await subscriber.connect();

  await proveEvent({
    durable: inspectionDurable,
    subject: inspectionSubject,
    event: inspectionEvent,
  });
  await proveEvent({
    durable: refundDurable,
    subject: refundSubject,
    event: refundEvent,
  });

  assert.equal(attempts.get(inspectionId), 2);
  assert.equal(attempts.get(refundId), 2);
  assert.equal(duplicates.get(inspectionId), 1);
  assert.equal(duplicates.get(refundId), 1);
  assert.equal(receivedSubjects.get(inspectionId), inspectionSubject);
  assert.equal(receivedSubjects.get(refundId), refundSubject);

  const ownerInbox = await notifications.listForUser(ownerId, 20);
  const otherInbox = await notifications.listForUser(otherId, 20);
  const inspectionNotifications = ownerInbox.filter(
    (item) => item.source_event_id === inspectionId,
  );
  const refundNotifications = ownerInbox.filter((item) => item.source_event_id === refundId);
  assert.equal(inspectionNotifications.length, 1);
  assert.equal(refundNotifications.length, 1);
  assert.equal(inspectionNotifications[0].template_key, "return_inspection_v1");
  assert.equal(refundNotifications[0].template_key, "return_refund_simulation_v1");
  assert.match(inspectionNotifications[0].body, /no stock moved/i);
  assert.match(refundNotifications[0].body, /no real money or stock moved/i);
  assert.equal(
    otherInbox.filter((item) => sourceEventIds.has(item.source_event_id ?? "")).length,
    0,
  );

  console.log(
    "return-closure-events-test: pass (2 subjects, 2 retries, 2 duplicates, 2 owner notifications)",
  );
} finally {
  await pool.query(
    `DELETE FROM pilot_notification WHERE source_event_id = ANY($1::text[])`,
    [[inspectionId, refundId]],
  ).catch(() => undefined);
  await pool.query("DELETE FROM correlation WHERE checkout_ref = $1", [checkoutRef])
    .catch(() => undefined);

  // Consumers are test-owned. Stream messages disappear with the required disposable NATS container.
  const cleanupConnection = await connect({
    servers: config.natsUrl,
    ...(config.natsUser ? { user: config.natsUser, pass: config.natsPassword } : {}),
  }).catch(() => null);
  if (cleanupConnection) {
    const manager = await cleanupConnection.jetstreamManager();
    await manager.consumers.delete("BUILDKART_EVENTS", inspectionDurable).catch(() => false);
    await manager.consumers.delete("BUILDKART_EVENTS", refundDurable).catch(() => false);
    await cleanupConnection.drain();
  }

  await Promise.allSettled([
    subscriber.close(),
    publisher.close(),
    notifications.close(),
    correlation.close(),
    pool.end(),
  ]);
}
