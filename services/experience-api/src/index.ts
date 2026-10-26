import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { loadConfig } from "./config.js";
import {
  MedusaStoreClient,
  SIMULATED_PAYMENT_PROVIDER_ID,
  type StoreOffer,
  type StoreCart,
  type StoreAddress,
  type StorePaymentCollection,
  type StorePaymentSession,
  type StoreProduct,
  type StoreShippingOption,
} from "./medusa/store-client.js";
import { SimulatedPaymentAdapter } from "./payment/simulated-adapter.js";
import type { Money, SimulatorOutcome } from "./payment/types.js";
import { TrytonClient } from "./tryton/client.js";
import { TrytonErp } from "./tryton/erp.js";
import { CorrelationStore } from "./store/correlation-store.js";
import { EventStore } from "./store/event-store.js";
import { ReservationStore } from "./store/reservation-store.js";
import { InventoryRequestStore } from "./store/inventory-request-store.js";
import { NotificationStore } from "./store/notification-store.js";
import { PrivilegedAuditStore } from "./store/privileged-audit-store.js";
import { NatsPublisher, eventSubject } from "./events/nats-publisher.js";
import { appContent, resolveContent, type AppLocale } from "./content/app-content.js";
import { CmsContentAdapter, buildBannerPreview } from "./content/cms-adapter.js";
import {
  composeOffers,
  composeVariantPrices,
  type B2bPricingSnapshot,
  type ComposeOptions,
} from "./commerce/offer-composition.js";
import {
  composeStorefrontCategories,
  resolveSeedBanners,
  type ComposedCategory,
} from "./content/presentation.js";
import { resolveSectionProducts } from "./content/section-products.js";
import type { StorefrontChannel } from "./content/storefront-layout.js";
import { verifyCmsWebhook } from "./content/cms-webhook.js";
import { CmsContentStore } from "./store/cms-content-store.js";
import { CollectionNotFoundError, CollectionResolver } from "./collections/resolver.js";
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
import { checkServiceability } from "./logistics/simulated-logistics.js";
import {
  ShipmentStore,
  SHIPMENT_STATUSES,
  SELLER_SHIPMENT_TRANSITIONS,
  sellerAllowedShipmentTransitions,
  type ShipmentRecord,
  type ShipmentStatus,
} from "./logistics/shipment-store.js";
import { SimulatedLogisticsProvider } from "./logistics/provider.js";
import {
  ReturnStore,
  SELLER_RETURN_TRANSITIONS,
  type ReturnStatus,
} from "./store/return-store.js";
import {
  BoughtTogetherStore,
  BoughtTogetherError,
  type BoughtTogetherChannel,
  type BoughtTogetherPair,
  type BoughtTogetherStatus,
} from "./store/bought-together-store.js";
import {
  RETURN_POLICY,
  computeReturnEligibility,
  orderLineSnapshots,
} from "./returns/eligibility.js";
import { itemSubtotalMinor } from "./commerce/cart-totals.js";
import { medusaToMinor, medusaToMinorOr } from "./commerce/money.js";
import {
  imageQualityScore,
  orderByImageQuality,
} from "./catalogue/image-quality-order.js";

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
const inventoryRequests = new InventoryRequestStore(config.experienceDatabaseUrl);
const notifications = new NotificationStore(config.experienceDatabaseUrl);
const shipmentStore = new ShipmentStore(config.experienceDatabaseUrl);
const logistics = new SimulatedLogisticsProvider(shipmentStore);
const returns = new ReturnStore(config.experienceDatabaseUrl);
const boughtTogether = new BoughtTogetherStore(config.experienceDatabaseUrl);
const privilegedAudit = new PrivilegedAuditStore(config.experienceDatabaseUrl);
const cmsContentStore = new CmsContentStore(config.experienceDatabaseUrl);
const cmsContent = new CmsContentAdapter(
  {
    baseUrl: config.cmsBaseUrl,
    apiToken: config.cmsApiToken,
    cacheTtlSeconds: config.cmsCacheTtlSeconds,
  },
  cmsContentStore,
);
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
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    },
  });

const problem = (
  status: number,
  title: string,
  detail?: string,
  extensions?: Record<string, unknown>,
) => json({ type: "about:blank", title, status, detail, ...(extensions ?? {}) }, status);

function boughtTogetherFailure(error: unknown): Response {
  if (error instanceof BoughtTogetherError) {
    return problem(error.status, error.code, error.message);
  }
  console.warn("[experience-api] bought-together store failed:", (error as Error).message);
  return problem(500, "pair-store-error", "The pair store is unavailable.");
}

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

/**
 * Staging-only service identity for the Mercur admin console proxy. The shared secret is never
 * accepted unless configured, and the resulting actor is always an operator, never a customer.
 */
function serviceOperatorAuthentication(req: Request): AuthenticationResult | null {
  const expected = config.adminServiceSecret;
  if (!expected) return null;
  const supplied = req.headers.get("x-buildkart-admin-service-secret") ?? "";
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return null;
  }
  const userId = req.headers.get("x-operator-user-id")?.trim() || "admin_console";
  const authorization: PilotAuthorization = {
    userId,
    roles: ["marketplace_operator", "support_operator"],
  };
  return {
    user: {
      id: userId,
      email: "admin-console@buildkart.invalid",
      name: "Admin console operator",
    },
    token: "admin-console-service",
    authorization,
  };
}

async function requireAnyRole(req: Request, roles: readonly PilotRole[]): Promise<AuthenticationResult> {
  const service = serviceOperatorAuthentication(req);
  if (service && !("response" in service) && hasAnyRole(service.authorization, roles)) {
    return service;
  }
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
type WorkspaceStreamData = {
  workspaceId: string;
  ticket: string;
  signature: string;
  cursor: number;
};
// Bun exposes the client WebSocket at runtime; the shared DOM type does not
// describe its event properties in this TypeScript configuration.
const workspaceStreams = new Map<ServerWebSocket<unknown>, any>();

function signWorkspaceTicket(
  user: PilotUser,
  authorization: PilotAuthorization,
  cid: string,
  workspaceId: string,
): { ticket: string; signature: string; expires_in_seconds: number } {
  const payload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles: authorization.roles,
    businessAccountId: authorization.businessAccountId,
    sellerId: authorization.sellerId,
    iat: Math.floor(Date.now() / 1000),
    correlationId: cid,
    purpose: "workspace-stream",
    workspaceId,
  };
  const ticket = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.workspaceServiceSecret as string)
    .update(ticket)
    .digest("hex");
  return { ticket, signature, expires_in_seconds: 120 };
}

function verifyWorkspaceTicket(
  ticket: string,
  signature: string,
  workspaceId: string,
  cid: string,
): { userId: string; businessAccountId?: string } | Response {
  let payload: {
    userId?: string;
    roles?: string[];
    businessAccountId?: string;
    iat?: number;
    purpose?: string;
    workspaceId?: string;
  };
  try {
    payload = JSON.parse(Buffer.from(ticket, "base64url").toString("utf8"));
  } catch {
    return problem(401, "invalid-workspace-ticket", "Workspace stream ticket is invalid.");
  }
  if (config.workspaceServiceSecret) {
    const expected = createHmac("sha256", config.workspaceServiceSecret)
      .update(ticket)
      .digest();
    const provided = Buffer.from(signature, "hex");
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return problem(401, "invalid-workspace-ticket-signature", "Workspace stream ticket signature is invalid.");
    }
  } else {
    return problem(503, "workspace-not-configured", "The workspace service is not configured.");
  }
  const hasWorkspaceRole = payload.roles?.some((role) =>
    ["b2b_buyer", "b2b_account_admin", "b2b_approver", "super_admin", "customer"].includes(role),
  );
  if (
    payload.purpose !== "workspace-stream" ||
    payload.workspaceId !== workspaceId ||
    !payload.userId ||
    (!payload.businessAccountId && !payload.roles?.includes("customer")) ||
    !hasWorkspaceRole ||
    !Number.isInteger(payload.iat) ||
    Math.abs(Date.now() / 1000 - (payload.iat as number)) > 120
  ) {
    return problem(401, "expired-workspace-ticket", "Workspace stream ticket is invalid or expired.");
  }
  return {
    userId: payload.userId,
    businessAccountId: payload.businessAccountId,
  };
}

async function handleWorkspaceStream(
  req: Request,
  server: Bun.Server,
  workspaceId: string,
  url: URL,
  cid: string,
): Promise<Response | undefined> {
  const ticket = url.searchParams.get("ticket");
  const signature = url.searchParams.get("signature");
  if (!ticket || !signature) {
    return problem(401, "workspace-ticket-required", "A workspace stream ticket is required.");
  }
  const verified = verifyWorkspaceTicket(ticket, signature, workspaceId, cid);
  if (verified instanceof Response) return verified;
  const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.");
  }
  const upgraded = server.upgrade(req, {
    data: { workspaceId, ticket, signature, cursor },
  });
  if (!upgraded) {
    return problem(400, "websocket-upgrade-failed", "WebSocket upgrade failed.");
  }
  return undefined;
}

/**
 * Signed proxy to the internal Workspace Service. The browser never sees the service origin or
 * secret. The workspace service independently verifies the actor context and membership.
 */
async function proxyWorkspace(
  req: Request,
  user: PilotUser,
  authorization: PilotAuthorization,
  cid: string,
): Promise<Response> {
  if (!config.workspaceServiceUrl || !config.workspaceServiceSecret) {
    return problem(503, "workspace-not-configured", "The workspace service is not configured.");
  }
  // B2B members and B2C consumers share the workspace proxy. The workspace service performs the
  // scope and membership check; this layer only rejects identities with no collaboration role.
  if (
    !hasAnyRole(authorization, [
      "b2b_buyer",
      "b2b_account_admin",
      "b2b_approver",
      "super_admin",
      "customer",
    ])
  ) {
    return problem(404, "not-found");
  }
  const url = new URL(req.url);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const actor = {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles: authorization.roles,
    businessAccountId: authorization.businessAccountId,
    sellerId: authorization.sellerId,
    iat: Math.floor(Date.now() / 1000),
    correlationId: cid,
  };
  const encoded = Buffer.from(JSON.stringify(actor)).toString("base64url");
  const signature = createHmac("sha256", config.workspaceServiceSecret)
    .update(encoded)
    .digest("hex");
  try {
    const upstream = await fetch(`${config.workspaceServiceUrl}${url.pathname}${url.search}`, {
      method: req.method,
      headers: {
        "x-workspace-actor": encoded,
        "x-workspace-signature": signature,
        "x-correlation-id": cid,
        ...(body ? { "content-type": req.headers.get("content-type") ?? "application/json" } : {}),
        ...(req.headers.get("idempotency-key")
          ? { "idempotency-key": req.headers.get("idempotency-key")! }
          : {}),
      },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.warn("[experience-api] workspace proxy failed:", (error as Error).message);
    return problem(503, "workspace-unavailable", "The workspace service is temporarily unavailable.");
  }
}

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

/**
 * Effective read channel.
 *
 * An explicit `channel=b2b` is honoured only for an authenticated business buyer. A consumer token (or
 * no token) can never widen its catalogue view by adding a query parameter, so the B2B sales channel is
 * a consequence of identity rather than a client assertion.
 */
function requestedChannel(
  requested: string | null,
  authorization?: PilotAuthorization,
): "b2b" | "b2c" {
  const business = isBusinessBuyer(authorization);
  if (!business) return "b2c";
  return requested?.trim().toLowerCase() === "b2c" ? "b2c" : "b2b";
}

function salesChannelIdFor(channel: "b2b" | "b2c"): string | undefined {
  return channel === "b2b"
    ? config.medusaB2bSalesChannelId ?? config.medusaB2cSalesChannelId
    : config.medusaB2cSalesChannelId;
}

function deliveryTierFor(option: StoreShippingOption): "standard" | "express" {
  const code = option.type?.code?.trim().toLowerCase();
  if (code === "express") return "express";
  if (code === "standard") return "standard";
  const name = option.name.trim().toLowerCase();
  if (name.includes("express") || name.includes("priority")) return "express";
  return "standard";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function validateBoughtTogetherInput(input: {
  product_a_id: string;
  product_b_id: string;
  variant_a_id?: string | null;
  variant_b_id?: string | null;
  channel: BoughtTogetherChannel;
}): Promise<void> {
  const channels: Array<"b2c" | "b2b"> =
    input.channel === "both" ? ["b2c", "b2b"] : [input.channel];
  const members = [
    { productId: input.product_a_id, variantId: input.variant_a_id ?? null },
    { productId: input.product_b_id, variantId: input.variant_b_id ?? null },
  ];
  const productIds = members.map((member) => member.productId);
  for (const channel of channels) {
    const products = new Map<string, StoreProduct>();
    for (const productId of productIds) {
      try {
        products.set(
          productId,
          await withTimeout(
            medusa.getProduct(productId, salesChannelIdFor(channel)),
            4000,
          ),
        );
      } catch {
        throw new BoughtTogetherError(
          "product_not_found",
          `Product ${productId} is not available in ${channel}.`,
          404,
        );
      }
    }
    const regionId = channel === "b2b"
      ? config.medusaB2bRegionId ?? config.medusaRegionId
      : config.medusaRegionId;
    const offers = await withTimeout(
      medusa.listOffersByProducts(productIds, regionId),
      4000,
    );
    for (const member of members) {
      const product = products.get(member.productId);
      const productOffers = offers.filter(
        (offer) =>
          offer.product_id === member.productId &&
          (!member.variantId || offer.variant_id === member.variantId),
      );
      if (productOffers.length === 0) {
        throw new BoughtTogetherError(
          "pair_not_ready",
          member.variantId
            ? `SKU ${member.variantId} has no offer in ${channel}.`
            : `Product ${member.productId} has no offer in ${channel}.`,
          409,
        );
      }
      const options: ComposeOptions = {
        channel,
        b2bPricing:
          channel === "b2b"
            ? ((product?.metadata?.buildkart_b2b_pricing ?? {}) as Record<
                string,
                B2bPricingSnapshot
              >)
            : null,
      };
      const composed = composeOffers(productOffers, options);
      const priced = composed.offerViews.some(
        (offer) => offer.unit_amount_minor != null && offer.unit_amount_minor > 0,
      );
      if (!priced) {
        throw new BoughtTogetherError(
          "pair_not_ready",
          member.variantId
            ? `SKU ${member.variantId} has no priced offer in ${channel}.`
            : `Product ${member.productId} has no priced offer in ${channel}.`,
          409,
        );
      }
      if (channel === "b2b") {
        const snapshots = (product?.metadata?.buildkart_b2b_pricing ?? {}) as Record<
          string,
          B2bPricingSnapshot
        >;
        const tradePriced = productOffers.some((offer) => {
          const snapshot = snapshots[offer.id];
          return snapshot?.configured === true && (snapshot.amount ?? 0) > 0;
        });
        if (!tradePriced) {
          throw new BoughtTogetherError(
            "pair_not_ready",
            member.variantId
              ? `SKU ${member.variantId} has no B2B trade price.`
              : `Product ${member.productId} has no B2B trade price.`,
            409,
          );
        }
      }
    }
  }
}

type BoughtTogetherEnrichedPair = BoughtTogetherPair & {
  products: Array<{
    id: string;
    title: string;
    thumbnail: string | null;
    sku_count: number;
    variant_id: string | null;
    variant_title: string | null;
    sku: string | null;
    status: "published" | "unavailable";
    channel_ready: { b2c: boolean; b2b: boolean };
    variant_channel_ready: { b2c: boolean | null; b2b: boolean | null };
  }>;
  health: "ready" | "out_of_stock" | "unavailable";
  health_by_channel: { b2c: "ready" | "out_of_stock" | "unavailable"; b2b: "ready" | "out_of_stock" | "unavailable" };
};

async function enrichBoughtTogetherPairs(
  rows: BoughtTogetherPair[],
): Promise<BoughtTogetherEnrichedPair[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((row) => [row.product_a_id, row.product_b_id]))];
  const productsByChannel = new Map<string, Map<string, StoreProduct>>();
  for (const channel of ["b2c", "b2b"] as const) {
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const product = await withTimeout(
            medusa.getProduct(id, salesChannelIdFor(channel)),
            4000,
          );
          return [id, product] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    productsByChannel.set(
      channel,
      new Map(entries.filter((entry): entry is readonly [string, StoreProduct] => Boolean(entry[1]))),
    );
  }

  const offersByProduct = new Map<string, StoreOffer[]>();
  try {
    const offers = await withTimeout(
      medusa.listOffersByProducts(ids, config.medusaRegionId),
      4000,
    );
    for (const offer of offers) {
      const list = offersByProduct.get(offer.product_id) ?? [];
      list.push(offer);
      offersByProduct.set(offer.product_id, list);
    }
  } catch {
    // Health is best-effort; the admin list still renders.
  }

  const productFor = (id: string) =>
    productsByChannel.get("b2c")?.get(id) ?? productsByChannel.get("b2b")?.get(id);
  const variantFor = (id: string, variantId: string | null) => {
    const product = productFor(id);
    if (!product || !variantId) return null;
    return (product.variants ?? []).find((variant) => variant.id === variantId) ?? null;
  };
  const offersFor = (id: string, variantId: string | null) =>
    (offersByProduct.get(id) ?? []).filter(
      (offer) => !variantId || offer.variant_id === variantId,
    );
  const channelHealth = (id: string, variantId: string | null, channel: "b2c" | "b2b") => {
    if (!productsByChannel.get(channel)?.has(id)) return "unavailable" as const;
    const offers = offersFor(id, variantId);
    if (offers.length === 0) return "unavailable" as const;
    return offers.some((offer) => offer.in_stock !== false)
      ? ("ready" as const)
      : ("out_of_stock" as const);
  };
  const variantChannelReady = (
    id: string,
    variantId: string | null,
    channel: "b2c" | "b2b",
  ) => {
    if (!variantId) return null;
    if (!productsByChannel.get(channel)?.has(id)) return false;
    return offersFor(id, variantId).some(
      (offer) => (offer.calculated_price?.calculated_amount ?? 0) > 0,
    );
  };

  return rows.map((row) => {
    const selectedChannels: Array<"b2c" | "b2b"> =
      row.channel === "both" ? ["b2c", "b2b"] : [row.channel];
    const healthForChannel = (channel: "b2c" | "b2b") => {
      const a = channelHealth(row.product_a_id, row.variant_a_id, channel);
      const b = channelHealth(row.product_b_id, row.variant_b_id, channel);
      if (a === "unavailable" || b === "unavailable") return "unavailable" as const;
      if (a === "out_of_stock" || b === "out_of_stock") return "out_of_stock" as const;
      return "ready" as const;
    };
    const healthByChannel = {
      b2c: healthForChannel("b2c"),
      b2b: healthForChannel("b2b"),
    };
    const health = selectedChannels.some((channel) => healthByChannel[channel] === "unavailable")
      ? ("unavailable" as const)
      : selectedChannels.some((channel) => healthByChannel[channel] === "out_of_stock")
        ? ("out_of_stock" as const)
        : ("ready" as const);
    const summary = (id: string, variantId: string | null) => {
      const product = productFor(id);
      const variant = variantFor(id, variantId);
      return {
        id,
        title: product?.title ?? "Product unavailable",
        thumbnail: product?.thumbnail ?? null,
        sku_count: product?.variants?.length ?? 0,
        variant_id: variantId,
        variant_title: variant?.title ?? null,
        sku: variant?.sku ?? null,
        status: product ? ("published" as const) : ("unavailable" as const),
        channel_ready: {
          b2c: productsByChannel.get("b2c")?.has(id) ?? false,
          b2b: productsByChannel.get("b2b")?.has(id) ?? false,
        },
        variant_channel_ready: {
          b2c: variantChannelReady(id, variantId, "b2c"),
          b2b: variantChannelReady(id, variantId, "b2b"),
        },
      };
    };
    return {
      ...row,
      products: [
        summary(row.product_a_id, row.variant_a_id),
        summary(row.product_b_id, row.variant_b_id),
      ],
      health,
      health_by_channel: healthByChannel,
    };
  });
}


/** Scan ceiling for the metadata-selected staged catalogue. Bounded so a bad marker cannot page forever. */
const CATALOGUE_SCAN_PAGE_SIZE = 250;
const MAX_CATALOGUE_SCAN = 2000;

function privilegedRoles(pathname: string): readonly PilotRole[] | null {
  if (/^\/v1\/admin\/(tryton|inventory)(?:\/|$)/.test(pathname)) {
    return ["erp_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/collections(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/merchandising\/bought-together(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "super_admin"];
  }
  if (/^\/v1\/admin\/notifications(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "super_admin"];
  }
  if (
    /^\/v1\/admin\/(shipments|shipment-exceptions|returns|order-statuses|order-groups|seller-activity)(?:\/|$)/.test(
      pathname,
    )
  ) {
    return ["marketplace_operator", "support_operator", "super_admin"];
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

async function shipmentsWithEvents(orderGroupId: string) {
  const shipments = await logistics.listByOrderGroup(orderGroupId);
  return Promise.all(
    shipments.map(async (shipment) => ({
      ...shipment,
      events: await logistics.listEvents(shipment.id),
    })),
  );
}

function sellerShipmentView(shipment: ShipmentRecord): ShipmentRecord {
  return {
    ...shipment,
    allowedTransitions: sellerAllowedShipmentTransitions(shipment.status),
  };
}

async function sellerScopedReturns(sellerId: string, limit = 100) {
  const cases = await returns.listAll(limit);
  const scoped = [];
  for (const record of cases) {
    if (!record.orderGroupId) continue;
    const shipments = await logistics.listByOrderGroup(record.orderGroupId);
    const lineKeys = new Set(
      shipments
        .filter((shipment) => shipment.sellerId === sellerId)
        .flatMap((shipment) => shipment.lines.map((line) => line.lineKey)),
    );
    if (lineKeys.size === 0) continue;
    const lines = record.lines.filter((line) => lineKeys.has(line.lineKey));
    if (lines.length === 0) continue;
    scoped.push({
      ...record,
      lines,
      allowedTransitions: ["requested", "under_review"].includes(record.status)
        ? []
        : record.allowedTransitions.filter((status) =>
            SELLER_RETURN_TRANSITIONS.has(status)
          ),
      seller_scope: sellerId,
    });
  }
  return scoped;
}

type ManualShipmentStatusBody = {
  status?: string;
  expected_version?: number;
  operation_key?: string;
  occurred_at?: string;
  reason?: string;
  note?: string;
  attempt_number?: number;
  attempt_reason?: string;
  next_action?: string;
  revised_delivery_at?: string;
  notify_customer?: boolean;
  proof_ref?: string;
  delivered_lines?: Array<{ line_key?: string; delivered_qty?: number }>;
};

const SHIPMENT_REASON_STATUSES = new Set<ShipmentStatus>([
  "delayed",
  "delivery_attempted",
  "delivery_failed",
  "buyer_action_required",
  "damaged",
  "lost",
  "returning_to_seller",
  "returned_to_seller",
  "rto_in_transit",
  "rto_delivered",
  "cancelled",
]);

function validateManualShipmentBody(
  body: ManualShipmentStatusBody,
  requireActingReason: boolean,
): { status: ShipmentStatus } | Response {
  if (!body.status || !SHIPMENT_STATUSES.includes(body.status as ShipmentStatus)) {
    return problem(
      400,
      "invalid-shipment-status",
      `Status must be one of ${SHIPMENT_STATUSES.join(", ")}.`,
    );
  }
  const status = body.status as ShipmentStatus;
  if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
    return problem(
      400,
      "expected-version-required",
      "expected_version must be a positive integer.",
    );
  }
  if (
    (requireActingReason || SHIPMENT_REASON_STATUSES.has(status)) &&
    !body.reason?.trim()
  ) {
    return problem(
      400,
      "reason-required",
      requireActingReason
        ? "A reason is required when an Admin updates a Seller shipment."
        : "A reason is required for this shipment status.",
    );
  }
  if (
    ["delivery_attempted", "delivery_failed", "buyer_action_required"].includes(
      status,
    ) &&
    (!Number.isInteger(body.attempt_number) || Number(body.attempt_number) < 1)
  ) {
    return problem(
      400,
      "attempt-number-required",
      "attempt_number must be a positive integer for this status.",
    );
  }
  if (
    ["delivery_attempted", "delivery_failed"].includes(status) &&
    !body.attempt_reason?.trim()
  ) {
    return problem(
      400,
      "attempt-reason-required",
      "attempt_reason is required for an attempted or failed delivery.",
    );
  }
  if (status === "buyer_action_required" && !body.next_action?.trim()) {
    return problem(
      400,
      "next-action-required",
      "next_action is required when buyer action is needed.",
    );
  }
  if (
    status === "delayed" &&
    (!body.revised_delivery_at || Number.isNaN(Date.parse(body.revised_delivery_at)))
  ) {
    return problem(
      400,
      "revised-delivery-required",
      "A valid revised_delivery_at timestamp is required for a delay.",
    );
  }
  if (body.occurred_at && Number.isNaN(Date.parse(body.occurred_at))) {
    return problem(400, "invalid-occurred-at", "occurred_at must be an ISO timestamp.");
  }
  return { status };
}

async function orderEligibility(
  orderId: string,
  userId: string,
  ref: {
    medusa_order_group_id?: string | null;
    medusa_order_group?: Record<string, unknown> | null;
  },
) {
  const orderLines = orderLineSnapshots(ref);
  const shipments = ref.medusa_order_group_id
    ? await logistics.listByOrderGroup(ref.medusa_order_group_id)
    : [];
  const alreadyRequested = await returns.requestedQuantitiesForOrder(userId, orderId);
  return computeReturnEligibility({
    orderLines,
    shipments,
    alreadyRequested,
  });
}

function returnPolicySnapshot(lines: Array<{ line_key: string; delivered_qty: number; returnable_qty: number }>) {
  return {
    policy_version: RETURN_POLICY.version,
    window_days: RETURN_POLICY.windowDays,
    requires_delivery: RETURN_POLICY.requiresDelivery,
    resolution_options: [...RETURN_POLICY.resolutions],
    allowed_reasons: [...RETURN_POLICY.reasons],
    evaluated_at: new Date().toISOString(),
    line_inputs: lines,
    money_effect: "none",
    stock_effect: "none",
  };
}

async function authorizeShipmentOwner(req: Request, shipmentId: string) {
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  const shipment = await logistics.get(shipmentId);
  if (!shipment) {
    return { response: problem(404, "shipment-not-found", "Shipment not found.") };
  }
  const ref = await correlation.getByOrderGroup(shipment.orderGroupId);
  if (!ref || ref.owner_user_id !== authenticated.user.id) {
    return { response: problem(404, "shipment-not-found", "Shipment not found.") };
  }
  return { ...authenticated, shipment, ref };
}

async function requireErpOperator(req: Request): Promise<AuthenticationResult> {
  const service = serviceOperatorAuthentication(req);
  if (service && !("response" in service)) return service;
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  if (!hasAnyRole(authenticated.authorization, ["erp_operator", "super_admin"])) {
    return {
      response: problem(
        403,
        "erp-operator-required",
        "An ERP Operator role is required to post inventory.",
      ),
    };
  }
  return authenticated;
}

async function requireOperator(req: Request): Promise<AuthenticationResult> {
  const service = serviceOperatorAuthentication(req);
  if (service && !("response" in service)) return service;
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  if (!hasAnyRole(authenticated.authorization, ["marketplace_operator", "support_operator", "super_admin"])) {
    return { response: problem(403, "operator-required", "An operator role is required.") };
  }
  return authenticated;
}

/**
 * Seller identity for the vendor portal proxy. The trusted Mercur backend supplies the seller id
 * after authenticating the vendor session; the shared service secret prevents public spoofing.
 */
function serviceSellerAuthentication(req: Request): AuthenticationResult | null {
  const expected = config.adminServiceSecret;
  if (!expected) return null;
  const supplied = req.headers.get("x-buildkart-admin-service-secret") ?? "";
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return null;
  }
  const sellerId = req.headers.get("x-buildkart-seller-id")?.trim();
  if (!sellerId) return null;
  const authorization: PilotAuthorization = {
    userId: req.headers.get("x-operator-user-id")?.trim() || `seller:${sellerId}`,
    roles: ["seller_admin", "seller_order_manager"],
    sellerId,
  };
  return {
    user: {
      id: authorization.userId,
      email: "seller-portal@buildkart.invalid",
      name: "Seller portal",
    },
    token: "seller-portal-service",
    authorization,
  };
}

async function requireSeller(req: Request): Promise<AuthenticationResult> {
  const service = serviceSellerAuthentication(req);
  if (service && !("response" in service)) return service;
  const authenticated = await authenticate(req);
  if ("response" in authenticated) return authenticated;
  if (
    !hasAnyRole(authenticated.authorization, ["seller_admin", "seller_order_manager"]) ||
    !authenticated.authorization.sellerId
  ) {
    return {
      response: problem(403, "seller-required", "A seller role with a seller scope is required."),
    };
  }
  return authenticated;
}

function sellerIdOf(authentication: Exclude<AuthenticationResult, { response: Response }>): string | null {
  return authentication.authorization.sellerId ?? null;
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

/**
 * Stable cart view for the storefront.
 *
 * Medusa exposes the arithmetic but nests line adjustments under each item. The UI needs one
 * predictable shape: applied codes, a discount total and a flat adjustment list, so it can show
 * "you save X" without recomputing money from item internals.
 */
function composeCartView(cart: StoreCart) {
  const itemSubtotal = itemSubtotalMinor(cart);
  const items = (cart.items ?? []).map((item) => ({
    ...item,
    // Medusa amounts are scaled into the API's minor-unit contract here; clients keep dividing by 100.
    unit_price: medusaToMinorOr(item.unit_price),
    subtotal: medusaToMinorOr(item.subtotal),
    total: medusaToMinorOr(item.total),
    adjustments: (item.adjustments ?? []).map((adjustment) => ({
      code: adjustment.code ?? null,
      amount: Math.abs(medusaToMinorOr(adjustment.amount)),
      label: adjustment.description ?? adjustment.code ?? "Discount",
    })),
  }));
  return {
    ...cart,
    items,
    total: medusaToMinorOr(cart.total),
    shipping_total: medusaToMinorOr(cart.shipping_total),
    // Stable storefront semantics: "subtotal" is products only. Preserve the
    // engine's shipping-inclusive subtotal separately for audit/debugging.
    subtotal: itemSubtotal,
    item_subtotal: itemSubtotal,
    engine_subtotal: medusaToMinorOr(cart.subtotal),
    promotions: (cart.promotions ?? []).map((promotion) => ({
      code: promotion.code,
      is_automatic: Boolean(promotion.is_automatic),
    })),
    discount_total: medusaToMinorOr(cart.discount_total),
    item_discount_total: medusaToMinorOr(cart.item_discount_total),
    shipping_discount_total: medusaToMinorOr(cart.shipping_discount_total),
    adjustments: items.flatMap((item) =>
      item.adjustments.map((adjustment) => ({
        ...adjustment,
        target: "item" as const,
        line_item_id: item.id,
      })),
    ),
  };
}

/** Maps an engine rejection onto a reason the customer UI can explain. */
function promotionRejectionReason(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not found") || m.includes("does not exist") || m.includes("invalid")) {
    return "not_found";
  }
  if (m.includes("expired") || m.includes("not started") || m.includes("has not started")) {
    return "expired";
  }
  if (m.includes("limit") || m.includes("usage")) return "usage_limit";
  return "not_eligible";
}

/**
 * Stable, non-enumerable customer-facing order reference.
 *
 * Medusa/Mercur merchant numbers (#G110/#127) are only served on the admin API, which the Experience
 * API cannot read without an operator session. Until the backend returns `display_id` on completion,
 * the customer reference is derived deterministically from the order group so it survives retries and
 * is safe to quote to support alongside the internal group id.
 */
function customerOrderReference(
  orderGroupId: string,
  createdAt?: string | null,
): string {
  const day = (createdAt ?? new Date().toISOString()).slice(2, 10).replace(/-/g, "");
  const digest = createHash("sha256").update(orderGroupId).digest();
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[digest[i] % 32];
  return `BK-${day}-${suffix}`;
}

/**
 * Buyer-visible money and reference for a correlated order.
 *
 * Amounts are stored at completion in the API's minor-unit convention. Legacy rows written before
 * that (older than this change) carry only the group total, so the summary degrades to a total and
 * null line components rather than inventing subtotal or shipping values.
 */
function orderMoneySummary(ref: {
  medusa_order_group?: Record<string, unknown> | null;
}): {
  order_number: string | null;
  subtotal_minor: number | null;
  shipping_minor: number | null;
  discount_minor: number | null;
  total_minor: number | null;
  currency_code: string;
} {
  const group = ref.medusa_order_group ?? null;
  const amounts =
    group && typeof group.amounts === "object" && group.amounts !== null
      ? (group.amounts as Record<string, unknown>)
      : null;
  const minor = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const groupId = group ? String(group.id ?? "") : "";
  const createdAt = group ? String(group.created_at ?? "") : "";
  const stored = group ? String(group.customer_reference ?? "") : "";
  return {
    order_number:
      stored || (groupId ? customerOrderReference(groupId, createdAt || null) : null),
    subtotal_minor: minor(amounts?.subtotal),
    shipping_minor: minor(amounts?.shipping),
    discount_minor: minor(amounts?.discount),
    total_minor: minor(amounts?.total) ?? minor(group?.total),
    currency_code: String(group?.currency_code ?? "inr").toUpperCase(),
  };
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

  // Private-network-only Strapi publish/unpublish receiver. Authentication is the timestamped
  // HMAC signature; nginx blocks /v1/internal at both public hostnames.
  if (url.pathname === "/v1/internal/cms/webhooks" && req.method === "POST") {
    if (!config.cmsWebhookSecret) return problem(404, "not-found");
    const rawBody = await req.text();
    if (rawBody.length > 65536) return problem(413, "payload-too-large");
    const verified = verifyCmsWebhook(
      rawBody,
      req.headers,
      config.cmsWebhookSecret,
      new Date(),
      config.cmsWebhookToleranceSeconds,
    );
    if (!verified.ok) return problem(verified.status, verified.reason);
    try {
      const payload = verified.payload;
      const recorded = await cmsContentStore.recordWebhook({
        eventId: payload.event_id,
        eventVersion: payload.version,
        action: payload.event === "entry.publish" ? "publish" : "unpublish",
        uid: payload.uid,
        documentId: payload.document_id,
        occurredAt: payload.occurred_at,
      });
      if (recorded.applied) cmsContent.invalidate(payload.uid, payload.document_id);
      return json({
        accepted: true,
        duplicate: recorded.duplicate,
        applied: recorded.applied,
        event_id: payload.event_id,
        correlation_id: cid,
        test_data: true,
      }, recorded.duplicate ? 200 : 202);
    } catch (error) {
      console.warn("[experience-api] CMS webhook persistence failed:", (error as Error).message);
      return problem(503, "cms-webhook-store-unavailable");
    }
  }

  // Private-network-only draft preview projection. Server-to-server only: Medusa authenticates with
  // a dedicated bearer secret. nginx blocks /v1/internal at both public hostnames, and no CMS or
  // Experience API credential is ever returned to a browser.
  if (url.pathname === "/v1/internal/content/preview" && req.method === "POST") {
    if (!config.experienceOperatorSecret) return problem(404, "not-found");
    const authorization = req.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(config.experienceOperatorSecret);
    const authorized = suppliedBuffer.length === expectedBuffer.length
      && timingSafeEqual(suppliedBuffer, expectedBuffer);
    if (!authorized) return problem(401, "unauthorized");

    const rawBody = await req.text();
    if (rawBody.length > 65536) return problem(413, "payload-too-large");
    let parsed: { kind?: unknown; locale?: unknown; data?: unknown };
    try {
      parsed = JSON.parse(rawBody) as typeof parsed;
    } catch {
      return problem(400, "invalid-json");
    }
    if (parsed.kind !== "banner") return problem(400, "unsupported-content-kind");
    const locale = parsed.locale === "hi-IN" ? "hi-IN" : "en-IN";
    const now = new Date();
    const preview = buildBannerPreview(parsed.data, now);
    return json({
      kind: "banner",
      locale,
      presentation: preview.presentation ?? null,
      eligibility: preview.eligibility,
      complete: Boolean(preview.presentation),
      illustrative: true,
      generated_at: now.toISOString(),
      correlation_id: cid,
      test_data: true,
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
      cms_adapter: cmsContent.enabled ? "configured" : "governed-seed-fallback",
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
      ["cms_content", cmsContentStore.poolStats()],
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

  // Customer shipment timeline for one order.
  const orderShipments = url.pathname.match(/^\/v1\/orders\/([^/]+)\/shipments$/);
  if (orderShipments && req.method === "GET") {
    const orderId = orderShipments[1];
    const authenticated = await authorizeCheckoutOwner(req, orderId);
    if ("response" in authenticated) return authenticated.response;
    const ref = await correlation.get(orderId);
    if (!ref) return problem(404, "order-not-found", "No correlated order for this reference.");
    const shipments = ref.medusa_order_group_id
      ? await shipmentsWithEvents(ref.medusa_order_group_id)
      : [];
    return json({
      order_id: orderId,
      shipments,
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  // Owner-scoped shipment detail and timeline.
  const shipmentMatch = url.pathname.match(/^\/v1\/shipments\/([^/]+)$/);
  if (shipmentMatch && req.method === "GET") {
    const authorized = await authorizeShipmentOwner(req, shipmentMatch[1]);
    if ("response" in authorized) return authorized.response;
    return json({
      shipment: authorized.shipment,
      events: await logistics.listEvents(authorized.shipment.id),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  // Seller-scoped shipment queue. Sellers only see and update their own shipments.
  if (url.pathname === "/v1/seller/shipments" && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const all = await logistics.list(500);
    return json({
      items: all
        .filter((shipment) => shipment.sellerId === sellerId)
        .map(sellerShipmentView),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      seller_id: sellerId,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/seller/shipment-exceptions" && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const all = await logistics.listExceptions(500);
    return json({
      items: all
        .filter((shipment) => shipment.sellerId === sellerId)
        .map(sellerShipmentView),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      seller_id: sellerId,
      correlation_id: cid,
    });
  }

  const sellerShipment = url.pathname.match(/^\/v1\/seller\/shipments\/([^/]+)$/);
  if (sellerShipment && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const shipment = await logistics.get(sellerShipment[1]);
    if (!shipment || shipment.sellerId !== seller.authorization.sellerId) {
      return problem(404, "shipment-not-found");
    }
    return json({
      shipment: sellerShipmentView(shipment),
      events: await logistics.listEvents(shipment.id),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      seller_id: seller.authorization.sellerId,
      correlation_id: cid,
    });
  }

  const sellerShipmentStatus = url.pathname.match(
    /^\/v1\/seller\/shipments\/([^/]+)\/status$/,
  );
  if (sellerShipmentStatus && req.method === "POST") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const shipment = await logistics.get(sellerShipmentStatus[1]);
    if (!shipment || shipment.sellerId !== seller.authorization.sellerId) {
      return problem(404, "shipment-not-found");
    }
    let body: ManualShipmentStatusBody;
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const validation = validateManualShipmentBody(body, false);
    if (validation instanceof Response) return validation;
    if (!SELLER_SHIPMENT_TRANSITIONS.has(validation.status)) {
      return problem(
        403,
        "seller-action-not-permitted",
        "This status change is reserved for an Admin operator.",
      );
    }
    const deliveredLines = (body.delivered_lines ?? []).map((line) => ({
      lineKey: String(line.line_key ?? ""),
      deliveredQty: Number(line.delivered_qty ?? 0),
    }));
    const auditId = await privilegedAudit.start({
      actorUserId: seller.user.id,
      actorRoles: seller.authorization.roles,
      sellerId: seller.authorization.sellerId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const idempotencyKey = body.operation_key?.trim() ||
        req.headers.get("idempotency-key")?.trim() ||
        `seller:${randomUUID()}`;
      const result = await shipmentStore.transitionManual({
        shipmentId: shipment.id,
        expectedVersion: Number(body.expected_version),
        idempotencyKey,
        status: validation.status,
        occurredAt: body.occurred_at ?? new Date().toISOString(),
        actorId: seller.user.id,
        actorRole: "seller",
        source: "seller_portal",
        reason: body.reason?.trim() ?? null,
        note: body.note?.trim() ?? null,
        attemptNumber: body.attempt_number ?? null,
        attemptReason: body.attempt_reason?.trim() ?? null,
        nextAction: body.next_action?.trim() ?? null,
        revisedDeliveryAt: body.revised_delivery_at ?? null,
        notifyCustomer: body.notify_customer ?? false,
        deliveredLines,
        proofRef: body.proof_ref?.trim() ?? null,
      });
      if (!result.duplicate) {
        await events.append({
          event_type: "shipment.status_changed",
          aggregate_type: "order_group",
          aggregate_id: shipment.orderGroupId,
          correlation_id: cid,
          payload: {
            shipment_id: shipment.id,
            status: result.event.status,
            previous_status: shipment.status,
            version: result.shipment.version,
            seller_id: seller.authorization.sellerId,
            source: "seller_portal",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        shipment: sellerShipmentView(result.shipment),
        event: result.event,
        duplicate: result.duplicate,
        status_changed: result.statusChanged,
        environment: config.environment,
        test_data: true,
        seller_id: seller.authorization.sellerId,
        correlation_id: cid,
      }, result.duplicate ? 200 : 201);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "shipment-not-found"
        ? 404
        : code === "shipment-version-conflict" ||
            code === "invalid-shipment-transition"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "shipment-transition-failed", (error as Error).message);
    }
  }

  if (url.pathname === "/v1/seller/returns" && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    return json({
      items: await sellerScopedReturns(sellerId, 200),
      environment: config.environment,
      test_data: true,
      seller_id: sellerId,
      correlation_id: cid,
    });
  }

  const sellerReturn = url.pathname.match(/^\/v1\/seller\/returns\/([^/]+)$/);
  if (sellerReturn && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const record = (await sellerScopedReturns(sellerId, 500))
      .find((candidate) => candidate.id === sellerReturn[1]);
    if (!record) return problem(404, "return-not-found");
    return json({
      return: record,
      environment: config.environment,
      test_data: true,
      seller_id: sellerId,
      correlation_id: cid,
    });
  }

  const sellerOrderGroupLifecycle = url.pathname.match(
    /^\/v1\/seller\/order-groups\/([^/]+)\/delivery-returns$/,
  );
  if (sellerOrderGroupLifecycle && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const orderGroupId = decodeURIComponent(sellerOrderGroupLifecycle[1]);
    const ref = await correlation.getByOrderGroup(orderGroupId);
    if (!ref) return problem(404, "order-group-correlation-not-found");
    const sellerShipments = (await logistics.listByOrderGroup(orderGroupId)).filter(
      (shipment) => shipment.sellerId === sellerId,
    );
    if (sellerShipments.length === 0) {
      return problem(404, "order-group-not-found");
    }
    const scopedReturns = (await sellerScopedReturns(sellerId, 500)).filter(
      (record) =>
        record.orderGroupId === orderGroupId || record.orderId === ref.checkout_ref,
    );
    const shipments = await Promise.all(
      sellerShipments.map(async (shipment) => ({
        ...sellerShipmentView(shipment),
        events: await logistics.listEvents(shipment.id),
      })),
    );
    const latestUpdates = [
      ...shipments.map((shipment) => shipment.updatedAt),
      ...scopedReturns.map((record) => record.decidedAt ?? record.requestedAt),
    ].sort();
    return json({
      order_group_id: orderGroupId,
      order_id: ref.checkout_ref,
      owner_user_id: null,
      seller_id: sellerId,
      shipments,
      returns: scopedReturns,
      latest_update: latestUpdates.at(-1) ?? ref.updated_at,
      effects: {
        refund: "none",
        payment: "none",
        inventory: "none",
        accounting: "none",
      },
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  const sellerReturnStatus = url.pathname.match(
    /^\/v1\/seller\/returns\/([^/]+)\/status$/,
  );
  if (sellerReturnStatus && req.method === "POST") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const scoped = (await sellerScopedReturns(sellerId, 500)).find(
      (candidate) => candidate.id === sellerReturnStatus[1],
    );
    if (!scoped) return problem(404, "return-not-found");
    let body: {
      status?: string;
      expected_version?: number;
      operation_key?: string;
      note?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (
      !body.status ||
      !scoped.allowedTransitions.includes(body.status as ReturnStatus)
    ) {
      return problem(
        409,
        "invalid-return-transition",
        `Allowed transitions are ${scoped.allowedTransitions.join(", ") || "none"}.`,
      );
    }
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
      return problem(
        400,
        "expected-version-required",
        "expected_version must be a positive integer.",
      );
    }
    if (!body.note?.trim()) {
      return problem(400, "reason-required", "A reason is required for a return update.");
    }
    const auditId = await privilegedAudit.start({
      actorUserId: seller.user.id,
      actorRoles: seller.authorization.roles,
      sellerId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const idempotencyKey = body.operation_key?.trim() ||
        req.headers.get("idempotency-key")?.trim() ||
        `seller-return:${randomUUID()}`;
      const transition = await returns.updateStatus({
        id: scoped.id,
        status: body.status as ReturnStatus,
        expectedVersion: Number(body.expected_version),
        idempotencyKey,
        actorId: seller.user.id,
        actorRole: "seller",
        note: body.note.trim(),
      });
      const updated = transition.returnCase;
      if (!transition.duplicate) {
        await events.append({
          event_type: "return.status_changed",
          aggregate_type: "return",
          aggregate_id: updated.id,
          correlation_id: cid,
          payload: {
            return_id: updated.id,
            order_id: updated.orderId,
            order_group_id: updated.orderGroupId,
            status: updated.status,
            version: updated.version,
            seller_id: sellerId,
            source: "seller_portal",
            money_effect: "none",
            stock_effect: "none",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        return: updated,
        environment: config.environment,
        test_data: true,
        duplicate: transition.duplicate,
        seller_id: sellerId,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "return-not-found"
        ? 404
        : code === "return-version-conflict" || code === "invalid-return-transition"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "return-transition-failed", (error as Error).message);
    }
  }

  // Combined order-level delivery and return status for the admin console.
  if (url.pathname === "/v1/admin/order-statuses" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const correlations = await correlation.list(200);
    const allReturns = await returns.listAll(500);
    const items = await Promise.all(
      correlations.map(async (ref) => {
        const shipments = ref.medusa_order_group_id
          ? await logistics.listByOrderGroup(ref.medusa_order_group_id)
          : [];
        const orderReturns = allReturns.filter(
          (record) => record.orderId === ref.checkout_ref,
        );
        return {
          order_id: ref.checkout_ref,
          medusa_order_group_id: ref.medusa_order_group_id,
          owner_user_id: ref.owner_user_id,
          created_at: ref.created_at,
          shipment_statuses: [...new Set(shipments.map((shipment) => shipment.status))],
          shipment_count: shipments.length,
          latest_shipment_update: shipments
            .map((shipment) => shipment.updatedAt)
            .sort()
            .at(-1) ?? null,
          return_statuses: [...new Set(orderReturns.map((record) => record.status))],
          return_count: orderReturns.length,
          latest_return_update: orderReturns
            .map((record) => record.decidedAt ?? record.requestedAt)
            .sort()
            .at(-1) ?? null,
        };
      }),
    );
    return json({
      items,
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  // Native Mercur order-detail widgets resolve the seller order to an order group first, then
  // request the complete delivery/return projection here. The dashboard remains a read-through
  // surface; shipment and return ownership stays in the Experience API stores.
  const adminOrderGroupLifecycle = url.pathname.match(
    /^\/v1\/admin\/order-groups\/([^/]+)\/delivery-returns$/,
  );
  if (adminOrderGroupLifecycle && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const orderGroupId = decodeURIComponent(adminOrderGroupLifecycle[1]);
    const ref = await correlation.getByOrderGroup(orderGroupId);
    if (!ref) return problem(404, "order-group-correlation-not-found");
    const groupShipments = await logistics.listByOrderGroup(orderGroupId);
    const groupReturns = (await returns.listAll(500)).filter(
      (record) =>
        record.orderGroupId === orderGroupId || record.orderId === ref.checkout_ref,
    );
    const shipments = await Promise.all(
      groupShipments.map(async (shipment) => ({
        ...shipment,
        events: await logistics.listEvents(shipment.id),
      })),
    );
    const latestUpdates = [
      ...shipments.map((shipment) => shipment.updatedAt),
      ...groupReturns.map((record) => record.decidedAt ?? record.requestedAt),
    ].sort();
    return json({
      order_group_id: orderGroupId,
      order_id: ref.checkout_ref,
      owner_user_id: ref.owner_user_id,
      shipments,
      returns: groupReturns,
      latest_update: latestUpdates.at(-1) ?? ref.updated_at,
      effects: {
        refund: "none",
        payment: "none",
        inventory: "none",
        accounting: "none",
      },
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  // Operator shipment queue.
  if (url.pathname === "/v1/admin/shipments" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({
      items: await logistics.list(Number.isFinite(limit) ? limit : 100),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  const adminShipment = url.pathname.match(/^\/v1\/admin\/shipments\/([^/]+)$/);
  if (adminShipment && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const shipment = await logistics.get(adminShipment[1]);
    if (!shipment) return problem(404, "shipment-not-found");
    return json({
      shipment,
      events: await logistics.listEvents(shipment.id),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const adminShipmentStatus = url.pathname.match(
    /^\/v1\/admin\/shipments\/([^/]+)\/status$/,
  );
  if (adminShipmentStatus && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: ManualShipmentStatusBody;
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const validation = validateManualShipmentBody(body, true);
    if (validation instanceof Response) return validation;
    const shipment = await logistics.get(adminShipmentStatus[1]);
    if (!shipment) return problem(404, "shipment-not-found");
    const deliveredLines = (body.delivered_lines ?? []).map((line) => ({
      lineKey: String(line.line_key ?? ""),
      deliveredQty: Number(line.delivered_qty ?? 0),
    }));
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      sellerId: shipment.sellerId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const idempotencyKey = body.operation_key?.trim() ||
        req.headers.get("idempotency-key")?.trim() ||
        `admin:${randomUUID()}`;
      const result = await shipmentStore.transitionManual({
        shipmentId: shipment.id,
        expectedVersion: Number(body.expected_version),
        idempotencyKey,
        status: validation.status,
        occurredAt: body.occurred_at ?? new Date().toISOString(),
        actorId: operator.user.id,
        actorRole: operator.authorization.roles.includes("super_admin")
          ? "super_admin"
          : "marketplace_operator",
        source: "admin_console",
        reason: body.reason?.trim() ?? null,
        note: body.note?.trim() ?? null,
        attemptNumber: body.attempt_number ?? null,
        attemptReason: body.attempt_reason?.trim() ?? null,
        nextAction: body.next_action?.trim() ?? null,
        revisedDeliveryAt: body.revised_delivery_at ?? null,
        notifyCustomer: body.notify_customer ?? false,
        deliveredLines,
        proofRef: body.proof_ref?.trim() ?? null,
      });
      if (!result.duplicate) {
        await events.append({
          event_type: "shipment.status_changed",
          aggregate_type: "order_group",
          aggregate_id: shipment.orderGroupId,
          correlation_id: cid,
          payload: {
            shipment_id: shipment.id,
            status: result.event.status,
            previous_status: shipment.status,
            version: result.shipment.version,
            seller_id: shipment.sellerId,
            acting_for_seller_id: shipment.sellerId,
            reason: body.reason?.trim(),
            source: "admin_console",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        shipment: result.shipment,
        event: result.event,
        duplicate: result.duplicate,
        status_changed: result.statusChanged,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, result.duplicate ? 200 : 201);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "shipment-not-found"
        ? 404
        : code === "shipment-version-conflict" ||
            code === "invalid-shipment-transition"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "shipment-transition-failed", (error as Error).message);
    }
  }

  const deliveryEvidence = url.pathname.match(
    /^\/v1\/admin\/shipments\/([^/]+)\/delivery-evidence$/,
  );
  if (deliveryEvidence && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      proof_ref?: string;
      delivered_at?: string;
      delivered_lines?: Array<{ line_key?: string; delivered_qty?: number }>;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.proof_ref?.trim()) {
      return problem(400, "proof-ref-required", "A proof reference is required.");
    }
    const shipment = await logistics.get(deliveryEvidence[1]);
    if (!shipment) return problem(404, "shipment-not-found");
    const deliveredLines = (body.delivered_lines ?? []).map((line) => ({
      lineKey: String(line.line_key ?? ""),
      deliveredQty: Number(line.delivered_qty ?? 0),
    }));
    if (
      deliveredLines.length === 0 ||
      deliveredLines.some((line) => !line.lineKey || line.deliveredQty <= 0)
    ) {
      return problem(
        400,
        "delivery-lines-required",
        "At least one positive delivered quantity is required.",
      );
    }
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      sellerId: shipment.sellerId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const result = await logistics.deliver({
        shipmentId: shipment.id,
        proofRef: body.proof_ref.trim(),
        deliveredAt: body.delivered_at,
        deliveredLines,
      });
      const updated = await logistics.get(shipment.id);
      if (!result.duplicate) {
        await events.append({
          event_type: "shipment.status_changed",
          aggregate_type: "order_group",
          aggregate_id: shipment.orderGroupId,
          correlation_id: cid,
          payload: {
            shipment_id: shipment.id,
            status: result.event.status,
            previous_status: shipment.status,
            seller_id: shipment.sellerId,
            acting_for_seller_id: shipment.sellerId,
            proof_ref: body.proof_ref.trim(),
            source: "admin_console",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        shipment: updated,
        event: result.event,
        duplicate: result.duplicate,
        status_changed: result.statusChanged,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "delivery-evidence-required" ||
          code === "invalid-delivered-lines"
        ? 400
        : 500;
      await privilegedAudit.complete(auditId, status);
      if (status === 400) {
        return problem(400, code as string, (error as Error).message);
      }
      throw error;
    }
  }

  const simulateShipment = url.pathname.match(/^\/v1\/admin\/shipments\/([^/]+)\/simulate-event$/);
  if (simulateShipment && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      scenario?: string;
      proof_ref?: string;
      delivered_lines?: Array<{ line_key?: string; delivered_qty?: number }>;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const scenarios = ["failed_attempt", "delay", "damaged", "lost", "rto", "duplicate", "out_of_order"] as const;
    if (!body.scenario || !scenarios.includes(body.scenario as (typeof scenarios)[number])) {
      return problem(400, "invalid-scenario", `Scenario must be one of ${scenarios.join(", ")}.`);
    }
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const shipment = await logistics.get(simulateShipment[1]);
      if (!shipment) {
        await privilegedAudit.complete(auditId, 404);
        return problem(404, "shipment-not-found");
      }
      const result = await logistics.simulate({
        shipmentId: shipment.id,
        scenario: body.scenario as (typeof scenarios)[number],
        proofRef: body.proof_ref,
        deliveredLines: (body.delivered_lines ?? []).map((line) => ({
          lineKey: String(line.line_key ?? ""),
          deliveredQty: Number(line.delivered_qty ?? 0),
        })),
      });
      await events.append({
        event_type: "shipment.status_changed",
        aggregate_type: "order_group",
        aggregate_id: shipment.orderGroupId,
        correlation_id: cid,
        payload: {
          shipment_id: shipment.id,
          status: result.event.status,
          simulated: true,
          scenario: body.scenario,
        },
      });
      await privilegedAudit.complete(auditId, 200);
      return json({
        shipment: await logistics.get(shipment.id),
        event: result.event,
        duplicate: result.duplicate,
        status_changed: result.statusChanged,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      await privilegedAudit.complete(auditId, 500);
      throw error;
    }
  }

  const reconcileShipment = url.pathname.match(/^\/v1\/admin\/shipments\/([^/]+)\/reconcile$/);
  if (reconcileShipment && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    const result = await logistics.reconcile(reconcileShipment[1]);
    if (!result) {
      await privilegedAudit.complete(auditId, 404);
      return problem(404, "shipment-not-found");
    }
    await privilegedAudit.complete(auditId, 200);
    return json({
      reconciliation: result,
      shipment: await logistics.get(reconcileShipment[1]),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/admin/shipment-exceptions" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({
      items: await logistics.listExceptions(Number.isFinite(limit) ? limit : 100),
      environment: config.environment,
      test_data: true,
      logistics_mode: "simulated",
      correlation_id: cid,
    });
  }

  const logisticsWebhook = url.pathname.match(/^\/v1\/integrations\/logistics\/webhooks\/([^/]+)$/);
  if (logisticsWebhook && req.method === "POST") {
    if (!config.logisticsWebhookSecret) {
      return problem(503, "webhook-not-configured", "Logistics webhook is not configured.");
    }
    const supplied = req.headers.get("x-logistics-webhook-secret") ?? "";
    const expected = config.logisticsWebhookSecret;
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return problem(401, "invalid-webhook-secret", "Invalid logistics webhook secret.");
    }
    let body: {
      shipment_id?: string;
      provider_event_id?: string;
      event_type?: string;
      status?: string;
      occurred_at?: string;
      payload?: Record<string, unknown>;
      delivered_lines?: Array<{ line_key?: string; delivered_qty?: number }>;
      proof_ref?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.shipment_id || !body.provider_event_id || !body.status) {
      return problem(400, "missing-fields", "shipment_id, provider_event_id and status are required.");
    }
    const shipment = await logistics.get(body.shipment_id);
    if (!shipment) return problem(404, "shipment-not-found");
    const status = body.status as import("./logistics/shipment-store.js").ShipmentStatus;
    if (!["booked", "picked_up", "in_transit", "delivery_failed", "out_for_delivery", "damaged", "lost", "delivered", "rto_in_transit", "rto_delivered", "cancelled"].includes(status)) {
      return problem(400, "invalid-shipment-status");
    }
    if (status === "delivered") {
      const deliveredLines = (body.delivered_lines ?? []).map((line) => ({
        lineKey: String(line.line_key ?? ""),
        deliveredQty: Number(line.delivered_qty ?? 0),
      }));
      if (
        !body.proof_ref?.trim() ||
        deliveredLines.length === 0 ||
        deliveredLines.some(
          (line) => !line.lineKey || !Number.isInteger(line.deliveredQty) || line.deliveredQty <= 0,
        )
      ) {
        return problem(
          400,
          "delivery-evidence-required",
          "Delivered status requires a proof reference and positive per-line delivered quantities.",
        );
      }
    }
    const result = await logistics.appendEvent({
      shipmentId: shipment.id,
      providerEventId: body.provider_event_id,
      eventType: body.event_type ?? "shipment.status_changed",
      status,
      occurredAt: body.occurred_at ?? new Date().toISOString(),
      payload: body.payload ?? {},
      proofRef: body.proof_ref,
      deliveredLines: (body.delivered_lines ?? []).map((line) => ({
        lineKey: String(line.line_key ?? ""),
        deliveredQty: Number(line.delivered_qty ?? 0),
      })),
    });
    if (!result.duplicate && result.statusChanged) {
      await events.append({
        event_type: "shipment.status_changed",
        aggregate_type: "order_group",
        aggregate_id: shipment.orderGroupId,
        correlation_id: cid,
        payload: { shipment_id: shipment.id, status: result.event.status, provider: logisticsWebhook[1] },
      });
    }
    return json({
      accepted: true,
      duplicate: result.duplicate,
      status_changed: result.statusChanged,
      event: result.event,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    }, result.duplicate ? 200 : 201);
  }

  // Customer creates a Phase 1 return request. Eligibility is server-computed.
  const createReturn = url.pathname.match(/^\/v1\/orders\/([^/]+)\/returns$/);
  if (createReturn && req.method === "POST") {
    const orderId = createReturn[1];
    const authenticated = await authorizeCheckoutOwner(req, orderId);
    if ("response" in authenticated) return authenticated.response;
    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return problem(400, "idempotency-key-required", "An Idempotency-Key header is required.");
    }
    let body: {
      resolution?: string;
      reason_code?: string;
      customer_comment?: string;
      lines?: Array<{ line_key?: string; requested_qty?: number; reason_code?: string }>;
      evidence?: Array<{
        line_key?: string;
        object_key?: string;
        content_type?: string;
        size_bytes?: number;
        sha256?: string;
      }>;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const resolution = body.resolution === "replacement" ? "replacement" : "refund";
    const requestedLines = (body.lines ?? []).filter(
      (line) => line.line_key && Number(line.requested_qty ?? 0) > 0,
    );
    if (requestedLines.length === 0) {
      return problem(400, "return-lines-required", "At least one return line is required.");
    }
    const ref = await correlation.get(orderId);
    if (!ref) return problem(404, "order-not-found", "No correlated order for this reference.");
    const eligibility = await orderEligibility(orderId, authenticated.user.id, ref);
    const eligibilityByLine = new Map(eligibility.map((line) => [line.line_key, line]));
    const lines = [];
    for (const requested of requestedLines) {
      const line = eligibilityByLine.get(String(requested.line_key));
      if (!line || !line.eligible) {
        return problem(409, "return-line-ineligible", "A requested line is not eligible for return.", {
          correlation_id: cid,
          line_key: requested.line_key,
          reason: line?.ineligible_reason ?? "line_not_found",
        });
      }
      const reason = requested.reason_code ?? body.reason_code ?? RETURN_POLICY.reasons[0];
      if (!RETURN_POLICY.reasons.includes(reason as (typeof RETURN_POLICY.reasons)[number])) {
        return problem(400, "invalid-return-reason", "The return reason is not allowed.");
      }
      const quantity = Number(requested.requested_qty);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > line.returnable_qty) {
        return problem(409, "return-quantity-invalid", "The requested quantity exceeds the returnable quantity.", {
          correlation_id: cid,
          line_key: requested.line_key,
          returnable_qty: line.returnable_qty,
        });
      }
      lines.push({
        lineKey: line.line_key,
        sku: line.sku,
        orderedQty: line.ordered_qty,
        deliveredQty: line.delivered_qty,
        requestedQty: quantity,
        reasonCode: reason,
      });
    }
    const evidence = (body.evidence ?? [])
      .filter((item) => item.object_key && item.content_type)
      .map((item) => ({
        lineKey: item.line_key ?? null,
        objectKey: String(item.object_key),
        contentType: String(item.content_type),
        sizeBytes: Number(item.size_bytes ?? 0),
        sha256: item.sha256 ?? null,
      }));
    try {
      const result = await returns.request({
        orderId,
        orderGroupId: ref.medusa_order_group_id ?? null,
        userId: authenticated.user.id,
        idempotencyKey,
        policyVersion: RETURN_POLICY.version,
        policySnapshot: returnPolicySnapshot(eligibility),
        resolution,
        reasonCode: body.reason_code ?? lines[0].reasonCode,
        customerComment: body.customer_comment ?? null,
        lines,
        evidence,
      });
      if (!result.replayed) {
        await events.append({
          event_type: "return.requested",
          aggregate_type: "return",
          aggregate_id: result.returnCase.id,
          correlation_id: cid,
          payload: {
            return_id: result.returnCase.id,
            order_id: orderId,
            checkout_ref: orderId,
            status: result.returnCase.status,
            resolution: result.returnCase.resolution,
            money_effect: "none",
            stock_effect: "none",
          },
        });
      }
      return json({
        return: result.returnCase,
        replayed: result.replayed,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, result.replayed ? 200 : 201);
    } catch (error) {
      if ((error as { code?: string }).code === "idempotency-key-reuse") {
        return problem(409, "idempotency-key-reuse", "This idempotency key was used with a different payload.");
      }
      throw error;
    }
  }

  if (url.pathname === "/v1/me/returns" && req.method === "GET") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    if (!hasAnyRole(authenticated.authorization, ["customer", "b2b_buyer", "b2b_account_admin"])) {
      return problem(403, "customer-role-required");
    }
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    return json({
      items: await returns.listForUser(authenticated.user.id, Number.isFinite(limit) ? limit : 50),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const customerReturn = url.pathname.match(/^\/v1\/returns\/([^/]+)$/);
  if (customerReturn && req.method === "GET") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const record = await returns.getForUser(customerReturn[1], authenticated.user.id);
    if (!record) return problem(404, "return-not-found");
    return json({
      return: record,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/admin/returns" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({
      items: await returns.listAll(Number.isFinite(limit) ? limit : 100),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const adminReturnDetail = url.pathname.match(/^\/v1\/admin\/returns\/([^/]+)$/);
  if (adminReturnDetail && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const record = await returns.get(adminReturnDetail[1]);
    if (!record) return problem(404, "return-not-found");
    return json({
      return: record,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const adminReturn = url.pathname.match(/^\/v1\/admin\/returns\/([^/]+)\/(approve|reject)$/);
  if (adminReturn && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      comment?: string;
      expected_version?: number;
      approved_lines?: Array<{ line_key?: string; approved_qty?: number }>;
    } = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body when supplied.");
    }
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const record = await returns.decide({
        id: adminReturn[1],
        decision: adminReturn[2] === "approve" ? "approved" : "rejected",
        actorId: operator.user.id,
        actorRole: operator.authorization.roles.includes("support_operator")
          ? "support_operator"
          : "marketplace_operator",
        expectedVersion: Number.isInteger(body.expected_version)
          ? Number(body.expected_version)
          : null,
        comment: body.comment ?? null,
        approvedLines: (body.approved_lines ?? []).map((line) => ({
          lineKey: String(line.line_key ?? ""),
          approvedQty: Number(line.approved_qty ?? 0),
        })),
      });
      await privilegedAudit.complete(auditId, 200);
      await events.append({
        event_type: "return.decision",
        aggregate_type: "return",
        aggregate_id: record.id,
        correlation_id: cid,
        payload: {
          return_id: record.id,
          order_id: record.orderId,
          checkout_ref: record.orderId,
          status: record.status,
          resolution: record.resolution,
          money_effect: "none",
          stock_effect: "none",
        },
      });
      return json({
        return: record,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      await privilegedAudit.complete(auditId, code === "return-not-found" ? 404 : 409);
      if (code === "return-not-found") return problem(404, "return-not-found");
      if (code === "return-not-decidable") return problem(409, "return-not-decidable");
      if (code === "return-version-conflict") {
        return problem(409, "return-version-conflict", (error as Error).message);
      }
      throw error;
    }
  }

  const adminReturnStatus = url.pathname.match(
    /^\/v1\/admin\/returns\/([^/]+)\/status$/,
  );
  if (adminReturnStatus && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      status?: string;
      expected_version?: number;
      operation_key?: string;
      note?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const current = await returns.get(adminReturnStatus[1]);
    if (!current) return problem(404, "return-not-found");
    if (
      !body.status ||
      !current.allowedTransitions.includes(body.status as ReturnStatus) ||
      ["approved", "rejected"].includes(body.status)
    ) {
      return problem(
        409,
        "invalid-return-transition",
        `Allowed operational transitions are ${
          current.allowedTransitions
            .filter((status) => !["approved", "rejected"].includes(status))
            .join(", ") || "none"
        }.`,
      );
    }
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
      return problem(
        400,
        "expected-version-required",
        "expected_version must be a positive integer.",
      );
    }
    if (!body.note?.trim()) {
      return problem(400, "reason-required", "A reason is required for a return update.");
    }
    const sellerIds = current.orderGroupId
      ? [
          ...new Set(
            (await logistics.listByOrderGroup(current.orderGroupId))
              .filter((shipment) =>
                shipment.lines.some((line) =>
                  current.lines.some((returnLine) => returnLine.lineKey === line.lineKey)
                )
              )
              .map((shipment) => shipment.sellerId),
          ),
        ]
      : [];
    const auditId = await privilegedAudit.start({
      actorUserId: operator.user.id,
      actorRoles: operator.authorization.roles,
      businessAccountId: operator.authorization.businessAccountId,
      sellerId: sellerIds.length === 1 ? sellerIds[0] : undefined,
      method: "POST",
      path: url.pathname,
      correlationId: cid,
    });
    try {
      const idempotencyKey = body.operation_key?.trim() ||
        req.headers.get("idempotency-key")?.trim() ||
        `admin-return:${randomUUID()}`;
      const transition = await returns.updateStatus({
        id: adminReturnStatus[1],
        status: body.status as ReturnStatus,
        expectedVersion: Number(body.expected_version),
        idempotencyKey,
        actorId: operator.user.id,
        actorRole: operator.authorization.roles.includes("super_admin")
          ? "super_admin"
          : "marketplace_operator",
        note: body.note.trim(),
      });
      const record = transition.returnCase;
      if (!transition.duplicate) {
        await events.append({
          event_type: "return.status_changed",
          aggregate_type: "return",
          aggregate_id: record.id,
          correlation_id: cid,
          payload: {
            return_id: record.id,
            order_id: record.orderId,
            order_group_id: record.orderGroupId,
            status: record.status,
            version: record.version,
            seller_ids: sellerIds,
            acting_for_seller_ids: sellerIds,
            source: "admin_console",
            money_effect: "none",
            stock_effect: "none",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        return: record,
        environment: config.environment,
        test_data: true,
        duplicate: transition.duplicate,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "return-not-found"
        ? 404
        : code === "return-version-conflict" || code === "invalid-return-transition"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "return-transition-failed", (error as Error).message);
    }
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

  if ((url.pathname === "/v1/me/notifications" || url.pathname === "/v1/notifications") && req.method === "DELETE") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    const cleared = await notifications.clearAll(authenticated.user.id);
    return json({ cleared, test_data: true, correlation_id: cid });
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

    // CHG-032: the optional layout projection. Absence is not an error.
    const channelParam = url.searchParams.get("channel");
    const channel =
      channelParam === "b2c" || channelParam === "b2b" ? channelParam : null;
    const layoutResolution = channel ? await cmsContent.resolveLayout(channel, locale) : undefined;
    const layout = layoutResolution?.layout;
    const generatedAt = new Date().toISOString();
    const source = layoutResolution
      ? `${layoutResolution.source}+governed-editorial-seed`
      : "governed-editorial-seed";

    // Resolve section product references at read time. A collection that fails or is empty must not
    // fail the whole shell: the section renders with an explanation instead.
    let sections: unknown[] = layout?.sections ?? [];
    let emptyCollections: string[] = [];
    if (layout?.sections?.length) {
      try {
        const resolved = await resolveSectionProducts(layout.sections, medusa);
        sections = resolved.sections;
        emptyCollections = resolved.empty_collections;
      } catch (error) {
        console.warn(
          "[experience-api] section product resolution failed:",
          (error as Error).message,
        );
      }
    }

    return json({
      locale,
      ...(channel ? { channel } : {}),
      placement: placement ?? null,
      items,
      ...(layout
        ? {
            layout: {
              ...layout,
              // Always present so a consumer can rely on it being an array, empty when an operator has
              // not configured sections for this channel yet.
              sections,
              ...(emptyCollections.length ? { empty_collections: emptyCollections } : {}),
              generated_at: generatedAt,
              source: layoutResolution.source,
            },
          }
        : {}),
      generated_at: generatedAt,
      source,
      freshness: {
        source,
        observed_at: layoutResolution?.observedAt ?? generatedAt,
        stale: layoutResolution?.stale ?? false,
      },
    });
  }

  if (url.pathname === "/v1/content/presentation" && req.method === "GET") {
    const locale = (url.searchParams.get("locale") ?? "en-IN") as AppLocale;
    const channelParam = url.searchParams.get("channel");
    const channel: StorefrontChannel = channelParam === "b2b" ? "b2b" : "b2c";

    const bannerResolution = await cmsContent.resolveBanners(channel, locale);
    const banners = bannerResolution.items.length
      ? bannerResolution.items
      : resolveSeedBanners(channel, locale);
    const bannerSource = bannerResolution.items.length
      ? bannerResolution.source
      : "governed-editorial-seed";

    let categories: ComposedCategory[] = [];
    let categorySource = "unavailable";
    let categoryObservedAt = bannerResolution.observedAt;
    let categoryStale = bannerResolution.stale;
    try {
      const [editorialResolution, medusaCategories, categoryBanners] = await Promise.all([
        cmsContent.resolveCategoryEditorials(channel, locale),
        medusa.listProductCategories(),
        cmsContent.resolveCategoryBanners(channel, locale),
      ]);
      const roots = medusaCategories
        .filter(
          (category) =>
            !category.parent_category_id &&
            category.is_active !== false &&
            category.is_internal !== true,
        )
        .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
        .map((category) => ({
          id: category.id,
          name: category.name,
          handle: category.handle ?? null,
        }));
      categories = composeStorefrontCategories(
        roots,
        editorialResolution.items,
        categoryBanners.items,
      );
      categorySource = editorialResolution.source;
      categoryObservedAt = editorialResolution.observedAt;
      categoryStale = editorialResolution.stale;
    } catch (error) {
      console.warn("[experience-api] category presentation failed:", (error as Error).message);
      categorySource = "unavailable";
      categoryStale = true;
    }

    const generatedAt = new Date().toISOString();
    return json({
      locale,
      channel,
      banners,
      categories,
      generated_at: generatedAt,
      source: `${bannerSource}+category:${categorySource}`,
      freshness: {
        banners: {
          source: bannerSource,
          observed_at: bannerResolution.observedAt,
          stale: bannerResolution.stale,
        },
        categories: {
          source: categorySource,
          observed_at: categoryObservedAt,
          stale: categoryStale,
        },
      },
      test_data: true,
      correlation_id: correlationId(req),
    });
  }

  if (url.pathname === "/v1/content/curated-collections" && req.method === "GET") {
    const locale = (url.searchParams.get("locale") ?? "en-IN") as AppLocale;
    const channelParam = url.searchParams.get("channel");
    const channel: StorefrontChannel = channelParam === "b2b" ? "b2b" : "b2c";
    try {
      const resolution = await cmsContent.resolveCuratedCollections(channel, locale);
      return json({
        locale,
        channel,
        items: resolution.items,
        source: resolution.source,
        freshness: {
          source: resolution.source,
          observed_at: resolution.observedAt,
          stale: resolution.stale,
        },
        generated_at: new Date().toISOString(),
        test_data: true,
        correlation_id: correlationId(req),
      });
    } catch (error) {
      // An operator may not have authored these yet. The app keeps its governed
      // rule defaults, so this is an empty list, not a storefront failure.
      console.warn("[experience-api] curated collections failed:", (error as Error).message);
      return json({
        locale,
        channel,
        items: [],
        source: "unavailable",
        freshness: { source: "unavailable", observed_at: new Date().toISOString(), stale: true },
        generated_at: new Date().toISOString(),
        test_data: true,
        correlation_id: correlationId(req),
      });
    }
  }

  const cmsMediaMatch = url.pathname.match(/^\/v1\/content\/media\/(.+)$/);
  if (cmsMediaMatch && req.method === "GET") {
    try {
      return await cmsContent.readMedia(decodeURIComponent(cmsMediaMatch[1]));
    } catch {
      return problem(404, "media-not-found");
    }
  }

  // GET /v1/collections/{key} — resolve a dynamic collection
  const collectionMatch = url.pathname.match(/^\/v1\/collections\/([^/]+)$/);
  if (collectionMatch && req.method === "GET") {
    const key = collectionMatch[1];
    try {
      const result = await collections.resolve(key);
      return json({
        collection_key: result.collection.collection_key,
        // A commerce collection carries its display title; a registry key has none, and the app
        // humanises the key instead of inventing a name here.
        title: (result.collection.parameters.title as string | undefined) ?? null,
        // Present only for a commerce collection: the storefront uses it to fetch composed products
        // (best-price offer) for the same membership, rather than re-deriving it from raw items.
        collection_id: (result.collection.parameters.collection_id as string | undefined) ?? null,
        source: result.collection.source,
        status: result.collection.status,
        fallback: result.fallback,
        items: result.items,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      if (error instanceof CollectionNotFoundError) {
        return problem(
          404,
          error.reason === "empty" ? "collection-empty" : "collection-not-found",
          error.reason === "empty"
            ? "This collection has no products available right now."
            : "No collection exists at this address.",
        );
      }
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

  // GET /v1/carts/{cartId} — canonical cart with the promotion breakdown.
  const cartState = url.pathname.match(/^\/v1\/carts\/([^/]+)$/);
  if (cartState && req.method === "GET") {
    const cartId = cartState[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    try {
      const cart = await medusa.getCart(cartId);
      return json({
        ...composeCartView(cart),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST/DELETE /v1/carts/{cartId}/promotions — apply or remove promotion codes.
  //
  // The engine decides eligibility. The BFF only translates its answer into a stable shape, so the
  // storefront never has to invent a reason or claim a discount the engine did not grant.
  const cartPromotions = url.pathname.match(/^\/v1\/carts\/([^/]+)\/promotions$/);
  if (cartPromotions && (req.method === "POST" || req.method === "DELETE")) {
    const cartId = cartPromotions[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    let body: { code?: string; codes?: string[] } = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as { code?: string; codes?: string[] };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const codes = [
      ...new Set(
        [
          ...(Array.isArray(body.codes) ? body.codes : []),
          ...(typeof body.code === "string" ? [body.code] : []),
        ]
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ];
    if (!codes.length) {
      return problem(400, "invalid-promotion-code", "A promotion code is required.");
    }
    const applied: string[] = [];
    const rejected: { code: string; reason: string }[] = [];
    let cart: StoreCart | null = null;
    for (const code of codes) {
      try {
        cart = req.method === "POST"
          ? await medusa.addPromotion(cartId, code)
          : await medusa.removePromotion(cartId, code);
        if (req.method === "POST") {
          // Medusa can accept a code and still grant nothing (for example when no line matches the
          // promotion's target). Only a code present on the returned cart is a real application;
          // otherwise the UI would advertise a discount the engine never applied.
          const attached = (cart.promotions ?? []).some(
            (promotion) => promotion.code.toLowerCase() === code.toLowerCase(),
          );
          if (!attached) {
            rejected.push({ code, reason: "not_eligible" });
            continue;
          }
        }
        applied.push(code);
      } catch (error) {
        rejected.push({
          code,
          reason: promotionRejectionReason((error as Error).message),
        });
      }
    }
    if (!cart || applied.length === 0) {
      return json({
        type: "promotion-rejected",
        title: "promotion-rejected",
        status: 422,
        rejected_codes: rejected,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 422);
    }
    return json({
      ...composeCartView(cart),
      applied_codes: applied,
      rejected_codes: rejected,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
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
        // A Medusa country belongs to one operational region. The separate B2B region is a
        // read-side pricing context and has no countries, so it cannot accept an Indian address.
        // Canonical carts default to the India delivery region for both channels.
        body.region_id ?? config.medusaRegionId,
        body.currency_code ?? "inr",
        { customerEmail: authenticated.user.email },
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
        ...composeCartView({ ...cart, metadata }),
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
          ...(address.address_2?.trim()
            ? { address_2: address.address_2.trim() }
            : {}),
          city: address.city.trim(),
          ...(address.province?.trim()
            ? { province: address.province.trim() }
            : {}),
          postal_code: address.postal_code!,
          country_code: "in",
          ...(address.phone?.trim() ? { phone: address.phone.trim() } : {}),
        },
      });
      return json({
        ...composeCartView(cart),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
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
          tier: deliveryTierFor(option),
          description: option.type?.description ?? null,
          label: option.type?.label ?? null,
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

  // POST /v1/carts/{cartId}/delivery-tier - one cart-level Standard/Express choice.
  // Applies the matching option to every seller group atomically. If any seller
  // cannot serve the tier, the whole request is rejected rather than silently
  // mixing delivery speeds.
  const cartDeliveryTier = url.pathname.match(/^\/v1\/carts\/([^/]+)\/delivery-tier$/);
  if (cartDeliveryTier && req.method === "POST") {
    const cartId = cartDeliveryTier[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    let body: { tier?: string };
    try {
      body = (await req.json()) as { tier?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const tier = body.tier?.trim().toLowerCase();
    if (tier !== "standard" && tier !== "express") {
      return problem(400, "invalid-delivery-tier", "tier must be standard or express.");
    }
    try {
      const result = await correlation.withCheckoutLock(cartId, async () => {
        const options = await medusa.listShippingOptions(cartId);
        const bySeller = new Map<string, StoreShippingOption[]>();
        for (const option of options) {
          const list = bySeller.get(option.seller_id) ?? [];
          list.push(option);
          bySeller.set(option.seller_id, list);
        }
        if (bySeller.size === 0) {
          return { unavailable: [{ seller_id: null, reason: "no_sellers" }], cart: null };
        }
        const selected: Array<{ seller_id: string; option: StoreShippingOption }> = [];
        const unavailable: Array<{ seller_id: string; reason: string }> = [];
        for (const [sellerId, sellerOptions] of bySeller) {
          const matches = sellerOptions
            .filter((option) => deliveryTierFor(option) === tier)
            .sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id));
          if (matches.length > 0) selected.push({ seller_id: sellerId, option: matches[0] });
          else unavailable.push({ seller_id: sellerId, reason: "no_tier_option" });
        }
        if (unavailable.length > 0) return { unavailable, cart: null };

        let cart: StoreCart | null = null;
        try {
          for (const item of selected) {
            cart = await medusa.addShippingMethod(cartId, item.option.id);
          }
        } catch (error) {
          // Best-effort rollback to Standard for every seller, so a partial
          // Express/Standard mix is not left on the cart.
          for (const [sellerId, sellerOptions] of bySeller) {
            const fallback = sellerOptions.find(
              (option) => deliveryTierFor(option) === "standard",
            );
            if (!fallback) continue;
            try {
              cart = await medusa.addShippingMethod(cartId, fallback.id);
            } catch {
              // Keep the original failure; the cart can be retried.
            }
          }
          throw error;
        }
        return {
          unavailable: [],
          cart,
          applied: selected.map((item) => ({
            seller_id: item.seller_id,
            option_id: item.option.id,
            tier,
          })),
        };
      });
      if (result.unavailable.length > 0) {
        return problem(
          409,
          "delivery-tier-unavailable",
          "The selected delivery tier is not available for every seller.",
          { unavailable: result.unavailable },
        );
      }
      if (!result.cart) {
        return problem(409, "delivery-tier-unavailable", "No delivery tier could be applied.");
      }
      return json({
        ...composeCartView(result.cart),
        delivery_tier: tier,
        applied: "applied" in result ? result.applied : [],
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
      return json({
        ...composeCartView(cart),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
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
      return json({
        ...composeCartView(cart),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
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
      return json({
        ...composeCartView(cart),
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
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
          const productIds = [
            ...new Set(
              (cart.items ?? [])
                .map((item) => item.product_id)
                .filter((id): id is string => Boolean(id)),
            ),
          ];
          const completionOffers = await medusa.listOffersByProducts(
            productIds,
            regionFor(authenticated.authorization),
          );
          const offerById = new Map(
            completionOffers.map((offer) => [offer.id, offer]),
          );
          const orderGroupPayload = {
            ...(result.order_group ?? {}),
            destination_postcode:
              (cart as { shipping_address?: StoreAddress }).shipping_address?.postal_code ?? null,
            // Buyer-visible money, stored once at completion in the API's minor-unit convention.
            // Legacy rows without this block fall back to the group total only.
            currency_code: cart.currency_code ?? "inr",
            amounts: {
              subtotal: itemSubtotalMinor(cart),
              shipping: medusaToMinor(cart.shipping_total),
              discount: medusaToMinorOr(cart.discount_total),
              total: medusaToMinor(result.order_group?.total ?? cart.total),
            },
            customer_reference: customerOrderReference(
              result.order_group?.id ?? cartId,
              (result.order_group as { created_at?: string } | undefined)?.created_at ??
                null,
            ),
            lines: (cart.items ?? []).map((item) => {
              const offer = item.metadata?.offer_id
                ? offerById.get(item.metadata.offer_id)
                : undefined;
              return {
                line_key: item.id,
                sku: item.sku ?? offer?.sku ?? item.variant_id ?? item.id,
                title: item.product_title ?? item.title,
                quantity: item.quantity,
                unit_price: medusaToMinorOr(item.unit_price),
                product_id: item.product_id ?? null,
                variant_id: item.variant_id ?? null,
                seller_id: item.seller_id ?? offer?.seller_id ?? null,
              };
            }),
          };
          await correlation.link(cartId, {
            orderGroup: result.order_group?.id,
            orderGroupPayload,
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
              lines: orderGroupPayload.lines,
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

  // GET /v1/products — composed product list with best-price offer per product.
  //
  // `catalogue_import` selects the governed staged catalogue by its product metadata marker, so the
  // storefront does not mix the source catalogue with pre-existing demonstration products. When it is
  // present the imported subset is scanned once and then paginated in memory, because Medusa's store
  // API has no portable metadata equality filter.
  if (url.pathname === "/v1/products" && req.method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 250);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
    // A storefront layout section resolves its products from a commerce collection. The section stores
    // the reference; this resolves it here so the storefront keeps one composed-product path, with the
    // same price and offer composition it already uses.
    const collectionId = (url.searchParams.get("collection_id") ?? "").trim();
    const catalogueImport = (url.searchParams.get("catalogue_import") ?? "").trim();
    const authorization = await optionalAuthorization(req);
    const regionId = regionFor(authorization);
    const channel = requestedChannel(url.searchParams.get("channel"), authorization);
    try {
      const t0 = performance.now();
      let products: Awaited<ReturnType<typeof medusa.listProducts>>;
      let totalCount: number | null = null;
      if (catalogueImport) {
        const scanned: Awaited<ReturnType<typeof medusa.listProducts>> = [];
        for (let start = 0; start < MAX_CATALOGUE_SCAN; start += CATALOGUE_SCAN_PAGE_SIZE) {
          const page = await medusa.listProducts(
            CATALOGUE_SCAN_PAGE_SIZE,
            start,
            salesChannelIdFor(channel),
          );
          scanned.push(...page);
          if (page.length < CATALOGUE_SCAN_PAGE_SIZE) break;
        }
        const matched = orderByImageQuality(scanned.filter(
          (p) => String(p.metadata?.catalogue_import ?? "") === catalogueImport,
        ));
        totalCount = matched.length;
        products = matched.slice(offset, offset + limit);
      } else if (collectionId) {
        products = await medusa.listProductsByCollection(collectionId, limit);
      } else {
        products = await medusa.listProducts(limit, offset, salesChannelIdFor(channel));
      }
      const productsMs = performance.now() - t0;

      const productIds = products.map((p) => p.id);
      const t1 = performance.now();
      const { offers: allOffers, cacheHit } = await getOffersCached(
        productIds,
        `${config.medusaCountryCode}:inr:${channel}`,
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
        const offers = offersByProduct.get(p.id) ?? [];
        const b2bPricing =
          channel === "b2b"
            ? ((p.metadata?.buildkart_b2b_pricing ?? {}) as Record<
                string,
                B2bPricingSnapshot
              >)
            : null;
        const composeOptions: ComposeOptions = { channel, b2bPricing };
        const { selected } = composeOffers(offers, composeOptions);
        return {
          id: p.id,
          title: p.title,
          thumbnail: p.thumbnail,
          description: p.description,
          handle: p.handle,
          metadata: p.metadata ?? null,
          categories: p.categories ?? [],
          // Merchandising tags are the storefront's tile badges (Best Deal / Seasonal / Flash Deal).
          badges: (p.tags ?? []).map((tag) => tag.value),
          // Every variant carries its own sellable offer. A grouped product is one card; its SKUs
          // are the variants inside it, never extra cards.
          variants: composeVariantPrices(p.variants, offers, composeOptions),
          best_price: selected,
          offer_count: offers.length,
          image_quality_score: imageQualityScore(p.id),
          image_quality_fixture: p.metadata?.catalogue_import === "CHG-049" ? "CHG-060" : null,
        };
      });
      const composeMs = performance.now() - t2;

      return json({
        products: composed,
        count: totalCount,
        limit,
        offset,
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
    const channel = requestedChannel(url.searchParams.get("channel"), authorization);
    try {
      const context = `${config.medusaCountryCode}:inr:${channel}`;

      const t0 = performance.now();
      const p = await medusa.getProduct(productId, salesChannelIdFor(channel));
      const productMs = performance.now() - t0;

      const t1 = performance.now();
      const { offers, cacheHit } = await getOffersCached([productId], context, regionId);
      const offersMs = performance.now() - t1;

      const t2 = performance.now();
      const b2bPricing =
        channel === "b2b"
          ? ((p.metadata?.buildkart_b2b_pricing ?? {}) as Record<
              string,
              B2bPricingSnapshot
            >)
          : null;
      const composeOptions: ComposeOptions = { channel, b2bPricing };
      const { offerViews, selected } = composeOffers(offers, composeOptions);
      const composeMs = performance.now() - t2;

      return json({
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        description: p.description,
        handle: p.handle,
        metadata: p.metadata ?? null,
        categories: p.categories ?? [],
        badges: (p.tags ?? []).map((tag) => tag.value),
        image_quality_score: imageQualityScore(p.id),
        image_quality_fixture: p.metadata?.catalogue_import === "CHG-049" ? "CHG-060" : null,
        variants: composeVariantPrices(p.variants, offers, composeOptions),
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
          moq: selected?.b2b_moq ?? null,
          quantity_tiers: selected?.b2b_tiers ?? null,
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

  // GET /v1/products/{productId}/bought-together - reciprocal merchandising pair.
  const boughtTogetherProduct = url.pathname.match(
    /^\/v1\/products\/([^/]+)\/bought-together$/,
  );
  if (boughtTogetherProduct && req.method === "GET") {
    const productId = boughtTogetherProduct[1];
    const authorization = await optionalAuthorization(req);
    const channel = requestedChannel(url.searchParams.get("channel"), authorization);
    if (!config.boughtTogetherEnabled) {
      return json({ pair_id: null, channel, paired: null });
    }
    const regionId = regionFor(authorization);
    try {
      const currentProduct = await withTimeout(
        medusa.getProduct(productId, salesChannelIdFor(channel)),
        5000,
      );
      const skuParam = (url.searchParams.get("sku") ?? "").trim();
      const variantParam = (url.searchParams.get("variant_id") ?? "").trim();
      const currentVariant = variantParam
        ? ((currentProduct.variants ?? []).find((variant) => variant.id === variantParam) ?? null)
        : skuParam
          ? ((currentProduct.variants ?? []).find(
              (variant) => (variant.sku ?? "").toUpperCase() === skuParam.toUpperCase(),
            ) ?? null)
          : null;
      const active = currentVariant
        ? await boughtTogether.getActiveForVariant(currentVariant.id, channel)
        : await boughtTogether.getActiveForProduct(productId, channel);
      if (!active) return json({ pair_id: null, channel, paired: null });
      const [pairedProduct, offers] = await withTimeout(
        Promise.all([
          medusa.getProduct(active.paired_product_id, salesChannelIdFor(channel)),
          medusa.listOffersByProducts(
            [productId, active.paired_product_id],
            regionId,
          ),
        ]),
        5000,
      );
      const currentOffers = offers.filter(
        (offer) =>
          offer.product_id === productId &&
          (!currentVariant || offer.variant_id === currentVariant.id),
      );
      const pairedOffers = offers.filter(
        (offer) =>
          offer.product_id === active.paired_product_id &&
          (!active.paired_variant_id || offer.variant_id === active.paired_variant_id),
      );
      const currentOptions: ComposeOptions = {
        channel,
        b2bPricing:
          channel === "b2b"
            ? ((currentProduct.metadata?.buildkart_b2b_pricing ?? {}) as Record<
                string,
                B2bPricingSnapshot
              >)
            : null,
      };
      const pairedOptions: ComposeOptions = {
        channel,
        b2bPricing:
          channel === "b2b"
            ? ((pairedProduct.metadata?.buildkart_b2b_pricing ?? {}) as Record<
                string,
                B2bPricingSnapshot
              >)
            : null,
      };
      const currentCompose = composeOffers(currentOffers, currentOptions);
      const currentReady = currentCompose.offerViews.some(
        (offer) => offer.unit_amount_minor != null,
      );
      const currentInStock = currentCompose.offerViews.some(
        (offer) => offer.in_stock !== false && offer.unit_amount_minor != null,
      );
      if (!currentReady || !currentInStock) {
        return json({ pair_id: null, channel, paired: null });
      }

      const pairedCompose = composeOffers(pairedOffers, pairedOptions);
      const pairedReady = pairedCompose.offerViews.some(
        (offer) => offer.unit_amount_minor != null,
      );
      if (!pairedReady) return json({ pair_id: null, channel, paired: null });
      const pairedInStock = pairedCompose.selected != null;
      const pairedBase = {
        id: pairedProduct.id,
        title: pairedProduct.title,
        thumbnail: pairedProduct.thumbnail ?? null,
        description: pairedProduct.description ?? "",
        handle: pairedProduct.handle ?? "",
        metadata: {
          brand: pairedProduct.metadata?.brand ?? null,
          category_l1: pairedProduct.metadata?.category_l1 ?? null,
          catalogue_import: pairedProduct.metadata?.catalogue_import ?? null,
        },
        categories: pairedProduct.categories ?? [],
        badges: (pairedProduct.tags ?? []).map((tag) => tag.value),
        offer_count: pairedOffers.length,
        image_quality_score: imageQualityScore(pairedProduct.id),
        image_quality_fixture:
          pairedProduct.metadata?.catalogue_import === "CHG-049" ? "CHG-060" : null,
      };
      return json({
        pair_id: active.pair.id,
        channel,
        variant_id: currentVariant?.id ?? null,
        paired_variant_id: active.paired_variant_id,
        paired_availability: pairedInStock ? "in_stock" : "out_of_stock",
        paired: pairedInStock
          ? {
              ...pairedBase,
              variants: composeVariantPrices(
                active.paired_variant_id
                  ? pairedProduct.variants.filter(
                      (variant) => variant.id === active.paired_variant_id,
                    )
                  : pairedProduct.variants,
                pairedOffers,
                pairedOptions,
              ),
              best_price: pairedCompose.selected,
            }
          : {
              ...pairedBase,
              variants: [],
              best_price: null,
            },
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      console.warn(
        "[experience-api] bought-together read failed:",
        (error as Error).message,
      );
      return json({ pair_id: null, channel, paired: null });
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
  // Internal append point for canonical seller actions performed in the Medusa
  // admin/vendor facades. nginx blocks /v1/internal on the public hosts; the
  // service credential is the same one used by the admin console proxy.
  if (url.pathname === "/v1/internal/inventory/summary" && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: { skus?: string[] };
    try {
      body = (await req.json()) as { skus?: string[] };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const skus = Array.from(
      new Set(
        (body.skus ?? [])
          .map((sku) => String(sku ?? "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 200);
    const items = await Promise.all(
      skus.map(async (sku) => {
        let tryton:
          | Awaited<ReturnType<typeof erp.stockSummary>>
          | { found: false; error: string };
        try {
          tryton = await erp.stockSummary(sku);
        } catch (error) {
          tryton = { found: false, error: (error as Error).message };
        }
        const ledger = await reservations.getLedger(sku);
        return {
          sku,
          tryton,
          platform: ledger
            ? {
                available: ledger.available,
                reserved: ledger.reserved,
                atp: Math.max(0, ledger.available - ledger.reserved),
                source: "reservation_ledger_fixture",
              }
            : null,
        };
      }),
    );
    return json({
      items,
      environment: config.environment,
      test_data: true,
      tryton_authoritative: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/internal/inventory/request" && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      sku?: string;
      quantity_delta?: number;
      reason?: string;
      seller_id?: string | null;
      offer_id?: string | null;
      product_id?: string | null;
      actor_role?: string;
      acting_for_seller_id?: string | null;
      reference?: string | null;
      correlation_id?: string | null;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const sku = String(body.sku ?? "").trim();
    const delta = Number(body.quantity_delta);
    const reason = String(body.reason ?? "").trim();
    if (!sku || !Number.isInteger(delta) || delta === 0 || !reason) {
      return problem(
        422,
        "invalid-inventory-request",
        "sku, non-zero integer quantity_delta and reason are required.",
      );
    }
    const request = await inventoryRequests.create({
      sku,
      offer_id: body.offer_id ?? null,
      product_id: body.product_id ?? null,
      seller_id: body.seller_id ?? null,
      quantity_delta: delta,
      reason,
      requested_by: operator.user.id,
      acting_for_seller_id: body.acting_for_seller_id ?? null,
      reference: body.reference ?? null,
      correlation_id: body.correlation_id ?? cid,
    });
    await events.append({
      event_type: "inventory.adjustment_requested",
      aggregate_type: "inventory",
      aggregate_id: sku,
      correlation_id: cid,
      payload: {
        request_id: request.id,
        sku,
        quantity_delta: delta,
        reason,
        seller_id: body.seller_id ?? null,
        offer_id: body.offer_id ?? null,
        product_id: body.product_id ?? null,
        actor_user_id: operator.user.id,
        actor_role: body.actor_role ?? "admin",
        acting_for_seller_id: body.acting_for_seller_id ?? null,
        reference: body.reference ?? null,
        source: body.acting_for_seller_id
          ? "admin_acting_for_seller"
          : body.seller_id
            ? "seller_portal"
            : "admin_console",
        stock_effect: "none",
      },
    });
    return json({
      request_id: request.id,
      sku,
      quantity_delta: delta,
      reason,
      status: request.status,
      stock_effect: "none",
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/internal/inventory/requests" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const status = url.searchParams.get("status")?.trim() || undefined;
    const sellerId = url.searchParams.get("seller_id")?.trim() || null;
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    return json({
      items: await inventoryRequests.list({
        status,
        sellerId,
        limit: Number.isFinite(limit) ? limit : 100,
      }),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const inventoryDecision = url.pathname.match(
    /^\/v1\/internal\/inventory\/requests\/([^/]+)\/(approve|reject)$/,
  );
  if (inventoryDecision && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: { note?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as { note?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const existing = await inventoryRequests.get(inventoryDecision[1]);
    if (!existing) return problem(404, "inventory-request-not-found");
    const status = inventoryDecision[2] === "approve" ? "approved" : "rejected";
    const request = await inventoryRequests.decide(
      existing.id,
      status,
      operator.user.id,
      body.note?.trim() || null,
    );
    if (!request) {
      return problem(409, "inventory-request-already-decided");
    }
    await events.append({
      event_type: `inventory.adjustment_${status}`,
      aggregate_type: "inventory",
      aggregate_id: request.sku,
      correlation_id: cid,
      payload: {
        request_id: request.id,
        sku: request.sku,
        quantity_delta: request.quantity_delta,
        status,
        note: request.decision_note,
        actor_user_id: operator.user.id,
        stock_effect: "none",
      },
    });
    return json({
      request,
      stock_effect: "none",
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const inventoryPost = url.pathname.match(
    /^\/v1\/internal\/inventory\/requests\/([^/]+)\/post$/,
  );
  if (inventoryPost && req.method === "POST") {
    const operator = await requireErpOperator(req);
    if ("response" in operator) return operator.response;
    let body: { operation_key?: string } = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as { operation_key?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const request = await inventoryRequests.get(inventoryPost[1]);
    if (!request) return problem(404, "inventory-request-not-found");
    if (request.status !== "approved") {
      return problem(409, "inventory-request-not-approved");
    }
    const operationKey =
      body.operation_key?.trim() || `inventory-adjustment:${request.id}`;
    const posting = await inventoryRequests.beginPosting(
      request.id,
      operationKey,
      operator.user.id,
    );
    if (posting.status === "posted") {
      return json({ posting, idempotent: true, environment: config.environment, test_data: true, correlation_id: cid });
    }
    try {
      const result = await erp.postStockAdjustment({
        operationKey,
        sku: request.sku,
        quantity: request.quantity_delta,
      });
      const finished = await inventoryRequests.finishPosting(request.id, {
        status: "posted",
        trytonMoveId: result.moveId,
        movementRef: `tryton:stock.move:${result.moveId}`,
        error: null,
        reconciliationStatus: "pending",
      });
      await events.append({
        event_type: "inventory.adjustment_posted",
        aggregate_type: "inventory",
        aggregate_id: request.sku,
        correlation_id: cid,
        payload: {
          request_id: request.id,
          operation_key: operationKey,
          tryton_move_id: result.moveId,
          movement_ref: `tryton:stock.move:${result.moveId}`,
          actor_user_id: operator.user.id,
          stock_effect: "tryton",
        },
      });
      return json({
        posting: finished,
        tryton: result,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      const message = (error as Error).message;
      const failed = await inventoryRequests.finishPosting(request.id, {
        status: "posting_failed",
        error: message,
      });
      await events.append({
        event_type: "inventory.adjustment_posting_failed",
        aggregate_type: "inventory",
        aggregate_id: request.sku,
        correlation_id: cid,
        payload: {
          request_id: request.id,
          operation_key: operationKey,
          error: message,
          actor_user_id: operator.user.id,
          stock_effect: "none",
        },
      });
      return json(
        { posting: failed, error: message, environment: config.environment, test_data: true, correlation_id: cid },
        502,
      );
    }
  }

  const inventoryPosting = url.pathname.match(
    /^\/v1\/internal\/inventory\/requests\/([^/]+)\/posting$/,
  );
  if (inventoryPosting && req.method === "GET") {
    const operator = await requireErpOperator(req);
    if ("response" in operator) return operator.response;
    const request = await inventoryRequests.get(inventoryPosting[1]);
    if (!request) return problem(404, "inventory-request-not-found");
    const posting = await inventoryRequests.getPosting(request.id);
    const tryton =
      posting?.tryton_move_id != null
        ? await erp.readStockMove(posting.tryton_move_id)
        : null;
    return json({
      request,
      posting,
      tryton,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  const inventoryReconcile = url.pathname.match(
    /^\/v1\/internal\/inventory\/requests\/([^/]+)\/reconcile$/,
  );
  if (inventoryReconcile && req.method === "POST") {
    const operator = await requireErpOperator(req);
    if ("response" in operator) return operator.response;
    const request = await inventoryRequests.get(inventoryReconcile[1]);
    if (!request) return problem(404, "inventory-request-not-found");
    const posting = await inventoryRequests.getPosting(request.id);
    if (!posting?.tryton_move_id) {
      return problem(409, "inventory-posting-not-found");
    }
    const move = await erp.readStockMove(posting.tryton_move_id);
    const expected = Math.abs(request.quantity_delta);
    const actual = Math.abs(move?.quantity ?? 0);
    const matches = Boolean(move && move.state === "done" && actual === expected);
    const reconciled = await inventoryRequests.finishPosting(request.id, {
      status: matches ? "reconciled" : "reconciliation_required",
      reconciliationStatus: matches ? "matched" : "mismatch",
      error: matches
        ? null
        : `Expected ${expected} in state done; found ${actual} in ${move?.state ?? "missing"}.`,
    });
    await events.append({
      event_type: "inventory.adjustment_reconciled",
      aggregate_type: "inventory",
      aggregate_id: request.sku,
      correlation_id: cid,
      payload: {
        request_id: request.id,
        tryton_move_id: posting.tryton_move_id,
        expected,
        actual,
        matches,
        actor_user_id: operator.user.id,
        stock_effect: "none",
      },
    });
    return json({
      posting: reconciled,
      tryton: move,
      matches,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  if (url.pathname === "/v1/internal/seller-activity" && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      event_type?: string;
      seller_id?: string;
      offer_id?: string;
      product_id?: string | null;
      actor_user_id?: string;
      actor_role?: string;
      channel?: string;
      source?: string;
      reason?: string | null;
      before?: unknown;
      after?: unknown;
      correlation_id?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!body.event_type || !body.seller_id || !body.offer_id) {
      return problem(422, "invalid-seller-activity", "event_type, seller_id and offer_id are required.");
    }
    const event = await events.append({
      event_type: body.event_type,
      aggregate_type: "offer",
      aggregate_id: body.offer_id,
      correlation_id: body.correlation_id ?? cid,
      payload: {
        seller_id: body.seller_id,
        offer_id: body.offer_id,
        product_id: body.product_id ?? null,
        actor_user_id: body.actor_user_id ?? operator.user.id,
        actor_role: body.actor_role ?? "admin",
        channel: body.channel === "b2b" ? "b2b" : "b2c",
        source: body.source ?? "admin_console",
        reason: body.reason ?? null,
        before: body.before ?? null,
        after: body.after ?? null,
        environment: config.environment,
        test_data: true,
      },
    });
    return json({
      event,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    }, 201);
  }

  if (url.pathname === "/v1/admin/seller-activity" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const requestedType = url.searchParams.get("event_type")?.trim() || "seller.";
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100),
    );
    const items = (await events.list("offer", undefined, 500))
      .filter((event) => event.event_type.startsWith(requestedType))
      .slice(0, limit);
    return json({
      items,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

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
  // Bought Together merchandising: admin CRUD + product candidates.
  // The Experience API owns the pair store; Medusa proxies these calls after
  // enforcing the BuildKart merchandising permission.
  if (url.pathname === "/v1/admin/merchandising/bought-together/candidates" && req.method === "GET") {
    if (!config.boughtTogetherEnabled) return problem(404, "not-found");
    const operator = await requireAnyRole(req, ["marketplace_operator", "super_admin"]);
    if ("response" in operator) return operator.response;
    const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
    const channelParamRaw = url.searchParams.get("channel");
    const channelParam = channelParamRaw?.trim();
    if (
      channelParam !== undefined &&
      channelParam !== null &&
      !["b2c", "b2b", "both"].includes(channelParam)
    ) {
      return problem(400, "invalid-channel", "channel must be b2c, b2b or both.");
    }
    const channel = (channelParam || "b2c") as "b2c" | "b2b" | "both";
    if (
      (channel === "b2b" || channel === "both") &&
      !config.medusaB2bSalesChannelId
    ) {
      return problem(
        503,
        "b2b-channel-unavailable",
        "B2B sales channel is not configured.",
      );
    }
    const channelsToEvaluate: Array<"b2c" | "b2b"> =
      channel === "both" ? ["b2c", "b2b"] : [channel];
    const scanChannels: Array<"b2c" | "b2b"> =
      channel === "both" ? ["b2c", "b2b"] : [channel];
    try {
      const scannedProducts = new Map<string, StoreProduct>();
      const visibleProductIdsByChannel: Record<
        "b2c" | "b2b",
        Set<string> | null
      > = { b2c: null, b2b: null };
      let scanTruncated = false;
      for (const scanChannel of scanChannels) {
        const visible = new Set<string>();
        visibleProductIdsByChannel[scanChannel] = visible;
        for (let offset = 0; offset < 1000; offset += 250) {
          const page = await medusa.listProducts(
            250,
            offset,
            salesChannelIdFor(scanChannel),
          );
          for (const product of page) {
            scannedProducts.set(product.id, product);
            visible.add(product.id);
          }
          if (page.length < 250) break;
          if (offset + 250 >= 1000) scanTruncated = true;
        }
      }
      const scanned = [...scannedProducts.values()];
      const matched = scanned
        .filter((product) => {
          if (!query) return true;
          if (product.title.toLowerCase().includes(query)) return true;
          return (product.variants ?? []).some(
            (variant) =>
              (variant.sku ?? "").toLowerCase().includes(query) ||
              (variant.title ?? "").toLowerCase().includes(query),
          );
        })
        .slice(0, 20);
      const matchedIds = matched.map((product) => product.id);
      const candidateVariantIds = [
        ...new Set(
          matched.flatMap((product) =>
            (product.variants ?? []).slice(0, 10).map((variant) => variant.id),
          ),
        ),
      ];

      const activePairsByChannel: Record<
        "b2c" | "b2b",
        Map<
          string,
          { pair_id: string; paired_variant_id: string | null; paired_product_id: string }
        > | null
      > = { b2c: null, b2b: null };
      for (const candidateChannel of channelsToEvaluate) {
        try {
          activePairsByChannel[candidateChannel] =
            await boughtTogether.activePairsForVariants(
              candidateVariantIds,
              candidateChannel,
            );
        } catch (error) {
          console.warn(
            "[experience-api] bought-together conflict lookup failed:",
            (error as Error).message,
          );
          return problem(
            503,
            "pair-store-unavailable",
            "Could not check active product pairs.",
          );
        }
      }

      const offersByChannel: Record<
        "b2c" | "b2b",
        Map<string, StoreOffer[]> | null
      > = { b2c: null, b2b: null };
      for (const candidateChannel of channelsToEvaluate) {
        const regionId =
          candidateChannel === "b2b"
            ? config.medusaB2bRegionId ?? config.medusaRegionId
            : config.medusaRegionId;
        try {
          const offers = await medusa.listOffersByProducts(
            matchedIds,
            regionId,
            salesChannelIdFor(candidateChannel),
          );
          const byProduct = new Map<string, StoreOffer[]>();
          for (const offer of offers) {
            const list = byProduct.get(offer.product_id) ?? [];
            list.push(offer);
            byProduct.set(offer.product_id, list);
          }
          offersByChannel[candidateChannel] = byProduct;
        } catch (error) {
          console.warn(
            `[experience-api] bought-together offer lookup failed for ${candidateChannel}:`,
            (error as Error).message,
          );
        }
      }

      const eligibleOfferFor = (
        candidateChannel: "b2c" | "b2b",
        productId: string,
        variantId: string,
      ) => {
        const visibleIds = visibleProductIdsByChannel[candidateChannel];
        if (!visibleIds) {
          return {
            offer_id: null,
            in_stock: null,
            evaluated: false,
            visible: null,
          };
        }
        if (!visibleIds.has(productId)) {
          return {
            offer_id: null,
            in_stock: null,
            evaluated: true,
            visible: false,
          };
        }
        const byProduct = offersByChannel[candidateChannel];
        if (!byProduct) {
          return {
            offer_id: null,
            in_stock: null,
            evaluated: false,
            visible: true,
          };
        }
        const priced = (byProduct.get(productId) ?? []).filter(
          (offer) =>
            offer.variant_id === variantId &&
            (offer.calculated_price?.calculated_amount ?? 0) > 0,
        );
        const stockRank = (offer: StoreOffer) =>
          offer.in_stock === true ? 0 : offer.in_stock === false ? 2 : 1;
        priced.sort(
          (left, right) =>
            stockRank(left) - stockRank(right) ||
            (left.calculated_price?.calculated_amount ?? 0) -
              (right.calculated_price?.calculated_amount ?? 0) ||
            left.id.localeCompare(right.id),
        );
        const offer = priced[0];
        if (!offer) {
          return {
            offer_id: null,
            in_stock: null,
            evaluated: true,
            visible: true,
          };
        }
        return {
          offer_id: offer.id,
          in_stock:
            offer.in_stock === true
              ? true
              : offer.in_stock === false
                ? false
                : null,
          evaluated: true,
          visible: true,
        };
      };

      const channelReady = (
        candidateChannel: "b2c" | "b2b",
        productId: string,
      ): boolean | null => {
        const visibleIds = visibleProductIdsByChannel[candidateChannel];
        if (!visibleIds) return null;
        if (!visibleIds.has(productId)) return false;
        const byProduct = offersByChannel[candidateChannel];
        if (!byProduct) return null;
        return (byProduct.get(productId) ?? []).some(
          (offer) => (offer.calculated_price?.calculated_amount ?? 0) > 0,
        );
      };

      const items = matched.map((product) => {
        const variants = product.variants ?? [];
        const matchingVariants = query
          ? variants.filter(
              (variant) =>
                (variant.sku ?? "").toLowerCase().includes(query) ||
                (variant.title ?? "").toLowerCase().includes(query),
            )
          : variants;
        const candidateVariants =
          matchingVariants.length > 0 ? matchingVariants : variants;
        const visibleVariants = candidateVariants.slice(0, 10);
        const matchingSkus = visibleVariants.map((variant) => {
          const b2cOffer = eligibleOfferFor("b2c", product.id, variant.id);
          const b2bOffer = eligibleOfferFor("b2b", product.id, variant.id);
          const selected =
            channel === "b2c"
              ? b2cOffer
              : channel === "b2b"
                ? b2bOffer
                : null;
          return {
            variant_id: variant.id,
            variant_title: variant.title ?? "",
            sku: variant.sku ?? "",
            offer_id: selected?.offer_id ?? null,
            in_stock: selected?.in_stock ?? null,
            channels: { b2c: b2cOffer, b2b: b2bOffer },
            active_pairs: {
              b2c: activePairsByChannel.b2c?.get(variant.id) ?? null,
              b2b: activePairsByChannel.b2b?.get(variant.id) ?? null,
            },
            active_pair:
              channel === "b2c"
                ? (activePairsByChannel.b2c?.get(variant.id) ?? null)
                : channel === "b2b"
                  ? (activePairsByChannel.b2b?.get(variant.id) ?? null)
                  : null,
          };
        });
        const firstPair = matchingSkus[0]?.active_pairs ?? { b2c: null, b2b: null };
        const activePairs = {
          b2c: firstPair.b2c
            ? {
                id: firstPair.b2c.pair_id,
                paired_variant_id: firstPair.b2c.paired_variant_id,
                paired_product_id: firstPair.b2c.paired_product_id,
              }
            : null,
          b2b: firstPair.b2b
            ? {
                id: firstPair.b2b.pair_id,
                paired_variant_id: firstPair.b2b.paired_variant_id,
                paired_product_id: firstPair.b2b.paired_product_id,
              }
            : null,
        };
        const selectedActivePair =
          channel === "b2c"
            ? activePairs.b2c
            : channel === "b2b"
              ? activePairs.b2b
              : null;
        return {
          id: product.id,
          title: product.title,
          thumbnail: product.thumbnail ?? null,
          sku_count: variants.length,
          status: "published",
          channel_ready: {
            b2c: channelReady("b2c", product.id),
            b2b: channelReady("b2b", product.id),
          },
          matching_skus: matchingSkus,
          matching_sku_count: candidateVariants.length,
          matching_skus_truncated: candidateVariants.length > visibleVariants.length,
          active_pair: selectedActivePair,
          active_pairs: activePairs,
        };
      });
      return json({
        items,
        count: items.length,
        channel,
        evaluated_channels: channelsToEvaluate,
        scan_truncated: scanTruncated,
      });
    } catch (error) {
      console.warn(
        "[experience-api] bought-together candidate search failed:",
        (error as Error).message,
      );
      return problem(502, "catalogue-unavailable", "Candidate search failed.");
    }
  }

  if (url.pathname === "/v1/admin/merchandising/bought-together" && req.method === "GET") {
    if (!config.boughtTogetherEnabled) return problem(404, "not-found");
    const operator = await requireAnyRole(req, ["marketplace_operator", "super_admin"]);
    if ("response" in operator) return operator.response;
    const statusParam = url.searchParams.get("status");
    const channelParam = url.searchParams.get("channel");
    const status = ["draft", "active", "paused", "archived"].includes(statusParam ?? "")
      ? (statusParam as BoughtTogetherStatus)
      : undefined;
    const channel = ["b2c", "b2b", "both"].includes(channelParam ?? "")
      ? (channelParam as BoughtTogetherChannel)
      : undefined;
    try {
      const result = await boughtTogether.list({
        status,
        channel,
        limit: Number(url.searchParams.get("limit") ?? 50),
        offset: Number(url.searchParams.get("offset") ?? 0),
      });
      const items = await enrichBoughtTogetherPairs(result.items);
      return json({ items, count: result.count });
    } catch (error) {
      return boughtTogetherFailure(error);
    }
  }

  if (url.pathname === "/v1/admin/merchandising/bought-together" && req.method === "POST") {
    if (!config.boughtTogetherEnabled) return problem(404, "not-found");
    const operator = await requireAnyRole(req, ["marketplace_operator", "super_admin"]);
    if ("response" in operator) return operator.response;
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    try {
      const input = {
        product_a_id: String(body.product_a_id ?? ""),
        product_b_id: String(body.product_b_id ?? ""),
        variant_a_id: body.variant_a_id ? String(body.variant_a_id) : null,
        variant_b_id: body.variant_b_id ? String(body.variant_b_id) : null,
        channel: body.channel as BoughtTogetherChannel,
        status: (body.status as BoughtTogetherStatus) ?? "draft",
      };
      if (input.status === "active") {
        await validateBoughtTogetherInput(input);
      }
      const pair = await boughtTogether.create(
        input,
        operator.authorization.userId,
        correlationId(req),
      );
      const [enriched] = await enrichBoughtTogetherPairs([pair]);
      return json({ pair: enriched }, 201);
    } catch (error) {
      return boughtTogetherFailure(error);
    }
  }

  const boughtTogetherAuditMatch = url.pathname.match(
    /^\/v1\/admin\/merchandising\/bought-together\/([^/]+)\/audit$/,
  );
  if (boughtTogetherAuditMatch && req.method === "GET") {
    if (!config.boughtTogetherEnabled) return problem(404, "not-found");
    const operator = await requireAnyRole(req, ["marketplace_operator", "super_admin"]);
    if ("response" in operator) return operator.response;
    try {
      return json({ items: await boughtTogether.audit(boughtTogetherAuditMatch[1]) });
    } catch (error) {
      return boughtTogetherFailure(error);
    }
  }

  const boughtTogetherMatch = url.pathname.match(
    /^\/v1\/admin\/merchandising\/bought-together\/([^/]+)$/,
  );
  if (boughtTogetherMatch && req.method === "PATCH") {
    if (!config.boughtTogetherEnabled) return problem(404, "not-found");
    const operator = await requireAnyRole(req, ["marketplace_operator", "super_admin"]);
    if ("response" in operator) return operator.response;
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const expectedVersion = Number(body.expected_version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return problem(400, "expected-version-required", "expected_version must be a positive integer.");
    }
    try {
      const current = await boughtTogether.get(boughtTogetherMatch[1]);
      if (!current) {
        return problem(404, "pair_not_found", "Pair not found.");
      }
      const next = {
        product_a_id: body.product_a_id
          ? String(body.product_a_id)
          : current.product_a_id,
        product_b_id: body.product_b_id
          ? String(body.product_b_id)
          : current.product_b_id,
        variant_a_id:
          body.variant_a_id !== undefined
            ? body.variant_a_id
              ? String(body.variant_a_id)
              : null
            : current.variant_a_id,
        variant_b_id:
          body.variant_b_id !== undefined
            ? body.variant_b_id
              ? String(body.variant_b_id)
              : null
            : current.variant_b_id,
        channel: body.channel
          ? (body.channel as BoughtTogetherChannel)
          : current.channel,
        status: body.status
          ? (body.status as BoughtTogetherStatus)
          : current.status,
      };
      if (next.status === "active") {
        await validateBoughtTogetherInput(next);
      }
      const pair = await boughtTogether.update(
        boughtTogetherMatch[1],
        {
          product_a_id: next.product_a_id,
          product_b_id: next.product_b_id,
          variant_a_id: next.variant_a_id,
          variant_b_id: next.variant_b_id,
          channel: next.channel,
          status: next.status,
        },
        expectedVersion,
        operator.authorization.userId,
        correlationId(req),
      );
      const [enriched] = await enrichBoughtTogetherPairs([pair]);
      return json({ pair: enriched });
    } catch (error) {
      return boughtTogetherFailure(error);
    }
  }

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

  // GET /v1/me/orders — API-backed customer order history.
  if (url.pathname === "/v1/me/orders" && req.method === "GET") {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    if (!hasAnyRole(authenticated.authorization, ["customer", "b2b_buyer", "b2b_account_admin"])) {
      return problem(403, "customer-role-required");
    }
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    // Only completed orders belong in the buyer's order history. A correlation row also exists for
    // an in-flight cart (it owns the checkout), so listing every row produced blank "0 items" cards
    // for carts that were never completed.
    const records = (
      await correlation.listForUser(
        authenticated.user.id,
        Number.isFinite(limit) ? limit : 50,
      )
    ).filter((ref) => Boolean(ref.medusa_order_group_id));
    return json({
      items: records.map((ref) => ({
        order_id: ref.checkout_ref,
        medusa_order_group_id: ref.medusa_order_group_id,
        status: ref.medusa_order_group_id ? "confirmed" : "not_started",
        created_at: ref.created_at,
        ...orderMoneySummary(ref),
        lines: orderLineSnapshots(ref),
        payment_mode: config.paymentAdapterMode,
        test_data: true,
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
    const shipments = orderGroup ? await shipmentsWithEvents(orderGroup) : [];
    const eligibility = await orderEligibility(orderId, authenticated.user.id, ref);
    const relatedReturns = (await returns.listForUser(authenticated.user.id, 50))
      .filter((item) => item.orderId === orderId);
    return json({
      order_id: orderId,
      medusa_order_group_id: orderGroup,
      status: orderGroup ? "confirmed" : "not_started",
      ...orderMoneySummary(ref),
      payment_mode: config.paymentAdapterMode,
      environment: config.environment,
      test_data: true,
      reservation_id: trytonMove ? `tryton_move_${trytonMove}` : null,
      reservation_status: trytonMove ? "committed" : "not_started",
      reconciled: Boolean(orderGroup && trytonMove),
      lines: orderLineSnapshots(ref),
      shipments,
      return_eligibility: eligibility,
      returns: relatedReturns,
      logistics_mode: "simulated",
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

  // Short-lived browser ticket for the workspace WebSocket. The session bearer is never placed in
  // the WebSocket URL.
  const streamTicketMatch = url.pathname.match(
    /^\/v1\/workspaces\/([^/]+)\/stream-ticket$/,
  );
  if (streamTicketMatch && req.method === "POST") {
    if (!config.workspaceServiceUrl || !config.workspaceServiceSecret) {
      return problem(503, "workspace-not-configured", "The workspace service is not configured.");
    }
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    if (
      !hasAnyRole(authenticated.authorization, [
        "b2b_buyer",
        "b2b_account_admin",
        "b2b_approver",
        "super_admin",
        "customer",
      ])
    ) {
      return problem(404, "not-found");
    }
    return json(
      signWorkspaceTicket(
        authenticated.user,
        authenticated.authorization,
        cid,
        streamTicketMatch[1],
      ),
    );
  }

  // Workspace collaboration (B2B and household) is always proxied to the internal service.
  if (
    url.pathname === "/v1/workspaces" ||
    url.pathname.startsWith("/v1/workspaces/") ||
    url.pathname === "/v1/household-projects" ||
    url.pathname === "/v1/workspace-invitations/accept" ||
    url.pathname.startsWith("/v1/channels/") ||
    url.pathname.startsWith("/v1/purchase-drafts/") ||
    url.pathname.startsWith("/v1/proposals/") ||
    url.pathname.startsWith("/v1/approval-requests/")
  ) {
    const authenticated = await authenticate(req);
    if ("response" in authenticated) return authenticated.response;
    return proxyWorkspace(
      req,
      authenticated.user,
      authenticated.authorization,
      cid,
    );
  }

  return problem(404, "not-found");
}

const server = Bun.serve({
  port: config.port,
  fetch: async (req, bunServer) => {
    const url = new URL(req.url);
    const cid = correlationId(req);
    const streamMatch = url.pathname.match(
      /^\/v1\/workspaces\/([^/]+)\/stream$/,
    );
    if (streamMatch && req.method === "GET") {
      return handleWorkspaceStream(req, bunServer, streamMatch[1], url, cid);
    }
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
  websocket: {
    open(ws) {
      const data = ws.data as WorkspaceStreamData;
      if (!config.workspaceServiceUrl) {
        ws.close(1011, "workspace-not-configured");
        return;
      }
      const wsBase = config.workspaceServiceUrl.replace(/^http/, "ws");
      const upstreamUrl = new URL(
        `${wsBase}/v1/workspaces/${data.workspaceId}/stream`,
      );
      upstreamUrl.searchParams.set("ticket", data.ticket);
      upstreamUrl.searchParams.set("signature", data.signature);
      upstreamUrl.searchParams.set("cursor", String(data.cursor));
      let upstream: any;
      try {
        upstream = new WebSocket(upstreamUrl.toString());
      } catch {
        ws.close(1011, "workspace-unavailable");
        return;
      }
      workspaceStreams.set(ws, upstream);
      upstream.onmessage = (event: { data: unknown }) => {
        try {
          ws.send(typeof event.data === "string" ? event.data : String(event.data));
        } catch {
          upstream.close();
        }
      };
      upstream.onclose = () => {
        workspaceStreams.delete(ws);
        try {
          ws.close();
        } catch {
          // already closed
        }
      };
      upstream.onerror = () => {
        workspaceStreams.delete(ws);
        try {
          ws.close(1011, "workspace-unavailable");
        } catch {
          // already closed
        }
      };
    },
    message(ws, message) {
      const upstream = workspaceStreams.get(ws);
      if (upstream && upstream.readyState === 1) {
        upstream.send(message);
      }
    },
    close(ws) {
      const upstream = workspaceStreams.get(ws);
      if (upstream) {
        workspaceStreams.delete(ws);
        try {
          upstream.close();
        } catch {
          // already closed
        }
      }
    },
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
