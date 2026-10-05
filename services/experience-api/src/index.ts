import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { MedusaStoreClient, type StoreOffer } from "./medusa/store-client.js";
import { SimulatedPaymentAdapter } from "./payment/simulated-adapter.js";
import type { Money, SimulatorOutcome } from "./payment/types.js";
import { TrytonClient } from "./tryton/client.js";
import { TrytonErp } from "./tryton/erp.js";
import { CorrelationStore } from "./store/correlation-store.js";
import { EventStore } from "./store/event-store.js";
import { ReservationStore } from "./store/reservation-store.js";
import { NatsPublisher, eventSubject } from "./events/nats-publisher.js";
import { appContent, resolveContent, type AppLocale } from "./content/app-content.js";
import { CollectionResolver } from "./collections/resolver.js";
import { collections as collectionRegistry } from "./collections/registry.js";
import { findPilotUser, pilotUsers } from "./auth/pilot-users.js";
import { issueChallenge, verifyChallenge } from "./auth/dummy-otp.js";
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
const nats = new NatsPublisher(config.natsUrl);

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

/** Read-model offer fetch with a short TTL cache. Never used for cart/order/reservation decisions. */
async function getOffersCached(
  productIds: string[],
  context: string,
): Promise<{ offers: StoreOffer[]; cacheHit: boolean }> {
  const key = offerCacheKey(productIds, context);
  const cached = offerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { offers: cached.offers, cacheHit: true };
  }
  const offers = await medusa.listOffersByProducts(productIds);
  offerCache.set(key, { offers, expiresAt: Date.now() + OFFER_CACHE_TTL_MS });
  return { offers, cacheHit: false };
}
const collections = new CollectionResolver(medusa);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, idempotency-key, x-correlation-id",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });

const problem = (status: number, title: string, detail?: string) =>
  json({ type: "about:blank", title, status, detail }, status);

function correlationId(req: Request): string {
  return req.headers.get("x-correlation-id") ?? randomUUID();
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
    return {
      id: o.id,
      seller_id: o.seller_id,
      seller_name: o.seller?.name ?? null,
      variant_id: o.variant_id,
      sku: o.sku,
      currency_code: o.calculated_price?.currency_code ?? "INR",
      unit_amount_minor: o.calculated_price?.calculated_amount ?? null,
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

async function handle(req: Request, url: URL): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } });
  }

  const cid = correlationId(req);

  if (url.pathname === "/ops" || url.pathname === "/ops/") {
    return new Response(opsPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/health") {
    return json({
      status: "ok",
      environment: config.environment,
      payment_mode: config.paymentAdapterMode,
      nats: nats.connected ? "connected" : "disconnected",
      test_data: config.environment !== "production",
      correlation_id: cid,
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
    const user = findPilotUser(body.identifier);
    if (!user) {
      return problem(403, "not-pilot-user", "This identity is not allowlisted for the pilot.");
    }
    const challenge = issueChallenge(user.id);
    return json({
      ...challenge,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    }, 201);
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
    const verified = verifyChallenge(body.challenge_id, body.code);
    if (!verified) {
      return problem(401, "invalid-otp", "Invalid or expired OTP.");
    }
    const user = pilotUsers.find((u) => u.id === verified.user_id);
    return json({
      session_token: verified.session_token,
      user,
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
    return json({ ...shipment, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // POST /v1/shipments/{shipmentId}/advance — demo-only status progression (Step 3)
  const advanceMatch = url.pathname.match(/^\/v1\/shipments\/([^/]+)\/advance$/);
  if (advanceMatch && req.method === "POST") {
    const shipment = advanceShipment(advanceMatch[1]);
    if (!shipment) return problem(404, "unknown-shipment");
    return json({ ...shipment, environment: config.environment, test_data: true, correlation_id: cid });
  }

  // GET /v1/notifications — dummy notification feed derived from domain events (Step 4)
  if (url.pathname === "/v1/notifications" && req.method === "GET") {
    const items = await events.list(undefined, undefined, 20);
    const messages: Record<string, string> = {
      "order.confirmed": "Your order was confirmed.",
      "inventory.reservation_created": "Inventory reserved for your order.",
      "inventory.reservation_committed": "Inventory committed for your order.",
      "inventory.reservation_released": "Inventory reservation released.",
      "shipment.status_changed": "Your shipment status changed.",
    };
    return json({
      notifications: items.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        message: messages[e.event_type] ?? e.event_type,
        occurred_at: e.occurred_at,
      })),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
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
    return json(state);
  }

  // POST /v1/carts — create a canonical Medusa cart (Commerce)
  if (url.pathname === "/v1/carts" && req.method === "POST") {
    let body: { region_id?: string; currency_code?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as { region_id?: string; currency_code?: string };
      }
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    try {
      const cart = await medusa.createCart(
        body.region_id ?? config.medusaRegionId,
        body.currency_code ?? "inr",
      );
      return json({ ...cart, environment: config.environment, test_data: true, correlation_id: cid }, 201);
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/carts/{cartId}/lines — add a seller offer (Marketplace) to the cart
  const cartLines = url.pathname.match(/^\/v1\/carts\/([^/]+)\/lines$/);
  if (cartLines && req.method === "POST") {
    const cartId = cartLines[1];
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
    try {
      const result = await medusa.completeCart(cartId);
      if (result.type === "order_group") {
        await correlation.link(cartId, { orderGroup: result.order_group?.id });
        await events.append({
          event_type: "order.confirmed",
          aggregate_type: "order_group",
          aggregate_id: result.order_group?.id ?? cartId,
          correlation_id: cid,
          payload: { cart_id: cartId, order_group: result.order_group },
        });
        return json({
          type: "order_group",
          order_group: result.order_group,
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
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // GET /v1/products — composed product list with best-price offer per product
  if (url.pathname === "/v1/products" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    try {
      const t0 = performance.now();
      const products = await medusa.listProducts(limit, offset);
      const productsMs = performance.now() - t0;

      const productIds = products.map((p) => p.id);
      const cacheKey = offerCacheKey(productIds, `${config.medusaRegionId}:${config.medusaCountryCode}:inr`);

      const t1 = performance.now();
      const cached = offerCache.get(cacheKey);
      let allOffers: StoreOffer[];
      let cacheHit = false;
      if (cached && cached.expiresAt > Date.now()) {
        allOffers = cached.offers;
        cacheHit = true;
      } else {
        allOffers = await medusa.listOffersByProducts(productIds);
        offerCache.set(cacheKey, { offers: allOffers, expiresAt: Date.now() + OFFER_CACHE_TTL_MS });
      }
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
    try {
      const context = `${config.medusaRegionId}:${config.medusaCountryCode}:inr`;

      const t0 = performance.now();
      const p = await medusa.getProduct(productId);
      const productMs = performance.now() - t0;

      const t1 = performance.now();
      const { offers, cacheHit } = await getOffersCached([productId], context);
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

  // GET /v1/admin/orders/{orderId}/reconciliation — correlated owner-service references
  const reconciliation = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/reconciliation$/);
  if (reconciliation && req.method === "GET") {
    const orderId = reconciliation[1];
    const now = new Date().toISOString();
    const ref = await correlation.get(orderId);
    const trytonMove = ref?.tryton_move_id ?? null;
    const orderGroup = ref?.medusa_order_group_id ?? null;
    const reconciled = Boolean(orderGroup && trytonMove);
    return json({
      order_id: orderId,
      correlation_id: cid,
      environment: "staging",
      test_data: true,
      payment_mode: "simulated",
      checkout: { system: "commerce", entity_type: "checkout-attempt", entity_id: orderId, environment: "staging", test_data: true, status: "completed", observed_at: now },
      order: { system: "medusa", entity_type: "order", entity_id: null, environment: "staging", test_data: true, status: orderGroup ? "confirmed" : "not_started", observed_at: now },
      allocation: { system: "mercur", entity_type: "marketplace-order-allocation", entity_id: orderGroup, environment: "staging", test_data: true, status: orderGroup ? "confirmed" : "not_started", observed_at: now },
      reservation: { system: "tryton", entity_type: "inventory-reservation", entity_id: trytonMove ? `tryton_move_${trytonMove}` : null, environment: "staging", test_data: true, status: trytonMove ? "committed" : "not_started", observed_at: now },
      movement: { system: "tryton", entity_type: "stock-movement", entity_id: trytonMove ? `tryton_move_${trytonMove}` : null, environment: "staging", test_data: true, status: trytonMove ? "staging-posted" : "not_started", observed_at: now },
      accounting: { system: "tryton", entity_type: "accounting-projection", entity_id: null, environment: "staging", test_data: true, status: "test-clearing-projected", observed_at: now },
      accounting_treatment: "staging_test_clearing",
      bank_receipt_claimed: false,
      reconciled,
      mismatch_codes: reconciled ? [] : ["RESERVATION_OR_ORDER_MISSING"],
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

  return problem(404, "not-found");
}

const server = Bun.serve({
  port: config.port,
  fetch: (req) => {
    const url = new URL(req.url);
    return handle(req, url);
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
