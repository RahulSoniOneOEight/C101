import { createServer, type Server } from "node:http";
import { loadConfig } from "../config.js";
import { EventWorkers, type WorkerDefinition } from "../events/event-workers.js";
import { loadPilotUsers } from "../auth/pilot-users.js";
import { CorrelationStore } from "../store/correlation-store.js";
import { NotificationStore } from "../store/notification-store.js";
import { FcmGateway } from "../notifications/fcm-gateway.js";
import { NotificationProcessor } from "../notifications/processor.js";

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
    name: "mercur-allocation",
    subject: "commerce.>",
    handle: async (event, subject) => {
      console.log(
        `[mercur-allocation] ${subject} order=${event.aggregate_id ?? "?"} -> allocate selected seller`,
      );
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

const workers = new EventWorkers(config.natsUrl);
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
