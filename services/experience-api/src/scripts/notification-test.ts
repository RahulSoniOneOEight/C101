import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NotificationProcessor } from "../notifications/processor.js";
import { renderPilotNotification } from "../notifications/templates.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { NotificationStore } from "../store/notification-store.js";

const databaseUrl = process.env.EXPERIENCE_DATABASE_URL ??
  "postgres://buildkart:buildkart@localhost:5433/buildkart_experience";
const suffix = randomUUID().slice(0, 8);
const ownerId = `notification_owner_${suffix}`;
const otherId = `notification_other_${suffix}`;
const checkoutRef = `notification_checkout_${suffix}`;
const sourceEventId = randomUUID();
const notifications = new NotificationStore(databaseUrl);
const correlation = new CorrelationStore(databaseUrl);

try {
  await correlation.link(checkoutRef, { ownerUserId: ownerId });
  const processor = new NotificationProcessor(notifications, correlation, [ownerId, otherId], null);
  const orderEvent = {
    id: sourceEventId,
    event_type: "order.confirmed",
    aggregate_type: "order_group",
    aggregate_id: `order_${suffix}`,
    payload: { cart_id: checkoutRef, test_data: true },
  };

  await processor.process(orderEvent);
  await processor.process(orderEvent);
  const ownerInbox = await notifications.listForUser(ownerId);
  const otherInbox = await notifications.listForUser(otherId);
  assert.equal(ownerInbox.filter((item) => item.source_event_id === sourceEventId).length, 1, "event dedupe failed");
  assert.equal(otherInbox.filter((item) => item.source_event_id === sourceEventId).length, 0, "owner isolation failed");

  const notification = ownerInbox.find((item) => item.source_event_id === sourceEventId)!;
  assert.equal(await notifications.markRead(otherId, notification.id), false, "cross-user read update succeeded");
  assert.equal(await notifications.markRead(ownerId, notification.id), true);

  const token = `test-fcm-token-${randomUUID()}-${randomUUID()}`;
  const device = await notifications.registerDevice(ownerId, token);
  assert.equal(await notifications.removeDevice(otherId, device.id), false, "cross-user device removal succeeded");
  assert.equal(await notifications.removeDevice(ownerId, device.id), true);

  const broadcast = renderPilotNotification({
    event_type: "catalog.product_launched",
    aggregate_id: `product_${suffix}`,
    payload: { product_title: "Test product", product_id: `product_${suffix}` },
  });
  assert.equal(broadcast?.audience, "all-pilot-users");
  assert.equal(broadcast?.templateKey, "product_launch_v1");
  console.log("PASS: notification persistence, dedupe, ownership and device isolation.");
} finally {
  await Promise.all([notifications.close(), correlation.close()]);
}
