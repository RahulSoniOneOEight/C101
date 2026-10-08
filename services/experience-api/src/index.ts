import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import {
  MedusaStoreClient,
  SIMULATED_PAYMENT_PROVIDER_ID,
  type StoreOffer,
  type StoreAddress,
  type StorePaymentCollection,
  type StorePaymentSession,
} from "./medusa/store-client.js";
import { SimulatedPaymentAdapter } from "./payment/simulated-adapter.js";
import type { Money, SimulatorOutcome } from "./payment/types.js";
import { TrytonClient } from "./tryton/client.js";
import { TrytonErp } from "./tryton/erp.js";
import { CorrelationStore } from "./store/correlation-store.js";
import { EventStore } from "./store/event-store.js";
import { ReservationStore } from "./store/reservation-store.js";
import { NotificationStore } from "./store/notification-store.js";
import { PrivilegedAuditStore } from "./store/privileged-audit-store.js";
import { NatsPublisher, eventSubject } from "./events/nats-publisher.js";
import { appContent, resolveContent, type AppLocale } from "./content/app-content.js";
import { CollectionResolver } from "./collections/resolver.js";
import { collections as collectionRegistry } from "./collections/registry.js";
import {
  loadPilotUsers,
  PilotUserDirectory,
  type PilotUser,
} from "./auth/pilot-users.js";
import { PilotAuthStore } from "./auth/dummy-otp.js";
import {
  hasAnyRole,
  loadPilotAuthorizations,
  type PilotAuthorization,
  type PilotRole,
} from "./auth/pilot-authorization.js";
import { checkServiceability, bookShipment, getShipment, advanceShipment } from "./logistics/simulated-logistics.js";

const config = loadConfig(process.env);
const payment = new SimulatedPaymentAdapter();
const medusa = new MedusaStoreClient(config);
const tryton = new TrytonClient(config);
const erp = new TrytonErp(tryton, config.trytonUsername);
// Pre-resolve Tryton company/UoM/locations so concurrent reserves don't race setup.
erp.warmup().catch((e) => console.warn("[experience-api] Tryton warmup skipped:", (e as Error).message));
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const events = new EventStore(config.experienceDatabaseUrl);
const reservations = new ReservationStore(config.experienceDatabaseUrl);
const notifications = new NotificationStore(config.experienceDatabaseUrl);
const privilegedAudit = new PrivilegedAuditStore(config.experienceDatabaseUrl);
const nats = new NatsPublisher(config.natsUrl, {
  user: config.natsUser,
  password: config.natsPassword,
});
const pilotDirectory = new PilotUserDirectory(
  loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount),
);
const pilotAuthorizations = loadPilotAuthorizations(
  config.pilotRoleAssignmentsJson,
  pilotDirectory.users,
  config.pilotExpectedUserCount !== undefined,
);
const pilotAuth = new PilotAuthStore(
  config.redisUrl,
  config.pilotOtpCode,
  config.pilotChallengeTtlSeconds,
  config.pilotSessionTtlSeconds,
);

// Outbox → NATS drain: publish unpublished cross-system domain events, then mark them published.
async function drainOutbox(): Promise<void> {
  if (!nats.connected) return;
  const unpublished = await events.listUnpublished(100);
  for (const e of unpublished) {
    try {
      await nats.publish(eventSubject(e.event_type), {
        id: e.id,
        event_type: e.event_type,
        aggregate_type: e.aggregate_type,
        aggregate_id: e.aggregate_id,
        correlation_id: e.correlation_id,
        payload: e.payload,
        occurred_at: e.occurred_at,
      });
      await events.markPublished(e.id);
    } catch (err) {
      console.warn("[experience-api] NATS publish failed:", (err as Error).message);
    }
  }
}

// Reservation TTL (CHG-017 `reservation_ttl_minutes_proposed: 15`; overridable for tests).
const RESERVATION_TTL_MS = Number(process.env.RESERVATION_TTL_MS ?? 15 * 60 * 1000);

// Read-model offer cache (browse only). Never caches cart/order/reservation decisions.
const OFFER_CACHE_TTL_MS = Number(process.env.OFFER_CACHE_TTL_MS ?? 30000);
const offerCache = new Map<string, { offers: StoreOffer[]; expiresAt: number }>();
const offerCacheKey = (productIds: string[], context: string) =>
  `${[...productIds].sort().join("|")}|${context}`;

// Operational counters (exposed on /metrics). Browse cache only; never transactional.
let offerCacheHits = 0;
let offerCacheMisses = 0;

// Process CPU sampling for the operational metrics endpoint.
let lastCpuUsage = process.cpuUsage();
let lastCpuAt = Date.now();
function processSnapshot(): { cpu_percent: number; rss_mb: number; heap_used_mb: number } {
  const now = Date.now();
  const usage = process.cpuUsage();
  const elapsedUs = Math.max(1, (now - lastCpuAt) * 1000);
  const cpuUs = usage.user - lastCpuUsage.user + (usage.system - lastCpuUsage.system);
  lastCpuUsage = usage;
  lastCpuAt = now;
  const mem = process.memoryUsage();
  return {
    cpu_percent: Number(((cpuUs / elapsedUs) * 100).toFixed(2)),
    rss_mb: Number((mem.rss / 1048576).toFixed(1)),
    heap_used_mb: Number((mem.heapUsed / 1048576).toFixed(1)),
  };
}

/** Read-model offer fetch with a short TTL cache. Never used for cart/order/reservation decisions. */
async function getOffersCached(
  productIds: string[],
  context: string,
  regionId: string = config.medusaRegionId,
): Promise<{ offers: StoreOffer[]; cacheHit: boolean }> {
  const key = `${offerCacheKey(productIds, context)}|${regionId}`;
  const cached = offerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    offerCacheHits++;
    return { offers: cached.offers, cacheHit: true };
  }
  const offers = await medusa.listOffersByProducts(productIds, regionId);
  offerCache.set(key, { offers, expiresAt: Date.now() + OFFER_CACHE_TTL_MS });
  offerCacheMisses++;
  return { offers, cacheHit: false };
}
const collections = new CollectionResolver(medusa);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, idempotency-key, x-correlation-id",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });

const problem = (status: number, title: string, detail?: string) =>
  json({ type: "about:blank", title, status, detail }, status);

function correlationId(req: Request): string {
  return req.headers.get("x-correlation-id") ?? randomUUID();
}

function bearerToken(req: Request): string | null {
  const value = req.headers.get("authorization")?.trim();
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

type AuthenticationResult = {
  user: PilotUser;
  token: string;
  authorization: PilotAuthorization;
} | { response: Response };

async function authenticate(req: Request): Promise<AuthenticationResult> {
  const token = bearerToken(req);
  if (!token) {
    return { response: problem(401, "authentication-required", "A pilot bearer session is required.") };
  }
  try {
    const userId = await pilotAuth.resolveSession(token);
    const user = userId ? pilotDirectory.get(userId) : undefined;
    const authorization = userId ? pilotAuthorizations.get(userId) : undefined;
    if (!user || !authorization) {
      return { response: problem(401, "invalid-session", "The pilot session is invalid or expired.") };
    }
    return { user, token, authorization };
  } catch (error) {
    console.warn("[experience-api] pilot session lookup failed:", (error as Error).message);
    return { response: problem(503, "identity-store-unavailable", "Pilot sessions are temporarily unavailable.") };
  }
}

async function requireAnyRole(req: Request, roles: readonly PilotRole[]): Promise<AuthenticationResult> {
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  if (!hasAnyRole(authenticated.authorization, roles)) {
    return { response: problem(404, "not-found") };
  }
  return authenticated;
}

/**
 * Resolve an optional session without failing the request. Used by read endpoints so a B2B caller
 * can be priced against the B2B region while anonymous/B2C callers get the default region.
 */
async function optionalAuthorization(req: Request): Promise<PilotAuthorization | undefined> {
  const token = bearerToken(req);
  if (!token) return undefined;
  try {
    const userId = await pilotAuth.resolveSession(token);
    return userId ? pilotAuthorizations.get(userId) : undefined;
  } catch {
    return undefined;
  }
}

function isBusinessBuyer(authorization?: PilotAuthorization): boolean {
  return Boolean(
    authorization?.roles.some((role) =>
      role === "b2b_buyer" || role === "b2b_account_admin" || role === "b2b_approver",
    ),
  );
}

/**
 * B2B callers are priced against the B2B region, which carries the trade price list. The region is
 * part of the pricing context, so the trade price is resolved canonically by Medusa — the same value
 * is used for product reads, cart lines and orders.
 */
function regionFor(authorization?: PilotAuthorization): string {
  return isBusinessBuyer(authorization) && config.medusaB2bRegionId
    ? config.medusaB2bRegionId
    : config.medusaRegionId;
}

function privilegedRoles(pathname: string): readonly PilotRole[] | null {
  if (/^\/v1\/admin\/(tryton|inventory)(?:\/|$)/.test(pathname)) {
    return ["erp_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/collections(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/notifications(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/(events|orders)(?:\/|$)/.test(pathname)) {
    return ["support_operator", "marketplace_operator", "erp_operator", "finance_operator", "super_admin"];
  }
  if (/^\/v1\/ops(?:\/|$)/.test(pathname) || pathname === "/ops" || pathname === "/ops/") {
    return ["support_operator", "marketplace_operator", "erp_operator", "finance_operator", "super_admin"];
  }
  if (pathname === "/metrics") {
    return ["marketplace_operator", "erp_operator", "finance_operator", "super_admin"];
  }
  if (/^\/v1\/shipments\/[^/]+\/advance$/.test(pathname)) {
    return ["marketplace_operator", "erp_operator", "super_admin"];
  }
  if (/^\/v1\/payments\/[^/]+\/simulate$/.test(pathname)) {
    return ["finance_operator", "super_admin"];
  }
  if (/^\/v1\/admin(?:\/|$)/.test(pathname)) {
    return ["super_admin"];
  }
  return null;
}

async function authorizeCheckoutOwner(req: Request, checkoutRef: string): Promise<AuthenticationResult> {
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  if (!hasAnyRole(authenticated.authorization, ["customer", "b2b_buyer", "b2b_account_admin", "b2b_approver"])) {
    return { response: problem(404, "checkout-not-found", "No checkout was found for this user.") };
  }
  const record = await correlation.get(checkoutRef);
  if (!record || record.owner_user_id !== authenticated.user.id) {
    // Use 404 so one pilot user cannot use this endpoint to enumerate another user's references.
    return { response: problem(404, "checkout-not-found", "No checkout was found for this user.") };
  }
  return authenticated;
}

function findValidSimulatedSession(
  paymentCollection: StorePaymentCollection,
): StorePaymentSession | undefined {
  return paymentCollection.payment_sessions?.find((session) =>
    session.provider_id === SIMULATED_PAYMENT_PROVIDER_ID &&
    session.data?.payment_mode === "simulated" &&
    session.data?.test_data === true &&
    session.amount === paymentCollection.amount,
  );
}

/** Minimal read-only operator console (staging) served as a static HTML page. */
function opsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BuildKart Ops — Staging</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.25rem; }
  .badge { font-size: .75rem; background: #fde68a; color: #713f12; padding: .15rem .5rem; border-radius: 999px; vertical-align: middle; }
  h2 { font-size: 1rem; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .25rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #e5e7eb; }
  th { color: #6b7280; font-weight: 600; }
  .ok { color: #15803d; } .warn { color: #b45309; } .empty { color: #6b7280; }
  code { background: #f3f4f6; padding: .1rem .3rem; border-radius: .25rem; font-size: .8rem; }
</style>
</head>
<body>
<h1>BuildKart Ops Console <span class="badge">staging · simulated payment</span></h1>
<section>
  <h2>Correlated orders</h2>
  <div id="orders">Loading…</div>
</section>
<section>
  <h2>Integration exceptions</h2>
  <div id="exceptions">Loading…</div>
</section>
<script>
async function load() {
  try {
    const [orders, exceptions] = await Promise.all([
      fetch('/v1/admin/orders').then(r => r.json()),
      fetch('/v1/ops/integration-exceptions').then(r => r.json()),
    ]);
    renderOrders(orders.items || []);
    renderExceptions(exceptions.items || []);
  } catch (e) {
    document.getElementById('orders').textContent = 'Failed to load: ' + e;
  }
}
function renderOrders(items) {
  const el = document.getElementById('orders');
  if (!items.length) { el.innerHTML = '<p class="empty">No orders yet — complete a checkout to see a correlated order.</p>'; return; }
  el.innerHTML = '<table><thead><tr><th>Order ref</th><th>Order group</th><th>Reservation</th><th>Reconciled</th></tr></thead><tbody>' +
    items.map(o => {
      const ok = o.reconciled ? '<span class="ok">yes</span>' : '<span class="warn">no</span>';
      return '<tr><td><code>' + esc(o.order_id) + '</code></td><td><code>' + esc(o.medusa_order_group_id || '—') + '</code></td><td><code>' + esc(o.reservation_id || '—') + '</code></td><td>' + ok + '</td></tr>';
    }).join('') + '</tbody></table>';
}
function renderExceptions(items) {
  const el = document.getElementById('exceptions');
  if (!items.length) { el.innerHTML = '<p class="empty">No integration exceptions recorded.</p>'; return; }
  el.innerHTML = '<table><thead><tr><th>Type</th><th>Aggregate</th><th>Occurred</th></tr></thead><tbody>' +
    items.map(e => '<tr><td><code>' + esc(e.event_type) + '</code></td><td><code>' + esc(e.aggregate_id) + '</code></td><td>' + esc(e.occurred_at) + '</td></tr>').join('') + '</tbody></table>';
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
load();
setInterval(load, 5000);
</script>
</body>
</html>`;
}

/** Maps Mercur offers to composed offer views and picks the lowest eligible in-stock offer. */
function composeOffers(offers: StoreOffer[]) {
  const offerViews = offers.map((o) => {
    const qty = o.inventory_quantity ?? null;
    const stockBadge = !o.in_stock
      ? "out_of_stock"
      : qty !== null && qty <= 5
        ? "low_stock"
        : "in_stock";
    const selling = o.calculated_price?.calculated_amount ?? null;
    const list = o.calculated_price?.original_amount ?? selling;
    const discountMinor =
      list !== null && selling !== null && list > selling ? list - selling : 0;
    return {
      id: o.id,
      seller_id: o.seller_id,
      seller_name: o.seller?.name ?? null,
      variant_id: o.variant_id,
      sku: o.sku,
      currency_code: o.calculated_price?.currency_code ?? "INR",
      unit_amount_minor: selling,
      list_amount_minor: list,
      selling_amount_minor: selling,
      discount_minor: discountMinor,
      discount_percent: discountMinor > 0 && list ? Math.round((discountMinor / list) * 100) : 0,
      price_source: discountMinor > 0 ? "price_list" : "list",
      inventory_quantity: qty,
      in_stock: o.in_stock ?? null,
      stock_badge: stockBadge,
    };
  });
  const eligible = offerViews.filter(
    (o) => o.in_stock !== false && o.unit_amount_minor != null,
  );
  const selected = eligible.length
    ? eligible.reduce((min, o) => (o.unit_amount_minor! < min.unit_amount_minor! ? o : min), eligible[0])
    : null;
  return { offerViews, selected };
}

async function handle(req: Request, url: URL, cid: string): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, idempotency-key, x-correlation-id",
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      },
    });
  }

  // Hosted RBAC is enabled when the governed deployment supplies explicit role assignments.
  // Local legacy integration runs without that configuration retain their existing operator access.
  const requiredRoles = config.pilotRoleAssignmentsJson ? privilegedRoles(url.pathname) : null;
  if (requiredRoles) {
    const privileged = await requireAnyRole(req, requiredRoles);
    if ("response" in privileged) return privileged.response;
  }

  if (url.pathname === "/ops" || url.pathname === "/ops/") {
    return new Response(opsPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/health") {
    const identityStore = await pilotAuth.ping().then(() => "connected" as const).catch(() => "unavailable" as const);
    return json({
      status: identityStore === "connected" ? "ok" : "degraded",
      environment: config.environment,
      payment_mode: config.paymentAdapterMode,
      nats: nats.connected ? "connected" : "disconnected",
      identity_store: identityStore,
      pilot_user_count: pilotDirectory.users.length,
      test_data: config.environment !== "production",
      correlation_id: cid,
    }, identityStore === "connected" ? 200 : 503);
  }

  // GET /metrics — Prometheus-style resource + operational telemetry (process, pg pools,
  // offer cache, NATS consumer lag). Read-only; no transactional state.
  if (url.pathname === "/metrics") {
    const proc = processSnapshot();
    const lag = await nats.consumerLag([
      "mercur-allocation",
      "tryton-reservation",
      "reconciliation-tracker",
    ]);
    const pools: Array<[string, { total: number; idle: number; waiting: number }]> = [
      ["reservation", reservations.poolStats()],
      ["event", events.poolStats()],
      ["correlation", correlation.poolStats()],
      ["notification", notifications.poolStats()],
      ["privileged_audit", privilegedAudit.poolStats()],
    ];
    const lines: string[] = [
      `buildkart_process_cpu_percent ${proc.cpu_percent}`,
      `buildkart_process_rss_mb ${proc.rss_mb}`,
      `buildkart_process_heap_used_mb ${proc.heap_used_mb}`,
      `buildkart_offer_cache_entries ${offerCache.size}`,
      `buildkart_offer_cache_hits_total ${offerCacheHits}`,
      `buildkart_offer_cache_misses_total ${offerCacheMisses}`,
      `buildkart_nats_connected ${nats.connected ? 1 : 0}`,
    ];
    for (const [store, pool] of pools) {
      lines.push(`buildkart_pg_pool_total{store="${store}"} ${pool.total}`);
      lines.push(`buildkart_pg_pool_idle{store="${store}"} ${pool.idle}`);
      lines.push(`buildkart_pg_pool_waiting{store="${store}"} ${pool.waiting}`);
    }
    for (const [name, value] of Object.entries(lag)) {
      lines.push(`buildkart_nats_consumer_lag{consumer="${name}"} ${value}`);
    }
    return new Response(`${lines.join("\n")}\n`, {
      headers: { "content-type": "text/plain; version=0.0.4" },
    });
  }

  // POST /v1/auth/otp/challenges — issue a simulated OTP challenge (allowlisted pilot users only)
  if (url.pathname === "/v1/auth/otp/challenges" && req.method === "POST") {
    let body: { identifier?: string };
    try {
      body = (await req.json()) as { identifier?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.identifier) {
      return problem(400, "missing-identifier", "identifier (email or phone) is required.");
    }
    const user = pilotDirectory.find(body.identifier);
    if (!user) {
      return problem(403, "not-pilot-user", "This identity is not allowlisted for the pilot.");
    }
    try {
      const challenge = await pilotAuth.issueChallenge(user.id);
      return json({
        ...challenge,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      console.warn("[experience-api] pilot challenge persistence failed:", (error as Error).message);
      return problem(503, "identity-store-unavailable", "Pilot authentication is temporarily unavailable.");
    }
  }

  // POST /v1/auth/otp/verify — verify the simulated OTP and return a pilot session
  if (url.pathname === "/v1/auth/otp/verify" && req.method === "POST") {
    let body: { challenge_id?: string; code?: string };
    try {
      body = (await req.json()) as { challenge_id?: string; code?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.challenge_id || !body.code) {
      return problem(400, "missing-fields", "challenge_id and code are required.");
    }
    try {
      const verified = await pilotAuth.verifyChallenge(body.challenge_id, body.code);
      if (!verified) {
        return problem(401, "invalid-otp", "Invalid or expired OTP.");
      }
      const user = pilotDirectory.get(verified.user_id);
      if (!user) {
        await pilotAuth.revokeSession(verified.session_token);
        return problem(401, "invalid-otp", "The pilot identity is no longer allowlisted.");
      }
      return json({
        session_token: verified.session_token,
        expires_in_seconds: verified.expires_in_seconds,
        user,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      console.warn("[experience-api] pilot verification failed:", (error as Error).message);
      return problem(503, "identity-store-unavailable", "Pilot authentication is temporarily unavailable.");
    }
  }

  // POST /v1/auth/logout — revoke the current Redis-backed session.
  if (url.pathname === "/v1/auth/logout" && req.method === "POST") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    let deviceId: string | undefined;
    try {
      const text = await req.text();
      if (text.trim()) {
        const body = JSON.parse(text) as { device_id?: unknown };
        if (typeof body.device_id === "string") deviceId = body.device_id;
      }
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body when one is supplied.");
    }
    if (deviceId) await notifications.removeDevice(authenticated.user.id, deviceId);
    await pilotAuth.revokeSession(authenticated.token);
    return new Response(null, { status: 204 });
  }

  // GET /v1/me/contexts — server-owned role and scope projection.
  if (url.pathname === "/v1/me/contexts" && req.method === "GET") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    return json({
      contexts: [{
        user_id: authenticated.user.id,
        roles: authenticated.authorization.roles,
        business_account_id: authenticated.authorization.businessAccountId ?? null,
        seller_id: authenticated.authorization.sellerId ?? null,
      }],
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // GET /v1/logistics/serviceability?postcode=... — simulated delivery serviceability (Step 3)
  if (url.pathname === "/v1/logistics/serviceability" && req.method === "GET") {
    const postcode = url.searchParams.get("postcode") ?? "";
    const result = checkServiceability(postcode);
    return json({ ...result, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // POST /v1/checkouts/{checkoutId}/shipment — book a simulated shipment (Step 3)
  const bookShipmentMatch = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/shipment$/);
  if (bookShipmentMatch && req.method === "POST") {
    const checkoutId = bookShipmentMatch[1];
    const authenticated = await authorizeCheckoutOwner(req, checkoutId);
    if ("response" in authenticated) return authenticated.response;
    const shipment = bookShipment(checkoutId);
    await events.append({
      event_type: "shipment.status_changed",
      aggregate_type: "order_group",
      aggregate_id: checkoutId,
      correlation_id: cid,
      payload: { shipment_id: shipment.id, status: shipment.status, tracking_number: shipment.tracking_number },
    });
    return json({ ...shipment, environment: config.environment, test_data: true, correlation_id: cid }, 201);
  }

  // GET /v1/shipments/{shipmentId} — simulated tracking (Step 3)
  const shipmentMatch = url.pathname.match(/^\/v1\/shipments\/([^/]+)$/);
  if (shipmentMatch && req.method === "GET") {
    const shipment = getShipment(shipmentMatch[1]);
    if (!shipment) return problem(404, "unknown-shipment");
    const authenticated = await authorizeCheckoutOwner(req, shipment.order_group_id);
    if ("response" in authenticated) return authenticated.response;
    return json({ ...shipment, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // POST /v1/shipments/{shipmentId}/advance — demo-only status progression (Step 3)
  const advanceMatch = url.pathname.match(/^\/v1\/shipments\/([^/]+)\/advance$/);
  if (advanceMatch && req.method === "POST") {
    const shipment = advanceShipment(advanceMatch[1]);
    if (!shipment) return problem(404, "unknown-shipment");
    await events.append({
      event_type: "shipment.status_changed",
      aggregate_type: "order_group",
      aggregate_id: shipment.order_group_id,
      correlation_id: cid,
      payload: {
        shipment_id: shipment.id,
        status: shipment.status,
        tracking_number: shipment.tracking_number,
        cart_id: shipment.order_group_id,
      },
    });
    return json({ ...shipment, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // GET /v1/me/notifications — durable per-user inbox. Legacy path remains a bounded alias.
  if ((url.pathname === "/v1/me/notifications" || url.pathname === "/v1/notifications") && req.method === "GET") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const items = await notifications.listForUser(authenticated.user.id, limit);
    const audience = authenticated.authorization.roles.some((role) => role.startsWith("b2b_")) ? "b2b" : "b2c";
    return json({
      notifications: items.map((item) => ({ ...item, audience })),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const markNotificationRead = url.pathname.match(/^\/v1\/me\/notifications\/([^/]+)\/read$/);
  if (markNotificationRead && req.method === "POST") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const updated = await notifications.markRead(authenticated.user.id, markNotificationRead[1]);
    if (!updated) return problem(404, "notification-not-found");
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/v1/me/notifications/read-all" && req.method === "POST") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const updated = await notifications.markAllRead(authenticated.user.id);
    return json({ updated, test_data: true, correlation_id: cid });
  }

  if (url.pathname === "/v1/me/devices" && req.method === "POST") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    let body: { token?: unknown; platform?: unknown; firebase_project_id?: unknown };
    try {
      body = await req.json() as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 20 || token.length > 4096) return problem(400, "invalid-device-token");
    if (body.platform !== "android") return problem(400, "invalid-platform", "Only Android pilot devices are supported.");
    if (body.firebase_project_id !== "buildkart-staging") {
      return problem(400, "invalid-firebase-project", "Only the staging Firebase project is accepted.");
    }
    const device = await notifications.registerDevice(authenticated.user.id, token);
    return json({ ...device, platform: "android", firebase_project_id: "buildkart-staging", test_data: true }, 201);
  }

  const removeDevice = url.pathname.match(/^\/v1\/me\/devices\/([^/]+)$/);
  if (removeDevice && req.method === "DELETE") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const removed = await notifications.removeDevice(authenticated.user.id, removeDevice[1]);
    if (!removed) return problem(404, "device-not-found");
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/v1/content/app-shell" && req.method === "GET") {
    const locale = (url.searchParams.get("locale") ?? "en-IN") as AppLocale;
    const placement = url.searchParams.get("placement");
    const items = placement ? resolveContent(placement, locale) : appContent.filter((c) => c.locale === locale);
    return json({
      locale,
      placement: placement ?? null,
      items,
      generated_at: new Date().toISOString(),
      source: "governed-editorial-seed",
      freshness: {
        source: "governed-editorial-seed",
        observed_at: new Date().toISOString(),
        stale: false,
      },
    });
  }

  // GET /v1/collections/{key} — resolve a dynamic collection
  const collectionMatch = url.pathname.match(/^\/v1\/collections\/([^/]+)$/);
  if (collectionMatch && req.method === "GET") {
    const key = collectionMatch[1];
    try {
      const result = await collections.resolve(key);
      return json({
        collection_key: result.collection.collection_key,
        source: result.collection.source,
        status: result.collection.status,
        fallback: result.fallback,
        items: result.items,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/checkouts/{checkoutId}/payment-sessions
  const paymentSessions = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/payment-sessions$/);
  if (paymentSessions && req.method === "POST") {
    const checkoutId = paymentSessions[1];
    const authenticated = await authorizeCheckoutOwner(req, checkoutId);
    if ("response" in authenticated) return authenticated.response;
    let body: { amount_minor?: number; currency_code?: string };
    try {
      body = (await req.json()) as { amount_minor?: number; currency_code?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const amount: Money = {
      amount_minor: Number.isInteger(body.amount_minor) ? (body.amount_minor as number) : 0,
      currency_code: body.currency_code ?? "INR",
    };
    const session = await payment.createSession(checkoutId, amount);
    return json(session, 201);
  }

  // POST /v1/payments/{paymentId}/simulate
  const simulate = url.pathname.match(/^\/v1\/payments\/([^/]+)\/simulate$/);
  if (simulate && req.method === "POST") {
    const paymentId = simulate[1];
    let body: { outcome?: string };
    try {
      body = (await req.json()) as { outcome?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const allowed: SimulatorOutcome[] = [
      "success",
      "failure",
      "pending",
      "duplicate",
      "late",
      "refund",
    ];
    if (!body.outcome || !allowed.includes(body.outcome as SimulatorOutcome)) {
      return problem(400, "invalid-outcome", "outcome must be one of " + allowed.join(", "));
    }
    try {
      const state = await payment.recordOutcome(paymentId, body.outcome as SimulatorOutcome);
      return json(state, 200);
    } catch (error) {
      return problem(404, "unknown-payment", (error as Error).message);
    }
  }

  // GET /v1/payments/{paymentId}
  const paymentState = url.pathname.match(/^\/v1\/payments\/([^/]+)$/);
  if (paymentState && req.method === "GET") {
    const state = await payment.getState(paymentState[1]);
    if (!state) {
      return problem(404, "unknown-payment");
    }
    const authenticated = await authorizeCheckoutOwner(req, state.checkout_id);
    if ("response" in authenticated) return authenticated.response;
    return json(state);
  }

  // POST /v1/carts — create a canonical Medusa cart (Commerce)
  if (url.pathname === "/v1/carts" && req.method === "POST") {
    const authenticated = await requireAnyRole(req, ["customer", "b2b_buyer", "b2b_account_admin", "b2b_approver"]);
    if ("response" in authenticated) return authenticated.response;
    let body: { region_id?: string; currency_code?: string; channel?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as { region_id?: string; currency_code?: string; channel?: string };
      }
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    // B2B vs B2C is an explicit sales channel, so canonical orders carry the channel and the
    // marketplace admin can separate them. Defaults to the caller's role when not supplied.
    const isBusinessBuyer = hasAnyRole(authenticated.authorization, [
      "b2b_buyer",
      "b2b_account_admin",
      "b2b_approver",
    ]);
    const wantsB2B = typeof body.channel === "string" && body.channel
      ? body.channel.toLowerCase().startsWith("b2b")
      : isBusinessBuyer;
    const allowedChannels = ["b2c_app", "b2c_web", "b2b_app", "b2b_web"];
    if (typeof body.channel === "string" && body.channel && !allowedChannels.includes(body.channel)) {
      return problem(400, "invalid-channel", `channel must be one of ${allowedChannels.join(", ")}`);
    }
    const channel = wantsB2B ? "b2b" : "b2c";
    try {
      const cart = await medusa.createCart(
        body.region_id ?? regionFor(authenticated.authorization),
        body.currency_code ?? "inr",
      );
      // Medusa's store API allows only a single sales channel per publishable key, so B2B vs B2C is
      // carried as cart metadata. Cart metadata propagates to the canonical order, so the
      // marketplace admin can separate B2B from B2C on real orders.
      const metadata: Record<string, unknown> = { ...(cart.metadata ?? {}), channel };
      if (authenticated.authorization.businessAccountId) {
        metadata.business_account_id = authenticated.authorization.businessAccountId;
      }
      await medusa.updateCartMetadata(cart.id, metadata);
      await correlation.link(cart.id, { ownerUserId: authenticated.user.id });
      return json({
        ...cart,
        metadata,
        channel,
        business_account_id: authenticated.authorization.businessAccountId ?? null,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/carts/{cartId}/customer-details — attach checkout contact and delivery address.
  const cartCustomerDetails = url.pathname.match(/^\/v1\/carts\/([^/]+)\/customer-details$/);
  if (cartCustomerDetails && req.method === "POST") {
    const cartId = cartCustomerDetails[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    let body: { email?: string; shipping_address?: Partial<StoreAddress> };
    try {
      body = (await req.json()) as { email?: string; shipping_address?: Partial<StoreAddress> };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const address = body.shipping_address;
    if (
      !body.email?.trim() ||
      !address?.first_name?.trim() ||
      !address.last_name?.trim() ||
      !address.address_1?.trim() ||
      !address.city?.trim() ||
      !/^\d{6}$/.test(address.postal_code ?? "") ||
      address.country_code?.toUpperCase() !== "IN"
    ) {
      return problem(
        400,
        "invalid-customer-details",
        "email and a complete Indian shipping address with a six-digit postcode are required.",
      );
    }
    if (body.email.trim().toLowerCase() !== authenticated.user.email.toLowerCase()) {
      return problem(403, "identity-mismatch", "Checkout email must match the authenticated pilot user.");
    }
    try {
      const cart = await medusa.updateCartCustomerDetails(cartId, {
        email: body.email.trim(),
        shipping_address: {
          first_name: address.first_name.trim(),
          last_name: address.last_name.trim(),
          address_1: address.address_1.trim(),
          city: address.city.trim(),
          postal_code: address.postal_code!,
          country_code: "in",
        },
      });
      return json({ ...cart, environment: config.environment, test_data: true, correlation_id: cid });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // GET /v1/carts/{cartId}/shipping-options — seller-aware eligible delivery choices.
  const cartShippingOptions = url.pathname.match(/^\/v1\/carts\/([^/]+)\/shipping-options$/);
  if (cartShippingOptions && req.method === "GET") {
    const authenticated = await authorizeCheckoutOwner(req, cartShippingOptions[1]);
    if ("response" in authenticated) return authenticated.response;
    try {
      const options = await medusa.listShippingOptions(cartShippingOptions[1]);
      options.sort((a, b) => a.amount - b.amount || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return json({
        shipping_options: options.map((option) => ({
          ...option,
          currency_code: "INR",
        })),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/carts/{cartId}/shipping-methods — persist the buyer's explicit seller option.
  const cartShippingMethod = url.pathname.match(/^\/v1\/carts\/([^/]+)\/shipping-methods$/);
  if (cartShippingMethod && req.method === "POST") {
    const cartId = cartShippingMethod[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    let body: { option_id?: string };
    try {
      body = (await req.json()) as { option_id?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.option_id) {
      return problem(400, "missing-shipping-option", "option_id is required.");
    }
    try {
      const eligible = await medusa.listShippingOptions(cartId);
      if (!eligible.some((option) => option.id === body.option_id)) {
        return problem(409, "ineligible-shipping-option", "The selected shipping option is not eligible for this cart.");
      }
      const cart = await medusa.addShippingMethod(cartId, body.option_id);
      return json({ ...cart, environment: config.environment, test_data: true, correlation_id: cid });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/carts/{cartId}/lines — add a seller offer (Marketplace) to the cart
  const cartLines = url.pathname.match(/^\/v1\/carts\/([^/]+)\/lines$/);
  if (cartLines && req.method === "POST") {
    const cartId = cartLines[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    let body: { offer_id?: string; quantity?: number };
    try {
      body = (await req.json()) as { offer_id?: string; quantity?: number };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.offer_id || !Number.isInteger(body.quantity) || (body.quantity as number) < 1) {
      return problem(400, "invalid-line", "offer_id and a positive integer quantity are required.");
    }
    try {
      const cart = await medusa.addLineItem(cartId, body.offer_id, body.quantity as number);
      return json({ ...cart, environment: config.environment, test_data: true, correlation_id: cid });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/carts/{cartId}/lines/{lineId} — update line quantity (0 = remove)
  // DELETE /v1/carts/{cartId}/lines/{lineId} — remove a line
  const cartLineItem = url.pathname.match(/^\/v1\/carts\/([^/]+)\/lines\/([^/]+)$/);
  if (cartLineItem && (req.method === "POST" || req.method === "DELETE")) {
    const cartId = cartLineItem[1];
    const lineId = cartLineItem[2];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    try {
      let cart;
      if (req.method === "DELETE") {
        cart = await medusa.removeLineItem(cartId, lineId);
      } else {
        let body: { quantity?: number };
        try {
          body = (await req.json()) as { quantity?: number };
        } catch {
          return problem(400, "invalid-request-body", "Expected a JSON body.");
        }
        if (!Number.isInteger(body.quantity) || (body.quantity as number) < 0) {
          return problem(400, "invalid-line", "quantity must be a non-negative integer.");
        }
        cart = (body.quantity as number) === 0
          ? await medusa.removeLineItem(cartId, lineId)
          : await medusa.updateLineItem(cartId, lineId, body.quantity as number);
      }
      return json({ ...cart, environment: config.environment, test_data: true, correlation_id: cid });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/checkouts/{cartId}/complete — complete the cart into per-seller orders (Commerce + Marketplace)
  const complete = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/complete$/);
  if (complete && req.method === "POST") {
    const cartId = complete[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    try {
      return await correlation.withCheckoutLock(cartId, async () => {
        // Mercur 2.3.4's split workflow can create a second group if invoked again after success.
        // Stop retries here and return the first persisted canonical completion snapshot.
        const existingCompletion = await correlation.get(cartId);
        if (existingCompletion?.medusa_order_group_id) {
          return json({
            type: "order_group",
            order_group: existingCompletion.medusa_order_group ?? {
              id: existingCompletion.medusa_order_group_id,
              cart_id: cartId,
            },
            payment: existingCompletion.payment_evidence,
            environment: config.environment,
            test_data: true,
            payment_mode: config.paymentAdapterMode,
            correlation_id: cid,
            idempotent_replay: true,
          });
        }

        const cart = await medusa.getCart(cartId);
        if (!cart.completed_at) {
          await medusa.updateCartMetadata(cartId, {
            ...(cart.metadata ?? {}),
            payment_mode: "simulated",
            test_data: true,
          });
        }

        // Medusa requires a payment collection and initialized session before completion. Reuse an
        // amount-matched simulated session on retries so an authorization is never replaced.
        let paymentCollection = await medusa.createPaymentCollection(cartId);
        let paymentSession = findValidSimulatedSession(paymentCollection);
        if (!paymentSession) {
          paymentCollection = await medusa.createPaymentSession(
            paymentCollection.id,
            SIMULATED_PAYMENT_PROVIDER_ID,
          );
          paymentSession = findValidSimulatedSession(paymentCollection);
        }
        if (!paymentSession) {
          throw new Error(
            "Simulated payment session was not initialized with required test-only markers.",
          );
        }

        const result = await medusa.completeCart(cartId);
        if (result.type === "order_group") {
          const paymentEvidence = {
            payment_collection_id: paymentCollection.id,
            payment_session_id: paymentSession.id,
            provider_id: paymentSession.provider_id,
            payment_mode: "simulated" as const,
            test_data: true as const,
          };
          await correlation.link(cartId, {
            orderGroup: result.order_group?.id,
            orderGroupPayload: result.order_group,
            paymentEvidence,
          });
          await events.appendOrderConfirmed({
            event_type: "order.confirmed",
            aggregate_type: "order_group",
            aggregate_id: result.order_group?.id ?? cartId,
            correlation_id: cid,
            payload: {
              cart_id: cartId,
              order_group: result.order_group,
              payment: paymentEvidence,
            },
          });
          return json({
            type: "order_group",
            order_group: result.order_group,
            payment: paymentEvidence,
            environment: config.environment,
            test_data: true,
            payment_mode: config.paymentAdapterMode,
            correlation_id: cid,
          });
        }
        return json({
          type: "cart",
          cart: result.cart,
          error: result.error,
          payment: {
            payment_collection_id: paymentCollection.id,
            payment_session_id: paymentSession.id,
            provider_id: paymentSession.provider_id,
            payment_mode: "simulated",
            test_data: true,
          },
          environment: config.environment,
          test_data: true,
          correlation_id: cid,
        });
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // GET /v1/products — composed product list with best-price offer per product
  if (url.pathname === "/v1/products" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const authorization = await optionalAuthorization(req);
    const regionId = regionFor(authorization);
    const channel = isBusinessBuyer(authorization) ? "b2b" : "b2c";
    try {
      const t0 = performance.now();
      const products = await medusa.listProducts(limit, offset);
      const productsMs = performance.now() - t0;

      const productIds = products.map((p) => p.id);
      const t1 = performance.now();
      const { offers: allOffers, cacheHit } = await getOffersCached(
        productIds,
        `${config.medusaCountryCode}:inr`,
        regionId,
      );
      const offersMs = performance.now() - t1;

      const t2 = performance.now();
      const offersByProduct = new Map<string, StoreOffer[]>();
      for (const o of allOffers) {
        const list = offersByProduct.get(o.product_id) ?? [];
        list.push(o);
        offersByProduct.set(o.product_id, list);
      }
      const composed = products.map((p) => {
        const base = {
          id: p.id,
          title: p.title,
          thumbnail: p.thumbnail,
          description: p.description,
          handle: p.handle,
          variants: p.variants,
        };
        const offers = offersByProduct.get(p.id) ?? [];
        const { selected } = composeOffers(offers);
        return { ...base, best_price: selected, offer_count: offers.length };
      });
      const composeMs = performance.now() - t2;

      return json({
        products: composed,
        channel,
        cache_hit: cacheHit,
        timing_ms: {
          products_fetch: Math.round(productsMs * 10) / 10,
          offers: Math.round(offersMs * 10) / 10,
          composition: Math.round(composeMs * 10) / 10,
        },
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // GET /v1/products/{productId} — composed Medusa product + Mercur offers
  const product = url.pathname.match(/^\/v1\/products\/([^/]+)$/);
  if (product && req.method === "GET") {
    const productId = product[1];
    const authorization = await optionalAuthorization(req);
    const regionId = regionFor(authorization);
    const channel = isBusinessBuyer(authorization) ? "b2b" : "b2c";
    try {
      const context = `${config.medusaCountryCode}:inr`;

      const t0 = performance.now();
      const p = await medusa.getProduct(productId);
      const productMs = performance.now() - t0;

      const t1 = performance.now();
      const { offers, cacheHit } = await getOffersCached([productId], context, regionId);
      const offersMs = performance.now() - t1;

      const t2 = performance.now();
      const { offerViews, selected } = composeOffers(offers);
      const composeMs = performance.now() - t2;

      return json({
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        description: p.description,
        variants: p.variants,
        offers: offerViews,
        channel,
        cache_hit: cacheHit,
        timing_ms: {
          product_fetch: Math.round(productMs * 10) / 10,
          offers: Math.round(offersMs * 10) / 10,
          composition: Math.round(composeMs * 10) / 10,
        },
        commercial: {
          selected_seller: selected,
          payment_eligibility: [config.paymentAdapterMode],
          moq: null,
          quantity_tiers: null,
        },
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
        freshness: [
          { source: "medusa", observed_at: new Date().toISOString(), stale: false },
          { source: "mercur", observed_at: new Date().toISOString(), stale: false },
        ],
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/admin/tryton/variants — sync a Medusa variant to a Tryton product
  if (url.pathname === "/v1/admin/tryton/variants" && req.method === "POST") {
    let body: { sku?: string; name?: string; price?: number };
    try {
      body = (await req.json()) as { sku?: string; name?: string; price?: number };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.sku || !body.name) {
      return problem(400, "invalid-variant", "sku and name are required.");
    }
    try {
      const productId = await erp.syncVariant(body.sku, body.name, body.price ?? 0);
      return json({
        sku: body.sku,
        tryton_product_id: productId,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      return problem(502, "tryton-error", (error as Error).message);
    }
  }

  // POST /v1/admin/inventory/available — set available quantity for a SKU (staging/test)
  if (url.pathname === "/v1/admin/inventory/available" && req.method === "POST") {
    let body: { sku?: string; available?: number };
    try {
      body = (await req.json()) as { sku?: string; available?: number };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.sku || !Number.isInteger(body.available) || (body.available as number) < 0) {
      return problem(400, "invalid-inventory", "sku and non-negative integer available are required.");
    }
    await reservations.setAvailable(body.sku, body.available as number);
    return json({
      sku: body.sku,
      available: body.available,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // GET /v1/admin/inventory/{sku} — read the reservation ledger for a SKU
  const inventoryLedger = url.pathname.match(/^\/v1\/admin\/inventory\/([^/]+)$/);
  if (inventoryLedger && req.method === "GET") {
    const sku = inventoryLedger[1];
    const ledger = await reservations.getLedger(sku);
    if (!ledger) {
      return problem(404, "unknown-sku", `No reservation ledger for SKU ${sku}.`);
    }
    return json({
      sku: ledger.sku,
      available: ledger.available,
      reserved: ledger.reserved,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // POST /v1/admin/inventory/expire — release reservations older than ttl_ms
  if (url.pathname === "/v1/admin/inventory/expire" && req.method === "POST") {
    let body: { ttl_ms?: number };
    try {
      body = (await req.json()) as { ttl_ms?: number };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const ttlMs = body.ttl_ms ?? RESERVATION_TTL_MS;
    const expired = await reservations.expireReservations(ttlMs);
    return json({
      expired,
      ttl_ms: ttlMs,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // POST /v1/checkouts/{checkoutId}/reserve — reserve inventory (atomic ATP) + Tryton move
  const reserve = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/reserve$/);
  if (reserve && req.method === "POST") {
    const checkoutId = reserve[1];
    const authenticated = await authorizeCheckoutOwner(req, checkoutId);
    if ("response" in authenticated) return authenticated.response;
    let body: { sku?: string; quantity?: number };
    try {
      body = (await req.json()) as { sku?: string; quantity?: number };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.sku || !Number.isInteger(body.quantity) || (body.quantity as number) < 1) {
      return problem(400, "invalid-reservation", "sku and positive integer quantity are required.");
    }

    // Idempotency: re-reserving an already-reserved checkout returns the existing reservation.
    const existing = await reservations.getReservation(checkoutId);
    if (existing) {
      return json({
        checkout_id: checkoutId,
        reservation_id: existing.move_id ? `tryton_move_${existing.move_id}` : null,
        tryton_move_id: existing.move_id,
        status: "reserved",
        idempotent: true,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    }

    const quantity = body.quantity as number;
    const sku = body.sku;
    try {
      // Atomic availability check: reject if reserved + quantity would exceed available.
      const ledger = await reservations.tryReserve(sku, quantity);
      if (!ledger) {
        return problem(409, "insufficient-stock", `Insufficient stock for SKU ${sku}.`);
      }
      const moveId = await erp.reserve(checkoutId, sku, quantity);
      await reservations.recordReservation(checkoutId, sku, quantity, moveId);
      await correlation.link(checkoutId, { trytonMove: moveId });
      await events.append({
        event_type: "inventory.reservation_created",
        aggregate_type: "checkout",
        aggregate_id: checkoutId,
        correlation_id: cid,
        payload: { sku, quantity, tryton_move_id: moveId },
      });
      return json({
        checkout_id: checkoutId,
        reservation_id: `tryton_move_${moveId}`,
        tryton_move_id: moveId,
        status: "reserved",
        reserved_quantity: ledger.reserved,
        available_quantity: ledger.available,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      // Roll back the ledger increment if the Tryton move failed.
      await reservations.releaseQuantity(sku, quantity).catch(() => undefined);
      return problem(502, "tryton-error", (error as Error).message);
    }
  }

  // POST /v1/checkouts/{checkoutId}/commit — commit the Tryton reservation
  const commitReservation = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/commit$/);
  if (commitReservation && req.method === "POST") {
    const checkoutId = commitReservation[1];
    const authenticated = await authorizeCheckoutOwner(req, checkoutId);
    if ("response" in authenticated) return authenticated.response;
    const ref = await correlation.get(checkoutId);
    if (!ref?.tryton_move_id) {
      return problem(409, "no-reservation", "No reservation found for this checkout.");
    }
    // Expiry competes with commit: an expired reservation cannot be committed.
    if (await reservations.isExpired(checkoutId, RESERVATION_TTL_MS)) {
      return problem(409, "reservation-expired", "Reservation expired; re-reserve before committing.");
    }
    try {
      await erp.commit(ref.tryton_move_id);
      await events.append({
        event_type: "inventory.reservation_committed",
        aggregate_type: "checkout",
        aggregate_id: checkoutId,
        correlation_id: cid,
        payload: { tryton_move_id: ref.tryton_move_id },
      });
      return json({
        checkout_id: checkoutId,
        reservation_id: `tryton_move_${ref.tryton_move_id}`,
        status: "committed",
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "tryton-error", (error as Error).message);
    }
  }

  // POST /v1/checkouts/{checkoutId}/release — release the Tryton reservation
  const releaseReservation = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/release$/);
  if (releaseReservation && req.method === "POST") {
    const checkoutId = releaseReservation[1];
    const authenticated = await authorizeCheckoutOwner(req, checkoutId);
    if ("response" in authenticated) return authenticated.response;
    const ref = await correlation.get(checkoutId);
    if (!ref?.tryton_move_id) {
      return problem(409, "no-reservation", "No reservation found for this checkout.");
    }
    try {
      await erp.release(ref.tryton_move_id);
      await reservations.release(checkoutId);
      await events.append({
        event_type: "inventory.reservation_released",
        aggregate_type: "checkout",
        aggregate_id: checkoutId,
        correlation_id: cid,
        payload: { tryton_move_id: ref.tryton_move_id },
      });
      return json({
        checkout_id: checkoutId,
        reservation_id: `tryton_move_${ref.tryton_move_id}`,
        status: "released",
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "tryton-error", (error as Error).message);
    }
  }

  // POST /v1/admin/notifications/broadcast — governed staging trigger for the two pilot-wide templates.
  if (url.pathname === "/v1/admin/notifications/broadcast" && req.method === "POST") {
    let body: { template_key?: unknown; product_id?: unknown; product_title?: unknown };
    try {
      body = await req.json() as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const templateKey = body.template_key;
    const productId = typeof body.product_id === "string" ? body.product_id.trim() : "";
    const productTitle = typeof body.product_title === "string" ? body.product_title.trim() : "";
    if ((templateKey !== "product_launch_v1" && templateKey !== "price_drop_v1") || !productId || !productTitle) {
      return problem(
        400,
        "invalid-notification-trigger",
        "template_key must be product_launch_v1 or price_drop_v1; product_id and product_title are required.",
      );
    }
    const event = await events.append({
      event_type: templateKey === "product_launch_v1" ? "catalog.product_launched" : "seller_offer.price_dropped",
      aggregate_type: "product",
      aggregate_id: productId,
      correlation_id: cid,
      payload: { product_id: productId, product_title: productTitle, test_data: true },
    });
    return json({
      event_id: event.id,
      template_key: templateKey,
      audience: "allowlisted-pilot-users",
      external_delivery_enabled: config.fcmDeliveryEnabled,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    }, 202);
  }

  // GET /v1/admin/events — durable domain-event log (WP4)
  if (url.pathname === "/v1/admin/events" && req.method === "GET") {
    const aggregateType = url.searchParams.get("aggregate_type") ?? undefined;
    const aggregateId = url.searchParams.get("aggregate_id") ?? undefined;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const items = await events.list(aggregateType, aggregateId, limit);
    return json({ events: items, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // GET /v1/admin/collections — governed collection registry (WP6)
  if (url.pathname === "/v1/admin/collections" && req.method === "GET") {
    return json({
      collections: collectionRegistry,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // GET /v1/admin/environment — non-secret routing + provider summary for isolation verification.
  // Never exposed in production, and credentials are stripped (host:port only).
  if (url.pathname === "/v1/admin/environment" && req.method === "GET") {
    if (config.environment === "production") {
      return problem(404, "not-found");
    }
    const redact = (value: string): string => {
      try {
        const u = new URL(value);
        return `${u.hostname}${u.port ? `:${u.port}` : ""}`;
      } catch {
        return "unparsed";
      }
    };
    return json({
      environment: config.environment,
      payment_mode: config.paymentAdapterMode,
      routing: {
        medusa: redact(config.medusaBaseUrl),
        tryton: redact(config.trytonBaseUrl),
        nats: redact(config.natsUrl),
        redis: redact(config.redisUrl),
        experience_db: redact(config.experienceDatabaseUrl),
      },
      providers: {
        payment: "simulated",
        otp: "simulated",
        logistics: "simulated",
      },
      pilot_user_count: pilotDirectory.users.length,
      production_release_authorized: false,
      test_data: true,
      correlation_id: cid,
    });
  }

  // GET /v1/admin/orders/{orderId}/reconciliation — correlated owner-service references
  const reconciliation = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/reconciliation$/);
  if (reconciliation && req.method === "GET") {
    const orderId = reconciliation[1];
    const now = new Date().toISOString();
    const ref = await correlation.get(orderId);
    const trytonMove = ref?.tryton_move_id ?? null;
    const orderGroup = ref?.medusa_order_group_id ?? null;

    // Reflect the real Tryton reservation/movement state rather than assuming "committed" when a
    // move exists, so a released/expired/draft reservation is visible as a mismatch.
    let reservationStatus: "not_started" | "reserved" | "committed" | "released" = "not_started";
    let movementStatus = "not_started";
    if (trytonMove) {
      const record = await reservations.getReservation(orderId);
      if (record?.status === "released") {
        reservationStatus = "released";
        movementStatus = "released";
      } else {
        const [move] = await tryton
          .read("stock.move", [trytonMove], ["state"])
          .catch(() => [] as Record<string, unknown>[]);
        const state = String(move?.state ?? "");
        if (state === "assigned") {
          reservationStatus = "committed";
          movementStatus = "staging-posted";
        } else if (state === "cancelled") {
          reservationStatus = "released";
          movementStatus = "released";
        } else {
          reservationStatus = "reserved";
          movementStatus = "staging-pending";
        }
      }
    }
    const reconciled = Boolean(orderGroup && reservationStatus === "committed");
    const mismatchCodes: string[] = [];
    if (!orderGroup) mismatchCodes.push("ORDER_OR_ALLOCATION_MISSING");
    if (!trytonMove) mismatchCodes.push("RESERVATION_OR_ORDER_MISSING");
    else if (reservationStatus !== "committed") mismatchCodes.push(`RESERVATION_${reservationStatus.toUpperCase()}`);
    const recoveryActions = reconciled
      ? []
      : [
          ...(orderGroup ? [] : ["complete-checkout"]),
          ...(trytonMove
            ? ["POST /v1/checkouts/{id}/reserve (re-reserve)"]
            : [`POST /v1/checkouts/${orderId}/reserve`, `POST /v1/checkouts/${orderId}/commit`]),
        ];
    return json({
      order_id: orderId,
      correlation_id: cid,
      environment: "staging",
      test_data: true,
      payment_mode: "simulated",
      checkout: { system: "commerce", entity_type: "checkout-attempt", entity_id: orderId, environment: "staging", test_data: true, status: "completed", observed_at: now },
      order: { system: "medusa", entity_type: "order", entity_id: null, environment: "staging", test_data: true, status: orderGroup ? "confirmed" : "not_started", observed_at: now },
      allocation: { system: "mercur", entity_type: "marketplace-order-allocation", entity_id: orderGroup, environment: "staging", test_data: true, status: orderGroup ? "confirmed" : "not_started", observed_at: now },
      reservation: { system: "tryton", entity_type: "inventory-reservation", entity_id: trytonMove ? `tryton_move_${trytonMove}` : null, environment: "staging", test_data: true, status: reservationStatus, observed_at: now },
      movement: { system: "tryton", entity_type: "stock-movement", entity_id: trytonMove ? `tryton_move_${trytonMove}` : null, environment: "staging", test_data: true, status: movementStatus, observed_at: now },
      accounting: { system: "tryton", entity_type: "accounting-projection", entity_id: null, environment: "staging", test_data: true, status: "test-clearing-projected", observed_at: now },
      accounting_treatment: "staging_test_clearing",
      bank_receipt_claimed: false,
      reconciled,
      mismatch_codes: mismatchCodes,
      recovery_actions: recoveryActions,
    });
  }

  // GET /v1/admin/orders — operator order queue (list correlated checkouts)
  if (url.pathname === "/v1/admin/orders" && req.method === "GET") {
    const rows = await correlation.list();
    return json({
      items: rows.map((r) => ({
        order_id: r.checkout_ref,
        medusa_order_group_id: r.medusa_order_group_id,
        reservation_id: r.tryton_move_id ? `tryton_move_${r.tryton_move_id}` : null,
        reconciled: Boolean(r.medusa_order_group_id && r.tryton_move_id),
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // GET /v1/orders/{orderId} — customer order read (correlated staging references)
  const customerOrder = url.pathname.match(/^\/v1\/orders\/([^/]+)$/);
  if (customerOrder && req.method === "GET") {
    const orderId = customerOrder[1];
    const authenticated = await authorizeCheckoutOwner(req, orderId);
    if ("response" in authenticated) return authenticated.response;
    const ref = await correlation.get(orderId);
    if (!ref) {
      return problem(404, "order-not-found", "No correlated order for this reference.");
    }
    const trytonMove = ref.tryton_move_id ?? null;
    const orderGroup = ref.medusa_order_group_id ?? null;
    return json({
      order_id: orderId,
      medusa_order_group_id: orderGroup,
      status: orderGroup ? "confirmed" : "not_started",
      payment_mode: config.paymentAdapterMode,
      environment: config.environment,
      test_data: true,
      reservation_id: trytonMove ? `tryton_move_${trytonMove}` : null,
      reservation_status: trytonMove ? "committed" : "not_started",
      reconciled: Boolean(orderGroup && trytonMove),
      correlation_id: cid,
    });
  }

  // GET /v1/ops/integration-exceptions — list failure/exception domain events
  if (url.pathname === "/v1/ops/integration-exceptions" && req.method === "GET") {
    const recent = await events.list(undefined, undefined, 200);
    const exceptions = recent.filter((e) => /(failed|exception|error)/i.test(e.event_type));
    return json({
      items: exceptions,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/ops/audit" && req.method === "GET") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({
      items: await privilegedAudit.list(limit),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  return problem(404, "not-found");
}

const server = Bun.serve({
  port: config.port,
  fetch: async (req) => {
    const url = new URL(req.url);
    const cid = correlationId(req);
    const requiredRoles = config.pilotRoleAssignmentsJson ? privilegedRoles(url.pathname) : null;
    const isMutation = req.method !== "GET" && req.method !== "OPTIONS";
    if (!requiredRoles || !isMutation) return handle(req, url, cid);

    const authenticated = await requireAnyRole(req, requiredRoles);
    if ("response" in authenticated) return authenticated.response;
    const consequential = /^\/v1\/admin\/(tryton|inventory)(?:\/|$)/.test(url.pathname) ||
      /^\/v1\/payments\/[^/]+\/simulate$/.test(url.pathname);
    if (consequential && authenticated.authorization.roles.every((role) => role === "super_admin")) {
      return problem(
        409,
        "independent-approval-required",
        "Super-admin consequential actions remain blocked until an independent second approval is recorded.",
      );
    }
    let auditId: string;
    try {
      auditId = await privilegedAudit.start({
        actorUserId: authenticated.user.id,
        actorRoles: authenticated.authorization.roles,
        businessAccountId: authenticated.authorization.businessAccountId,
        sellerId: authenticated.authorization.sellerId,
        method: req.method,
        path: url.pathname,
        correlationId: cid,
      });
    } catch (error) {
      console.warn("[experience-api] privileged audit start failed:", (error as Error).message);
      return problem(503, "audit-store-unavailable", "The privileged action was not executed.");
    }
    let response: Response;
    try {
      response = await handle(req, url, cid);
    } catch (error) {
      console.error("[experience-api] privileged action failed:", (error as Error).message);
      response = problem(500, "privileged-action-failed");
    }
    await privilegedAudit.complete(auditId, response.status).catch((error) => {
      console.warn("[experience-api] privileged audit completion failed:", (error as Error).message);
    });
    return response;
  },
});

// Connect to NATS (best-effort) and start the outbox drain.
nats
  .connect()
  .then(() => {
    console.log("[experience-api] NATS JetStream connected");
    drainOutbox().catch(() => undefined);
    setInterval(() => drainOutbox().catch(() => undefined), 1000);
  })
  .catch((e) => {
    console.warn("[experience-api] NATS connect failed (cross-system events disabled):", (e as Error).message);
  });

console.log(
  `[experience-api] ready on http://localhost:${server.port} ` +
    `(environment=${config.environment}, payment=${config.paymentAdapterMode})`,
);
