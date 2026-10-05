import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { MedusaStoreClient, type StoreOffer } from "./medusa/store-client.js";
import { SimulatedPaymentAdapter } from "./payment/simulated-adapter.js";
import type { Money, SimulatorOutcome } from "./payment/types.js";
import { TrytonClient } from "./tryton/client.js";
import { TrytonErp } from "./tryton/erp.js";
import { CorrelationStore } from "./store/correlation-store.js";
import { EventStore } from "./store/event-store.js";
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
const correlation = new CorrelationStore(config.experienceDatabaseUrl);
const events = new EventStore(config.experienceDatabaseUrl);
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

  if (url.pathname === "/health") {
    return json({
      status: "ok",
      environment: config.environment,
      payment_mode: config.paymentAdapterMode,
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
    let body: { region_id?: string; currency_code?: string };
    try {
      body = (await req.json()) as { region_id?: string; currency_code?: string };
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
      const products = await medusa.listProducts(limit, offset);
      const composed = await Promise.all(
        products.map(async (p) => {
          const base = {
            id: p.id,
            title: p.title,
            thumbnail: p.thumbnail,
            description: p.description,
            handle: p.handle,
            variants: p.variants,
          };
          try {
            const offers = await medusa.listOffers(p.id);
            const { selected } = composeOffers(offers);
            return { ...base, best_price: selected, offer_count: offers.length };
          } catch {
            return { ...base, best_price: null, offer_count: 0 };
          }
        }),
      );
      return json({
        products: composed,
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
      const [p, offers] = await Promise.all([
        medusa.getProduct(productId),
        medusa.listOffers(productId),
      ]);
      const { offerViews, selected } = composeOffers(offers);
      return json({
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        description: p.description,
        variants: p.variants,
        offers: offerViews,
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

  // POST /v1/checkouts/{checkoutId}/reserve — reserve inventory in Tryton
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
    try {
      const moveId = await erp.reserve(checkoutId, body.sku, body.quantity as number);
      await correlation.link(checkoutId, { trytonMove: moveId });
      await events.append({
        event_type: "inventory.reservation_created",
        aggregate_type: "checkout",
        aggregate_id: checkoutId,
        correlation_id: cid,
        payload: { sku: body.sku, quantity: body.quantity, tryton_move_id: moveId },
      });
      return json({
        checkout_id: checkoutId,
        reservation_id: `tryton_move_${moveId}`,
        tryton_move_id: moveId,
        status: "reserved",
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 201);
    } catch (error) {
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

  return problem(404, "not-found");
}

const server = Bun.serve({
  port: config.port,
  fetch: (req) => {
    const url = new URL(req.url);
    return handle(req, url);
  },
});

console.log(
  `[experience-api] ready on http://localhost:${server.port} ` +
    `(environment=${config.environment}, payment=${config.paymentAdapterMode})`,
);
