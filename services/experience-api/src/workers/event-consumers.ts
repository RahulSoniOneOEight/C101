import { createServer, type Server } from "node:http";
import { loadConfig } from "../config.js";
import { EventWorkers, type WorkerDefinition } from "../events/event-workers.js";
import { loadPilotUsers } from "../auth/pilot-users.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { NotificationStore } from "../store/notification-store.js";
import { FcmGateway } from "../notifications/fcm-gateway.js";
import { NotificationProcessor } from "../notifications/processor.js";
import { ShipmentStore } from "../logistics/shipment-store.js";
import { SimulatedLogisticsProvider } from "../logistics/provider.js";

/**
 * Continuously deployed cross-system event workers (bounded staging pilot).
 *
 * One durable JetStream consumer per owning service. Handlers here record the reaction the owner
 * would perform; they are deliberately side-effect-free and idempotent for the pilot and must be
 * replaced by the owning service's real reaction before production. Deploy as its own process:
 *
 *   bun run start:workers        # :9030 /metrics, /health
 *
 * Scope: this is the operational-consumer increment that replaces the bounded batch harness. It is
 * not a production deployment and does not authorize production effects.
 */

const config = loadConfig(process.env);
const metricsPort = Number.parseInt(process.env.WORKERS_METRICS_PORT ?? "9030", 10);
const maxDeliver = Number.parseInt(process.env.WORKER_MAX_DELIVER ?? "5", 10);
const pilotUsers = loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount);
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const shipments = new SimulatedLogisticsProvider(
  new ShipmentStore(config.experienceDatabaseUrl),
);
const notifications = new NotificationStore(config.experienceDatabaseUrl);
const fcm = config.fcmDeliveryEnabled ? new FcmGateway(config.firebaseProjectId) : null;
const notificationProcessor = new NotificationProcessor(
  notifications,
  correlation,
  pilotUsers.map((user) => user.id),
  fcm,
);

const definitions: WorkerDefinition[] = [
  {
    name: "pilot-notification-dispatch",
    subject: ">",
    handle: async (event) => notificationProcessor.process(event),
    onDeadLetter: async (event, error) => notificationProcessor.deadLetter(event, error),
  },
  {
    name: "marketplace-allocation-shipment-booking",
    // Allocation subjects are not yet normalized by the upstream publisher; filter by event type
    // inside the handler and ignore unrelated trailing events.
    subject: ">",
    handle: async (event, subject) => {
      const eventType = String(event.event_type ?? event.type ?? "");
      if (!/marketplace.*allocation.*created|allocation\.created/i.test(eventType)) return;
      const payload = event.payload && typeof event.payload === "object"
        ? event.payload as Record<string, unknown>
        : event;
      const allocationId = String(
        payload.allocation_id ?? payload.allocationId ?? event.aggregate_id ?? "",
      );
      const orderGroupId = String(
        payload.order_group_id ??
          payload.orderGroupId ??
          (payload.order_group as Record<string, unknown> | undefined)?.id ??
          "",
      );
      const sellerId = String(payload.seller_id ?? payload.sellerId ?? "");
      if (!allocationId || !orderGroupId || !sellerId) {
        console.warn(`[shipment-booking] ${subject} missing allocation/order/seller keys`);
        return;
      }
      const ref = await correlation.getByOrderGroup(orderGroupId);
      const payloadLines = Array.isArray(payload.lines)
        ? payload.lines as Array<Record<string, unknown>>
        : [];
      const correlationLines = Array.isArray(ref?.medusa_order_group?.lines)
        ? ref!.medusa_order_group!.lines as Array<Record<string, unknown>>
        : [];
      const sourceLines = payloadLines.length ? payloadLines : correlationLines;
      const sellerLines = sourceLines.filter((line) => {
        const lineSeller = line.seller_id ? String(line.seller_id) : "";
        return !lineSeller || lineSeller === sellerId;
      });
      const lines = sellerLines.map((line) => ({
        lineKey: String(line.line_key ?? line.id ?? line.variant_id ?? ""),
        sku: String(line.sku ?? line.variant_id ?? line.line_key ?? ""),
        orderedQty: Number(line.quantity ?? line.ordered_qty ?? 1),
      })).filter((line) => line.lineKey && line.orderedQty > 0);
      if (lines.length === 0) {
        console.warn(`[shipment-booking] ${allocationId} has no line evidence; shipment not booked`);
        return;
      }
      const destinationPostcode =
        typeof ref?.medusa_order_group?.destination_postcode === "string"
          ? ref.medusa_order_group.destination_postcode
          : null;
      const result = await shipments.book({
        orderGroupId,
        allocationId,
        sellerId,
        lines,
        destinationPostcode,
      });
      console.log(
        `[shipment-booking] ${subject} ${result.created ? "booked" : "already-booked"} ${result.shipment.id}`,
      );
    },
  },
  {
    name: "order-confirmed-staging-shipment-fallback",
    // Staging fallback only. Mercur currently does not publish marketplace-allocation.created into
    // NATS, so order.confirmed carries seller-enriched line snapshots and books one shipment per
    // seller. The allocation consumer remains primary and dedupes by order group/seller.
    subject: "commerce.>",
    handle: async (event, subject) => {
      if (String(event.event_type ?? "") !== "order.confirmed") return;
      const payload = event.payload && typeof event.payload === "object"
        ? event.payload as Record<string, unknown>
        : {};
      const orderGroupId = String(
        (payload.order_group as Record<string, unknown> | undefined)?.id ??
          payload.order_group_id ??
          "",
      );
      const lines = Array.isArray(payload.lines)
        ? payload.lines as Array<Record<string, unknown>>
        : [];
      if (!orderGroupId || lines.length === 0) return;
      const bySeller = new Map<string, Array<Record<string, unknown>>>();
      for (const line of lines) {
        const sellerId = line.seller_id ? String(line.seller_id) : "";
        if (!sellerId) continue;
        const bucket = bySeller.get(sellerId) ?? [];
        bucket.push(line);
        bySeller.set(sellerId, bucket);
      }
      if (bySeller.size === 0) {
        console.warn(
          `[shipment-fallback] ${subject} order ${orderGroupId} has no seller-enriched lines`,
        );
        return;
      }
      for (const [sellerId, sellerLines] of bySeller) {
        const shipmentLines = sellerLines.map((line) => ({
          lineKey: String(line.line_key ?? line.id ?? ""),
          sku: String(line.sku ?? line.variant_id ?? line.line_key ?? ""),
          orderedQty: Number(line.quantity ?? line.ordered_qty ?? 1),
        })).filter((line) => line.lineKey && line.orderedQty > 0);
        if (shipmentLines.length === 0) continue;
        const result = await shipments.book({
          orderGroupId,
          allocationId: `order-confirmed:${orderGroupId}:${sellerId}`,
          sellerId,
          lines: shipmentLines,
        });
        console.log(
          `[shipment-fallback] ${orderGroupId}/${sellerId} ${result.created ? "booked" : "already-booked"} ${result.shipment.id}`,
        );
      }
    },
  },
  {
    name: "tryton-reservation",
    subject: "inventory.>",
    handle: async (event, subject) => {
      console.log(
        `[tryton-reservation] ${subject} ${event.event_type ?? "?"} -> reconcile stock movement`,
      );
    },
  },
  {
    name: "reconciliation-tracker",
    subject: "logistics.>",
    handle: async (event, subject) => {
      console.log(
        `[reconciliation-tracker] ${subject} ${event.event_type ?? "?"} -> update correlation ledger`,
      );
    },
  },
];

const workers = new EventWorkers(config.natsUrl, undefined, undefined, {
  user: config.natsUser,
  password: config.natsPassword,
});
await workers.connect();
await workers.start(definitions, { maxDeliver });

const server: Server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        environment: config.environment,
        payment_mode: config.paymentAdapterMode,
        fcm_delivery: config.fcmDeliveryEnabled ? "enabled" : "disabled",
        consumers: workers.stats(),
      }),
    );
    return;
  }
  if (req.url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    res.end(workers.metrics());
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not-found" }));
});
server.listen(metricsPort, () => {
  console.log(
    `[event-workers] ready on :${metricsPort} (nats=${config.natsUrl}, maxDeliver=${maxDeliver})`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[event-workers] ${signal} received, draining...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await workers.stop();
  await Promise.all([notifications.close(), correlation.close()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
