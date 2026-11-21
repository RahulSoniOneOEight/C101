import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { loadConfig } from "./config.js";
import {
  MedusaStoreClient,
  COD_PAYMENT_PROVIDER_ID,
  RAZORPAY_PAYMENT_PROVIDER_ID,
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
import { GuestCheckoutStore } from "./store/guest-checkout-store.js";
import { CodStore, currentPeriod, type CodOrderDue } from "./store/cod-store.js";
import { CustomerIdentityStore } from "./auth/customer-identity.js";
import { RealmSessionStore } from "./auth/realm-session.js";
import { AuthRateLimiter } from "./auth/rate-limit.js";
import { AccessJwtVerifier } from "./auth/ops-access-jwt.js";
import { OpsGate, OPS_SESSION_COOKIE, readCookie } from "./auth/ops-gate.js";
import { OpsSessionStore } from "./auth/ops-session.js";
import { CloudflareAccessGroupSync } from "./auth/ops-cloudflare-sync.js";
import { MedusaAdminInvites } from "./auth/medusa-invites.js";
import { decodeOpsEncryptionKey, OpsStaffStore, type OpsStaff, type OpsStaffRole } from "./auth/ops-staff.js";
import {
  issueFormToken,
  opsEnrollPage,
  opsLoginPage,
  opsNoticePage,
  opsRecoveryPage,
  opsStaffAuditPage,
  opsStaffPage,
  verifyFormToken,
} from "./auth/ops-pages.js";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./auth/ops-totp.js";
import {
  normalizeIndianMobile,
  parseGuestCheckoutBody,
  parseGuestQuoteBody,
} from "./guest/guest-checkout.js";
import { EventStore } from "./store/event-store.js";
import { ReservationStore } from "./store/reservation-store.js";
import { InventoryRequestStore } from "./store/inventory-request-store.js";
import { NotificationStore } from "./store/notification-store.js";
import { PrivilegedAuditStore } from "./store/privileged-audit-store.js";
import { PilotAccessStore } from "./store/pilot-access-store.js";
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
import { EmailAuthStore } from "./auth/email-auth.js";
import { ResendEmailSender, type EmailMessage } from "./email/sender.js";
import {
  hasAnyRole,
  loadPilotAuthorizations,
  PILOT_ROLES,
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
  type ReturnCase,
  type ReturnCondition,
  type ReturnDisposition,
  type ReturnStatus,
} from "./store/return-store.js";
import {
  EVIDENCE_MAX_BYTES,
  LocalEvidenceStore,
  isEvidenceContentType,
} from "./evidence/evidence-store.js";
import { evidenceUrl, verifyEvidenceSignature } from "./evidence/evidence-url.js";
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
const guestCheckout = new GuestCheckoutStore(config.experienceDatabaseUrl);
const codStore = new CodStore(config.experienceDatabaseUrl);
const events = new EventStore(config.experienceDatabaseUrl);
const reservations = new ReservationStore(config.experienceDatabaseUrl);
const inventoryRequests = new InventoryRequestStore(config.experienceDatabaseUrl);
const notifications = new NotificationStore(config.experienceDatabaseUrl);
const shipmentStore = new ShipmentStore(config.experienceDatabaseUrl);
const logistics = new SimulatedLogisticsProvider(shipmentStore);
const returns = new ReturnStore(config.experienceDatabaseUrl);
const evidenceStore = new LocalEvidenceStore(config.evidenceDir);
const evidenceUrlFor = (evidenceId: string) =>
  evidenceUrl(config.publicApiBaseUrl, config.evidenceSigningSecret, evidenceId);
const withEvidenceUrls = (record: ReturnCase) => ({
  ...record,
  evidence: record.evidence.map((item) => ({ ...item, url: evidenceUrlFor(item.id) })),
});
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
  config.identityMode === "pilot"
    ? loadPilotUsers(config.pilotUsersJson, config.pilotExpectedUserCount)
    : [],
);
const pilotAuthorizations = config.identityMode === "pilot"
  ? loadPilotAuthorizations(
      config.pilotRoleAssignmentsJson,
      pilotDirectory.users,
      config.pilotExpectedUserCount !== undefined,
    )
  : new Map<string, PilotAuthorization>();
const customerIdentity = config.identityMode === "directory"
  ? new CustomerIdentityStore(config.experienceDatabaseUrl)
  : null;
const customerSessions = new RealmSessionStore(
  config.redisUrl,
  "bazarbee:customer-auth:v1",
  config.customerSessionTtlSeconds,
);
const authRateLimiter = new AuthRateLimiter(config.redisUrl);
const opsContext = (() => {
  if (config.opsTotpGate === "off") return null;
  const masterKey = decodeOpsEncryptionKey(config.opsTotpEncryptionKey as string);
  const staff = new OpsStaffStore(config.experienceDatabaseUrl, masterKey);
  const sessions = new OpsSessionStore(
    config.redisUrl,
    "bazarbee:ops-realm:v1",
    config.opsSessionTtlSeconds,
  );
  const verifier = new AccessJwtVerifier({
    teamDomain: config.opsAccessTeamDomain,
    audience: config.opsAccessAudience as string,
  });
  const gate = new OpsGate({ mode: config.opsTotpGate, staff, sessions, verifier });
  const formKey = createHmac("sha256", masterKey).update("ops-form-csrf-v1").digest();
  const groupSync = config.cloudflareAccessSyncEnabled
    ? new CloudflareAccessGroupSync({
        accountId: config.cloudflareAccountId as string,
        apiToken: config.cloudflareAccessApiToken as string,
        staffGroupId: config.cloudflareAccessStaffGroupId as string,
        erpGroupId: config.cloudflareAccessErpGroupId as string,
      })
    : null;
  const medusaInvites = config.medusaInviteAutomationEnabled
    ? new MedusaAdminInvites({
        baseUrl: config.medusaBaseUrl,
        email: config.medusaAdminEmail as string,
        password: config.medusaAdminPassword as string,
        adminBaseUrl: config.publicOpsBaseUrl,
      })
    : null;
  if (medusaInvites) console.info("[ops-invite] Mercur invite automation enabled");
  return { staff, sessions, verifier, gate, formKey, groupSync, medusaInvites };
})();

if (opsContext?.groupSync) {
  const sync = opsContext.groupSync;
  const reconcile = async () => {
    try {
      const staff = await opsContext.staff.list();
      const result = await sync.reconcile(
        staff.map((person) => ({
          email: person.email,
          roles: person.roles,
          status: person.status,
        })),
      );
      if (!result.ok) {
        console.error("[ops-sync] reconciliation failed:", result.errors.join("; "));
      }
    } catch (error) {
      console.error("[ops-sync] reconciliation crashed:", (error as Error).message);
    }
  };
  const boot = setTimeout(reconcile, 15_000) as unknown as { unref?: () => void };
  boot.unref?.();
  const timer = setInterval(reconcile, 5 * 60 * 1000) as unknown as { unref?: () => void };
  timer.unref?.();
}
const pilotAccess = new PilotAccessStore(config.experienceDatabaseUrl);
const pilotAuth = new PilotAuthStore(
  config.redisUrl,
  config.pilotOtpCode,
  config.pilotChallengeTtlSeconds,
  config.pilotSessionTtlSeconds,
);
const emailAuth = new EmailAuthStore(
  config.redisUrl,
  config.emailCodeTtlSeconds,
  config.emailMagicTtlSeconds,
  5,
  config.emailCooldownSeconds,
  config.identityMode === "directory"
    ? "bazarbee:customer-email-auth:v1"
    : "buildkart:email-auth:v1",
);
const emailSender = config.resendApiKey
  ? new ResendEmailSender(config.resendApiKey, config.emailFrom)
  : null;

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
  salesChannelId?: string,
): Promise<{ offers: StoreOffer[]; cacheHit: boolean }> {
  const key = `${offerCacheKey(productIds, context)}|${regionId}`;
  const cached = offerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    offerCacheHits++;
    return { offers: cached.offers, cacheHit: true };
  }
  const offers = await medusa.listOffersByProducts(
    productIds,
    regionId,
    salesChannelId,
  );
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
      "access-control-allow-headers": "authorization, content-type, idempotency-key, x-device-id, x-correlation-id",
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
    return { response: problem(401, "authentication-required", "A bearer session is required.") };
  }
  try {
    if (config.identityMode === "directory") {
      const userId = await customerSessions.resolveSession(token);
      const identity = userId ? await customerIdentity!.get(userId) : null;
      if (!identity || identity.status !== "active") {
        return {
          response: problem(401, "invalid-session", "The session is invalid or expired."),
        };
      }
      return {
        user: {
          id: identity.id,
          email: identity.email,
          name: identity.name,
          ...(identity.phone ? { phone: identity.phone } : {}),
        },
        token,
        authorization: {
          userId: identity.id,
          roles: identity.roles as PilotAuthorization["roles"],
          ...(identity.businessAccountId
            ? { businessAccountId: identity.businessAccountId }
            : {}),
        },
      };
    }
    const userId = await pilotAuth.resolveSession(token);
    const user = userId ? pilotDirectory.get(userId) : undefined;
    let authorization = userId ? pilotAuthorizations.get(userId) : undefined;
    if (userId) {
      // A super-admin update is effective on the next request; if the override store is
      // unavailable the deployment assignment remains the safe fallback.
      const override = await pilotAccess.get(userId).catch(() => undefined);
      if (override) authorization = override;
    }
    if (!user || !authorization) {
      return { response: problem(401, "invalid-session", "The session is invalid or expired.") };
    }
    return { user, token, authorization };
  } catch (error) {
    console.warn("[experience-api] session lookup failed:", (error as Error).message);
    return { response: problem(503, "identity-store-unavailable", "Sessions are temporarily unavailable.") };
  }
}

function identityUser(identity: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}): PilotUser {
  return {
    id: identity.id,
    email: identity.email,
    name: identity.name,
    ...(identity.phone ? { phone: identity.phone } : {}),
  };
}

async function resolveEmailUser(email: string): Promise<PilotUser | null> {
  if (config.identityMode === "directory") {
    const identity = await customerIdentity!.findOrCreate(email);
    return identity ? identityUser(identity) : null;
  }
  return pilotDirectory.find(email) ?? null;
}

async function resolveSessionUser(userId: string): Promise<PilotUser | null> {
  if (config.identityMode === "directory") {
    const identity = await customerIdentity!.get(userId);
    return identity && identity.status === "active" ? identityUser(identity) : null;
  }
  return pilotDirectory.get(userId) ?? null;
}

async function issueUserSession(userId: string): Promise<{
  session_token: string;
  expires_in_seconds: number;
}> {
  if (config.identityMode === "directory") {
    await customerIdentity!.markLogin(userId);
    return customerSessions.issueSession(userId);
  }
  return pilotAuth.issueSession(userId);
}

function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwarded ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function enforceAuthRateLimit(
  req: Request,
  bucket: string,
  options: { ipLimit?: number; deviceLimit?: number; windowSeconds?: number } = {},
): Promise<Response | null> {
  const windowSeconds = options.windowSeconds ?? 600;
  try {
    const ip = await authRateLimiter.hit(
      `${bucket}:ip`,
      clientAddress(req),
      options.ipLimit ?? 10,
      windowSeconds,
    );
    if (!ip.allowed) {
      return problem(429, "rate-limited", "Too many attempts. Try again later.", {
        retry_after_seconds: ip.retryAfterSeconds,
      });
    }
    const device = req.headers.get("x-device-id")?.trim();
    if (device) {
      const result = await authRateLimiter.hit(
        `${bucket}:device`,
        device.slice(0, 200),
        options.deviceLimit ?? 5,
        windowSeconds,
      );
      if (!result.allowed) {
        return problem(429, "rate-limited", "Too many attempts. Try again later.", {
          retry_after_seconds: result.retryAfterSeconds,
        });
      }
    }
    return null;
  } catch (error) {
    console.warn("[experience-api] auth rate limiter unavailable:", (error as Error).message);
    return problem(503, "rate-limit-unavailable", "Sign-in is temporarily unavailable.");
  }
}

function opsHtml(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function opsRedirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function opsSessionCookie(token: string, ttlSeconds: number): string {
  return `${OPS_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSeconds}`;
}

function clearOpsSessionCookie(): string {
  return `${OPS_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeOpsNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value.slice(0, 500);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sameOriginPost(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

async function opsIdentity(req: Request): Promise<{ email: string; sub: string | null } | null> {
  if (!opsContext) return null;
  const verified = await opsContext.verifier.verify(req.headers.get("cf-access-jwt-assertion"));
  return verified.ok ? { email: verified.claims.email, sub: verified.claims.sub } : null;
}

type OpsActor = { email: string; staff: OpsStaff };

async function resolveOpsActor(
  req: Request,
): Promise<{ actor: OpsActor } | { error: "not-configured" | "access" | "session" | "denied" }> {
  if (!opsContext) return { error: "not-configured" };
  const identity = await opsIdentity(req);
  if (!identity) return { error: "access" };
  const session = await opsContext.sessions.resolveSession(
    readCookie(req.headers.get("cookie"), OPS_SESSION_COOKIE),
  );
  if (!session || session.email !== identity.email) return { error: "session" };
  const staff = await opsContext.staff.get(identity.email);
  if (!staff || staff.status !== "active" || !staff.roles.includes("super_admin")) {
    return { error: "denied" };
  }
  return { actor: { email: staff.email, staff } };
}

function opsActorHtmlError(
  error: "not-configured" | "access" | "session" | "denied",
): Response {
  if (error === "session") return opsRedirect("/ops/login?next=/ops/staff");
  if (error === "access") {
    return opsHtml(
      opsNoticePage({
        title: "Access required",
        message: "Open this page through Cloudflare Access.",
      }),
      401,
    );
  }
  if (error === "denied") {
    return opsHtml(
      opsNoticePage({
        title: "No access",
        message: "This account is not an active superadmin.",
      }),
      403,
    );
  }
  return opsHtml(
    opsNoticePage({ title: "Not configured", message: "Ops identity is not enabled." }),
    404,
  );
}

function opsActorJsonError(
  error: "not-configured" | "access" | "session" | "denied",
): Response {
  if (error === "session" || error === "access") {
    return problem(401, "authentication-required", "An ops session is required.");
  }
  if (error === "denied") {
    return problem(403, "forbidden", "An active superadmin is required.");
  }
  return problem(404, "not-found");
}

function lastActiveSuperadmin(staff: OpsStaff[], email: string): boolean {
  const active = staff.filter(
    (person) => person.status === "active" && person.roles.includes("super_admin"),
  );
  return active.length <= 1 && active.some((person) => person.email === email);
}

async function superadminChangeGuard(
  action: "roles" | "status",
  actorEmail: string,
  targetEmail: string,
  roles?: readonly string[],
  status?: string,
): Promise<string | null> {
  if (!opsContext) return "Ops identity is not configured.";
  const all = await opsContext.staff.list();
  if (!all.some((person) => person.email === targetEmail)) {
    return "Staff user not found.";
  }
  const removesSuperadmin =
    (action === "roles" && !roles?.includes("super_admin")) ||
    (action === "status" && status === "disabled");
  if (!removesSuperadmin) return null;
  if (targetEmail === actorEmail) {
    return "You cannot disable yourself or remove your own super_admin role.";
  }
  if (lastActiveSuperadmin(all, targetEmail)) {
    return "The last active superadmin cannot be disabled or demoted.";
  }
  return null;
}

async function syncOpsStaff(person: OpsStaff): Promise<string | null> {
  if (!opsContext?.groupSync) return null;
  const result = await opsContext.groupSync.syncUser({
    email: person.email,
    roles: person.roles,
    status: person.status,
  });
  if (!result.ok) {
    console.error("[ops-sync] Cloudflare group sync failed:", person.email, result.errors.join("; "));
    return "Cloudflare Access group sync failed; the app gate still applies and reconciliation will retry.";
  }
  return null;
}

type MercurInviteResult =
  | { status: "created"; id: string; url: string }
  | { status: "unavailable" }
  | { status: "failed"; error: string };

async function createMercurInvite(email: string): Promise<MercurInviteResult> {
  if (!opsContext?.medusaInvites) return { status: "unavailable" };
  try {
    const invite = await opsContext.medusaInvites.createInvite(email);
    return { status: "created", id: invite.id, url: invite.url };
  } catch (error) {
    console.error("[ops-invite] Mercur invite failed:", email, (error as Error).message);
    return { status: "failed", error: (error as Error).message };
  }
}

async function renderStaffPage(
  actor: OpsActor,
  options: {
    message?: string;
    error?: string;
    inviteUrl?: string;
    inviteEmail?: string;
    inviteWarning?: string;
  } = {},
): Promise<Response> {
  if (!opsContext) return opsActorHtmlError("not-configured");
  const staff = await opsContext.staff.list();
  const requests = await opsContext.staff.listPendingRequests();
  return opsHtml(
    opsStaffPage({
      actorEmail: actor.email,
      staff,
      requests,
      csrf: issueFormToken(actor.email, opsContext.formKey),
      ...options,
    }),
  );
}

function requestedRoles(payload: Record<string, unknown>): OpsStaffRole[] {
  return Array.isArray(payload.roles) ? (payload.roles.map(String) as OpsStaffRole[]) : [];
}

/**
 * Superadmin create, role changes, disable/enable and TOTP reset need a different active
 * superadmin. Promoting a non-superadmin to superadmin is also sensitive.
 */
function needsSecondApproval(
  action: "create" | "roles" | "status" | "reset_totp",
  target: OpsStaff | null,
  roles: readonly string[] = [],
): boolean {
  if (action === "create") return roles.includes("super_admin");
  if (!target) return false;
  if (target.roles.includes("super_admin")) return true;
  if (action === "roles") return roles.includes("super_admin");
  return false;
}

/**
 * Staging-only service identity for the Mercur admin console proxy. The shared secret is never
 * accepted unless configured, and the resulting actor is always an operator, never a customer.
 */
function serviceOperatorAuthentication(req: Request): AuthenticationResult | null {
  const expected = config.adminServiceSecret;
  if (!expected) return null;
  // A trusted request carrying a seller scope is a Seller portal identity, never an operator.
  // This prevents the shared proxy secret from collapsing the Admin/Seller authority boundary.
  if (req.headers.get("x-buildkart-seller-id")?.trim()) return null;
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
  const sellerService = serviceSellerAuthentication(req);
  if (sellerService && !("response" in sellerService)) {
    return {
      response: problem(403, "operator-required", "Seller-scoped service identity cannot access operator routes."),
    };
  }
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
    if (!userId || !pilotDirectory.get(userId)) return undefined;
    const override = await pilotAccess.get(userId).catch(() => undefined);
    return override ?? pilotAuthorizations.get(userId);
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

function productComposeOptions(
  product: StoreProduct,
  channel: "b2b" | "b2c",
): ComposeOptions {
  return {
    channel,
    b2bPricing:
      channel === "b2b"
        ? ((product.metadata?.buildkart_b2b_pricing ?? {}) as Record<
            string,
            B2bPricingSnapshot
          >)
        : null,
  };
}

function productCommercialReadiness(
  product: StoreProduct,
  offers: StoreOffer[],
  channel: "b2b" | "b2c",
) {
  const composeOptions = productComposeOptions(product, channel);
  const composed = composeOffers(offers, composeOptions);
  const priced = composed.offerViews.some(
    (offer) =>
      offer.unit_amount_minor !== null && offer.unit_amount_minor > 0,
  );
  const stocked = composed.offerViews.some(
    (offer) =>
      offer.in_stock === true &&
      offer.unit_amount_minor !== null &&
      offer.unit_amount_minor > 0,
  );
  return {
    composeOptions,
    ...composed,
    gates: {
      published_and_channel: true,
      offer: offers.length > 0,
      price: priced,
      stock: stocked,
    },
    visible: composed.selected !== null,
  };
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
  if (/^\/v1\/admin\/cod(?:\/|$)/.test(pathname)) {
    return ["marketplace_operator", "finance_operator", "super_admin"];
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
    const scopedEvents = record.events.map((event) => {
      if (event.eventType === "return.refund_simulation_recorded") {
        return {
          ...event,
          detail: {
            status: event.detail.status,
            test_data: true,
            simulated: true,
            money_effect: "none",
            stock_effect: "none",
          },
        };
      }
      const detail = { ...event.detail };
      if (Array.isArray(detail.lines)) {
        detail.lines = detail.lines.filter((line) =>
          Boolean(
            line &&
              typeof line === "object" &&
              lineKeys.has(String((line as { lineKey?: unknown; line_key?: unknown }).lineKey ??
                (line as { line_key?: unknown }).line_key ?? "")),
          )
        );
      }
      if (Array.isArray(detail.approved_lines)) {
        detail.approved_lines = detail.approved_lines.filter((line) =>
          Boolean(
            line &&
              typeof line === "object" &&
              lineKeys.has(String((line as { lineKey?: unknown; line_key?: unknown }).lineKey ??
                (line as { line_key?: unknown }).line_key ?? "")),
          )
        );
      }
      return { ...event, detail };
    });
    scoped.push({
      ...record,
      lines,
      events: scopedEvents,
      refundSimulation: null,
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
  const sellerService = serviceSellerAuthentication(req);
  if (sellerService && !("response" in sellerService)) {
    return {
      response: problem(403, "operator-required", "Seller-scoped service identity cannot access operator routes."),
    };
  }
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

/** Cart metadata key holding the per-seller delivery lines applied by this API. */
const CART_DELIVERY_LINES_KEY = "delivery_lines";
const CART_DELIVERY_PINCODE_KEY = "delivery_pincode";

export type DeliveryLine = {
  seller_id: string | null;
  seller_name?: string | null;
  option_id: string | null;
  name: string;
  amount: number;
  status: "applied" | "unavailable";
};

export type CartDelivery = {
  pincode: string | null;
  lines: DeliveryLine[];
  total: number;
};

/**
 * One flat Delivery option per seller (U-009 D4). The cart stores the resolved
 * lines in metadata so every cart response can render the per-seller fee
 * without a second upstream call.
 */
function deliveryFromMetadata(cart: StoreCart): CartDelivery {
  const raw = cart.metadata?.[CART_DELIVERY_LINES_KEY];
  const lines: DeliveryLine[] = Array.isArray(raw)
    ? (raw as DeliveryLine[]).filter(
        (line) =>
          line &&
          typeof line === "object" &&
          (line.status === "applied" || line.status === "unavailable"),
      )
    : [];
  const pincode =
    typeof cart.metadata?.[CART_DELIVERY_PINCODE_KEY] === "string"
      ? (cart.metadata?.[CART_DELIVERY_PINCODE_KEY] as string)
      : null;
  return {
    pincode,
    lines,
    total: lines.reduce(
      (sum, line) => sum + (line.status === "applied" ? line.amount : 0),
      0,
    ),
  };
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
  // U-003: FLAT5 is a normal code promotion applied by this API, so the engine reports it as
  // non-automatic. The cart view carries the store-applied marker from cart metadata, which is
  // what lets the app offer an honest remove action.
  const autoCode = automaticOfferCode(cart);
  const promotions = (cart.promotions ?? []).map((promotion) => ({
    code: promotion.code,
    label: promotionLabel(promotion.code),
    is_automatic:
      Boolean(promotion.is_automatic) ||
      (autoCode !== null && promotion.code.toLowerCase() === autoCode.toLowerCase()),
  }));
  return {
    ...cart,
    items,
    delivery: deliveryFromMetadata(cart),
    total: medusaToMinorOr(cart.total),
    shipping_total: medusaToMinorOr(cart.shipping_total),
    // Stable storefront semantics: "subtotal" is products only. Preserve the
    // engine's shipping-inclusive subtotal separately for audit/debugging.
    subtotal: itemSubtotal,
    item_subtotal: itemSubtotal,
    engine_subtotal: medusaToMinorOr(cart.subtotal),
    promotions,
    auto_offer:
      autoCode !== null && promotions.some((promotion) => promotion.is_automatic)
        ? { code: autoCode, label: promotionLabel(autoCode), removable: true }
        : null,
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

/** Code the Experience API applies on the customer's behalf (U-003 D5: FLAT5, shown as Flat5%). */
const AUTOMATIC_OFFER_CODE = "FLAT5";
/** Cart metadata: the code this API applied automatically, or null once the customer chooses. */
const AUTOMATIC_OFFER_APPLIED_KEY = "auto_offer_applied_code";
/** Cart metadata: the customer removed or replaced the offer, so it must not return (D2). */
const AUTOMATIC_OFFER_OPT_OUT_KEY = "auto_offer_opt_out";
/** Display labels where the engine code is not the customer-facing label. */
const PROMOTION_LABELS: Record<string, string> = { FLAT5: "Flat5%" };

function promotionLabel(code: string): string {
  return PROMOTION_LABELS[code.toUpperCase()] ?? code;
}

function automaticOfferCode(cart: StoreCart): string | null {
  const value = cart.metadata?.[AUTOMATIC_OFFER_APPLIED_KEY];
  return typeof value === "string" && value ? value : null;
}

function appliedPromotionCodes(cart: StoreCart): string[] {
  return [...new Set((cart.promotions ?? []).map((promotion) => promotion.code))];
}

function hasPromotionCode(cart: StoreCart, code: string): boolean {
  return (cart.promotions ?? []).some(
    (promotion) => promotion.code.toLowerCase() === code.toLowerCase(),
  );
}

/** Cart metadata plus the offer state a write is about to persist. */
function offerMetadata(
  cart: StoreCart,
  state: { appliedCode: string | null; optedOut: boolean },
): Record<string, unknown> {
  return {
    ...(cart.metadata ?? {}),
    [AUTOMATIC_OFFER_APPLIED_KEY]: state.appliedCode,
    [AUTOMATIC_OFFER_OPT_OUT_KEY]: state.optedOut,
  };
}

/**
 * Apply FLAT5 to a cart that has lines and no offer yet (U-003).
 *
 * The engine cannot make an automatic promotion removable: it re-applies it on every
 * recalculation. So the API owns the "automatic" behaviour and records the applied code in cart
 * metadata. A failed apply never blocks the cart; the view only advertises what the engine
 * actually granted.
 */
async function applyAutomaticOffer(cartId: string, cart: StoreCart): Promise<StoreCart> {
  if ((cart.items ?? []).length === 0) return cart;
  if ((cart.promotions ?? []).length > 0) return cart;
  if (cart.metadata?.[AUTOMATIC_OFFER_OPT_OUT_KEY] === true) return cart;
  try {
    const applied = await medusa.addPromotion(cartId, AUTOMATIC_OFFER_CODE);
    if (!hasPromotionCode(applied, AUTOMATIC_OFFER_CODE)) return cart;
    const metadata = offerMetadata(
      { ...cart, ...applied, metadata: { ...(cart.metadata ?? {}), ...(applied.metadata ?? {}) } },
      { appliedCode: AUTOMATIC_OFFER_CODE, optedOut: false },
    );
    try {
      await medusa.updateCartMetadata(cartId, metadata);
    } catch {
      // The engine already granted the discount; a metadata write failure must not hide it.
    }
    return { ...applied, metadata };
  } catch {
    return cart;
  }
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
<title>BazarBee Ops — Staging</title>
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
<h1>BazarBee Ops Console <span class="badge">staging · simulated payment</span></h1>
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

/**
 * Shared completion path for signed-in and guest checkouts.
 *
 * The cart is already assembled and owned by the caller. A guest completion records no owner, but
 * stores the guest email/mobile on the order group so operations and delivery have a contact.
 */
async function completeCanonicalCart(input: {
  cartId: string;
  regionId: string;
  cid: string;
  ownerUserId?: string;
  guest?: { email: string; mobile: string };
  payment?: {
    collectionId: string;
    sessionId: string;
    providerId: string;
    providerPaymentId?: string;
    providerStatus?: string;
    /** Prepaid gateway or seller-collected cash. */
    method?: "prepaid" | "cod";
    expectedMinor?: number;
  };
}): Promise<Response> {
  const { cartId, regionId, cid, ownerUserId, guest, payment } = input;
  return correlation.withCheckoutLock(cartId, async () => {
    // Mercur 2.3.4's split workflow can create a second group if invoked again after success.
    // Stop retries here and return the first persisted canonical completion snapshot.
    const existingCompletion = await correlation.get(cartId);
    if (existingCompletion?.medusa_order_group_id) {
      const existingGroup = existingCompletion.medusa_order_group as
        | Record<string, unknown>
        | null;
      const existingAmounts = (existingGroup?.amounts ?? {}) as Record<string, unknown>;
      return json({
        type: "order_group",
        order_group: existingCompletion.medusa_order_group ?? {
          id: existingCompletion.medusa_order_group_id,
          cart_id: cartId,
        },
        order_number: (existingGroup?.customer_reference as string | undefined) ?? null,
        total_minor: existingAmounts.total ?? null,
        payment: existingCompletion.payment_evidence,
        environment: config.environment,
        test_data:
          (existingCompletion.payment_evidence as { test_data?: boolean } | null)?.test_data ===
          true,
        payment_mode: config.paymentAdapterMode,
        correlation_id: cid,
        idempotent_replay: true,
      });
    }

    const cart = await medusa.getCart(cartId);
    const isCod = input.payment?.method === "cod";
    const paymentMode = input.payment ? (isCod ? "cod" : "provider") : "simulated";
    if (!cart.completed_at) {
      await medusa.updateCartMetadata(cartId, {
        ...(cart.metadata ?? {}),
        payment_mode: paymentMode,
        ...(isCod ? { cod_status: "pending" } : {}),
        test_data:
          paymentMode === "simulated" || (isCod && config.environment !== "production"),
      });
    }

    // In provider mode the browser has already created a Razorpay session. Reuse that exact
    // collection/session so completion verifies the payment the buyer actually made.
    let paymentCollection: StorePaymentCollection | undefined;
    let paymentSession: StorePaymentSession | undefined;
    if (input.payment) {
      // The store API does not expose a payment-collection read. Medusa owns the session and
      // completeCart resolves it internally; we only need the ids and the verified Razorpay
      // evidence returned by the caller.
      paymentCollection = {
        id: input.payment.collectionId,
        currency_code: "inr",
        amount: 0,
        payment_sessions: [],
      };
      paymentSession = {
        id: input.payment.sessionId,
        provider_id: input.payment.providerId,
        status: "pending",
        amount: 0,
        data: isCod
          ? {
              payment_mode: "cod",
              provider: "cod",
              cod_status: "pending",
              test_data: config.environment !== "production",
              cod_amount_minor: input.payment.expectedMinor ?? 0,
            }
          : {
              payment_mode: "provider",
              test_data: Boolean(config.razorpayKeyId?.startsWith("rzp_test")),
              ...(input.payment.providerPaymentId
                ? { razorpay_payment_id: input.payment.providerPaymentId }
                : {}),
              ...(input.payment.providerStatus
                ? { razorpay_status: input.payment.providerStatus }
                : {}),
            },
      };
    } else {
      // Simulated staging/local path: reuse an amount-matched simulated session on retries so an
      // authorization is never replaced.
      paymentCollection = await medusa.createPaymentCollection(cartId);
      paymentSession = findValidSimulatedSession(paymentCollection);
      if (!paymentSession) {
        paymentCollection = await medusa.createPaymentSession(
          paymentCollection.id,
          SIMULATED_PAYMENT_PROVIDER_ID,
        );
        paymentSession = findValidSimulatedSession(paymentCollection);
      }
    }
    if (!paymentCollection || !paymentSession) {
      throw new Error("The payment session could not be initialized.");
    }

    const result = await medusa.completeCart(cartId);
    if (result.type === "order_group") {
      const paymentIsTest =
        paymentMode === "simulated" || paymentSession.data?.test_data === true;
      const paymentEvidence = {
        payment_collection_id: paymentCollection.id,
        payment_session_id: paymentSession.id,
        provider_id: paymentSession.provider_id,
        payment_mode: paymentMode,
        test_data: paymentIsTest,
        ...(isCod
          ? {
              provider_status: "authorized",
              provider_payment_id: null,
              provider_order_id: null,
              cod_status: "pending",
              expected_minor: input.payment?.expectedMinor ?? medusaToMinor(cart.total),
              collected_minor: 0,
            }
          : paymentMode === "provider"
            ? {
                provider_payment_id: input.payment?.providerPaymentId ?? null,
                provider_order_id: input.payment?.providerPaymentId
                  ? String(cart.metadata?.razorpay_order_id ?? "")
                  : null,
                provider_status: input.payment?.providerStatus ?? null,
              }
            : {}),
      };
      const productIds = [
        ...new Set(
          (cart.items ?? [])
            .map((item) => item.product_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const completionOffers = await medusa.listOffersByProducts(productIds, regionId);
      const offerById = new Map(completionOffers.map((offer) => [offer.id, offer]));
      const orderGroupPayload = {
        ...(result.order_group ?? {}),
        ...(guest
          ? {
              guest_checkout: true,
              guest_contact: { email: guest.email, mobile: guest.mobile },
            }
          : {}),
        destination_postcode:
          (cart as { shipping_address?: StoreAddress }).shipping_address?.postal_code ?? null,
        // Buyer-visible delivery address, stored once at completion so the
        // order page can show where the order ships (B2C + B2B).
        shipping_address:
          (cart as { shipping_address?: StoreAddress }).shipping_address ?? null,
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
          (result.order_group as { created_at?: string } | undefined)?.created_at ?? null,
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
      // Reserve every ordered line in Tryton before the completion is recorded. The order is
      // already canonical in Medusa; a failed reservation is surfaced as an ERP mismatch, not
      // as a lost order, so the operator can recover from the reconciliation queue.
      const reservationMoves: Array<{
        move_id: number;
        sku: string;
        quantity: number;
        line_id?: string;
      }> = [];
      for (const item of cart.items ?? []) {
        const offer = item.metadata?.offer_id
          ? offerById.get(item.metadata.offer_id)
          : undefined;
        const sku = item.sku ?? offer?.sku ?? item.variant_id;
        if (!sku) continue;
        try {
          await erp.syncVariant(
            sku,
            item.product_title ?? item.title ?? sku,
            medusaToMinorOr(item.unit_price),
          );
          const moveId = await erp.reserve(`${cartId}:${item.id}`, sku, item.quantity);
          await erp.commit(moveId);
          reservationMoves.push({
            move_id: moveId,
            sku,
            quantity: item.quantity,
            line_id: item.id,
          });
          await events.append({
            event_type: "inventory.reservation_created",
            aggregate_type: "checkout",
            aggregate_id: cartId,
            correlation_id: cid,
            payload: {
              sku,
              quantity: item.quantity,
              tryton_move_id: moveId,
              order_group_id: result.order_group?.id ?? null,
            },
          });
        } catch (error) {
          console.warn(
            `[experience-api] Tryton reservation failed for ${sku}:`,
            (error as Error).message,
          );
        }
      }
      await correlation.link(cartId, {
        orderGroup: result.order_group?.id,
        orderGroupPayload,
        paymentEvidence,
        trytonMove: reservationMoves[0]?.move_id,
        trytonMoves: reservationMoves.length > 0 ? reservationMoves : undefined,
        ...(ownerUserId ? { ownerUserId } : {}),
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
          ...(guest ? { guest_checkout: true, guest_contact: orderGroupPayload.guest_contact } : {}),
        },
      });
      return json({
        type: "order_group",
        order_group: result.order_group,
        order_number: orderGroupPayload.customer_reference,
        total_minor: orderGroupPayload.amounts.total,
        payment: paymentEvidence,
        environment: config.environment,
        test_data: paymentIsTest,
        payment_mode: paymentMode,
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
        payment_mode: paymentMode,
        test_data: paymentMode === "simulated" || paymentSession.data?.test_data === true,
      },
      environment: config.environment,
      test_data: paymentMode === "simulated" || paymentSession.data?.test_data === true,
      correlation_id: cid,
    });
  });
}

/** Assemble a guest B2C cart with contact, delivery and one promotion. */
async function prepareGuestCart(input: {
  lines: Array<{ offerId: string; quantity: number }>;
  email: string;
  mobile?: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  promoCode?: string;
}, onCartCreated?: (cartId: string) => Promise<void>): Promise<StoreCart> {
  const cart = await medusa.createCart(config.medusaRegionId, "inr");
  if (onCartCreated) await onCartCreated(cart.id);
  await medusa.updateCartMetadata(cart.id, {
    ...(cart.metadata ?? {}),
    channel: "b2c",
    guest_checkout: true,
    guest_email: input.email,
    ...(input.mobile ? { guest_mobile: input.mobile } : {}),
  });
  for (const line of input.lines) {
    await medusa.addLineItem(cart.id, line.offerId, line.quantity);
  }
  const withOffer = await applyAutomaticOffer(cart.id, await medusa.getCart(cart.id));
  await medusa.updateCartCustomerDetails(cart.id, {
    email: input.email,
    shipping_address: {
      first_name: input.firstName,
      last_name: input.lastName,
      address_1: input.address1,
      city: input.city,
      postal_code: input.postalCode,
      country_code: "in",
      ...(input.mobile ? { phone: input.mobile } : {}),
    },
  });
  if (input.promoCode) {
    for (const code of appliedPromotionCodes(withOffer)) {
      try {
        await medusa.removePromotion(cart.id, code);
      } catch {
        // The replacement below still validates what the engine actually grants.
      }
    }
    const applied = await medusa.addPromotion(cart.id, input.promoCode);
    if (!hasPromotionCode(applied, input.promoCode)) {
      throw Object.assign(new Error("That promo code is not eligible for this order."), {
        code: "promotion-rejected",
      });
    }
  }
  return applyDeliveryForCart(cart.id);
}

async function applyDeliveryForCart(cartId: string): Promise<StoreCart> {
  const options = await medusa.listShippingOptions(cartId);
  const current = await medusa.getCart(cartId);
  // Medusa lists calculated options for every seller in the sales channel, not
  // only the sellers present in this cart. Applying all of them would charge a
  // delivery fee for sellers with no items, so scope to the cart's own sellers.
  const cartSellerIds = new Set(
    (current.items ?? [])
      .map((item) => item.seller_id)
      .filter((sellerId): sellerId is string => Boolean(sellerId)),
  );

  const bySeller = new Map<string, StoreShippingOption[]>();
  for (const option of options) {
    if (cartSellerIds.size > 0 && !cartSellerIds.has(option.seller_id)) {
      continue;
    }
    const list = bySeller.get(option.seller_id) ?? [];
    list.push(option);
    bySeller.set(option.seller_id, list);
  }

  const lines: DeliveryLine[] = [];
  const sellerNames = await medusa.listSellerNames();
  let cart = current;
  for (const [sellerId, sellerOptions] of bySeller) {
    const option =
      sellerOptions.find(
        (candidate) => candidate.provider_id === "pincode_pincode",
      ) ?? sellerOptions.find((candidate) => /delivery/i.test(candidate.name));
    if (!option) {
      lines.push({
        seller_id: sellerId,
        seller_name: sellerNames[sellerId] ?? null,
        option_id: null,
        name: "Delivery",
        amount: 0,
        status: "unavailable",
      });
      continue;
    }
    cart = await medusa.addShippingMethod(cartId, option.id);
    lines.push({
      seller_id: sellerId,
      seller_name: sellerNames[sellerId] ?? null,
      option_id: option.id,
      name: option.name,
      amount: medusaToMinorOr(option.amount),
      status: "applied",
    });
  }

  // The Mercur store shipping-options workflow prices flat options from the
  // Pricing Module and leaves calculated options unpriced, so the applied
  // method on the cart is the authoritative amount for a calculated fee.
  const refreshed = await medusa.getCart(cartId);
  const methods = refreshed.shipping_methods ?? [];
  for (const line of lines) {
    if (!line.option_id) continue;
    const method = methods.find(
      (candidate) => candidate.shipping_option_id === line.option_id,
    );
    if (method) line.amount = medusaToMinorOr(method.amount);
  }

  return medusa.updateCartMetadata(cartId, {
    [CART_DELIVERY_LINES_KEY]: lines,
    [CART_DELIVERY_PINCODE_KEY]: refreshed.shipping_address?.postal_code ?? null,
  });
}

type RazorpayCartInput = {
  lines: Array<{ offerId: string; quantity: number }>;
  email: string;
  mobile?: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  promoCode?: string;
  channel: "b2c" | "b2b";
  regionId: string;
  customerEmail?: string;
  businessAccountId?: string;
};

async function razorpayCapturedPayment(orderId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  currency: string;
} | null> {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error("Razorpay is not configured.");
  }
  const auth = Buffer.from(
    `${config.razorpayKeyId}:${config.razorpayKeySecret}`,
  ).toString("base64");
  const response = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`,
    {
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error(`Razorpay order lookup failed (${response.status}).`);
  const data = (await response.json()) as {
    items?: Array<{ id: string; status: string; amount: number; currency: string }>;
  };
  const payments = data.items ?? [];
  return (
    payments.find((payment) => payment.status === "captured") ??
    payments.find((payment) => payment.status === "authorized") ??
    null
  );
}

type CheckoutTokenPayload = {
  cartId: string;
  collectionId: string;
  sessionId: string;
  email: string;
  mobile: string;
  exp: number;
};

function signCheckoutToken(payload: CheckoutTokenPayload): string {
  const secret = config.razorpayKeySecret;
  if (!secret) throw new Error("Razorpay is not configured.");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyCheckoutToken(token: string): CheckoutTokenPayload | null {
  const secret = config.razorpayKeySecret;
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as CheckoutTokenPayload;
    if (
      !payload.cartId ||
      !payload.collectionId ||
      !payload.sessionId ||
      !payload.email ||
      !payload.mobile ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Create the cart, delivery and Razorpay order before the browser opens Checkout. */
async function prepareRazorpayCart(input: RazorpayCartInput): Promise<{
  cart: StoreCart;
  collection: StorePaymentCollection;
  session: StorePaymentSession;
  orderId: string;
  keyId: string;
  amountMinor: number;
  currency: string;
}> {
  const cart = await medusa.createCart(
    // Canonical carts use the India delivery region for both channels; the B2B region has no
    // countries and cannot accept an address.
    config.medusaRegionId,
    "inr",
    input.customerEmail ? { customerEmail: input.customerEmail } : {},
  );
  await medusa.updateCartMetadata(cart.id, {
    ...(cart.metadata ?? {}),
    channel: input.channel,
    ...(input.channel === "b2b" && input.businessAccountId
      ? { business_account_id: input.businessAccountId }
      : {}),
    ...(input.mobile ? { guest_mobile: input.mobile } : {}),
  });
  for (const line of input.lines) {
    await medusa.addLineItem(cart.id, line.offerId, line.quantity);
  }
  const withOffer = await applyAutomaticOffer(cart.id, await medusa.getCart(cart.id));
  await medusa.updateCartCustomerDetails(cart.id, {
    email: input.email,
    shipping_address: {
      first_name: input.firstName,
      last_name: input.lastName,
      address_1: input.address1,
      city: input.city,
      postal_code: input.postalCode,
      country_code: "in",
      ...(input.mobile ? { phone: input.mobile } : {}),
    },
  });
  if (input.promoCode) {
    for (const code of appliedPromotionCodes(withOffer)) {
      try {
        await medusa.removePromotion(cart.id, code);
      } catch {
        // The add below still validates what the engine grants.
      }
    }
    const applied = await medusa.addPromotion(cart.id, input.promoCode);
    if (!hasPromotionCode(applied, input.promoCode)) {
      throw Object.assign(new Error("That promo code is not eligible for this order."), {
        code: "promotion-rejected",
      });
    }
  }
  const delivered = await applyDeliveryForCart(cart.id);
  const collection = await medusa.createPaymentCollection(cart.id);
  const withSession = await medusa.createPaymentSession(
    collection.id,
    RAZORPAY_PAYMENT_PROVIDER_ID,
  );
  const session = withSession.payment_sessions.find(
    (candidate) => candidate.provider_id === RAZORPAY_PAYMENT_PROVIDER_ID,
  );
  if (!session) throw new Error("Razorpay payment session was not created.");
  const orderId = String(session.data?.razorpay_order_id ?? "");
  const keyId = String(session.data?.razorpay_key_id ?? "");
  if (!orderId || !keyId) {
    throw new Error("Razorpay order id or public key is missing.");
  }
  await medusa.updateCartMetadata(cart.id, {
    ...(delivered.metadata ?? {}),
    razorpay_order_id: orderId,
    razorpay_payment_session_id: session.id,
  });
  return {
    cart: delivered,
    collection: withSession,
    session,
    orderId,
    keyId,
    amountMinor: Math.round(Number(session.amount ?? 0) * 100),
    currency: String(session.data?.razorpay_currency ?? "INR").toUpperCase(),
  };
}

type CodCartInput = RazorpayCartInput & { buyerScope?: string };

/** Order-value caps in paise. Server-side only; the browser cannot raise them. */
const COD_B2C_CAP_MINOR = Number(process.env.COD_B2C_MAX_MINOR ?? "2000000");
const COD_B2B_CAP_MINOR = Number(process.env.COD_B2B_MAX_MINOR ?? "5000000");
const COD_BUYER_DAILY_CAP_MINOR = Number(process.env.COD_BUYER_DAILY_CAP_MINOR ?? "5000000");
const COD_SELLER_DAILY_CAP_MINOR = Number(process.env.COD_SELLER_DAILY_CAP_MINOR ?? "20000000");
const COD_TCS_RATE_BPS = 50;
const BAZARBEE_GST_RATE_BPS = 1800;

/**
 * Enforce the seller policy and daily caps before a COD session exists. Every rule is evaluated
 * server-side against the canonical cart; the client cannot opt a seller in or raise a cap.
 */
async function assertCodEligible(input: {
  postalCode: string;
  buyerScope: string;
  totalMinor: number;
  items: NonNullable<StoreCart["items"]>;
}): Promise<void> {
  const productIds = [
    ...new Set(
      input.items
        .map((item) => item.product_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const offers =
    productIds.length > 0
      ? await medusa.listOffersByProducts(productIds, config.medusaRegionId)
      : [];
  const offerById = new Map(offers.map((offer) => [offer.id, offer]));
  const sellerOf = (item: NonNullable<StoreCart["items"]>[number]): string | null => {
    if (typeof item.seller_id === "string" && item.seller_id) return item.seller_id;
    const offerId = item.metadata?.offer_id;
    return typeof offerId === "string" ? (offerById.get(offerId)?.seller_id ?? null) : null;
  };
  const sellerIds = [
    ...new Set(
      input.items
        .map((item) => sellerOf(item))
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (sellerIds.length === 0) {
    throw Object.assign(new Error("This cart has no seller eligible for cash on delivery."), {
      code: "cod-not-eligible",
    });
  }
  const policies = await Promise.all(sellerIds.map((sellerId) => codStore.getPolicy(sellerId)));
  for (let index = 0; index < sellerIds.length; index += 1) {
    const policy = policies[index];
    if (!policy?.enabled) {
      throw Object.assign(
        new Error("Cash on delivery is not enabled for a seller in this cart."),
        { code: "cod-not-eligible" },
      );
    }
    if (policy.pincodes.length > 0 && !policy.pincodes.includes(input.postalCode)) {
      throw Object.assign(
        new Error("Cash on delivery is not available for this delivery postcode."),
        { code: "cod-not-eligible" },
      );
    }
    if (policy.max_order_minor && input.totalMinor > Number(policy.max_order_minor)) {
      throw Object.assign(
        new Error("This order is above the seller's cash-on-delivery limit."),
        { code: "cod-not-eligible" },
      );
    }
    const sellerCap = policy.seller_daily_cap_minor
      ? Number(policy.seller_daily_cap_minor)
      : COD_SELLER_DAILY_CAP_MINOR;
    if (
      sellerCap > 0 &&
      (await codStore.sellerDailyTotal(sellerIds[index])) + input.totalMinor > sellerCap
    ) {
      throw Object.assign(
        new Error("This seller has reached today's cash-on-delivery limit."),
        { code: "cod-not-eligible" },
      );
    }
  }

  const buyerCap =
    policies
      .map((policy) => (policy?.buyer_daily_cap_minor ? Number(policy.buyer_daily_cap_minor) : null))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0] ?? COD_BUYER_DAILY_CAP_MINOR;
  if (buyerCap > 0 && (await codStore.buyerDailyTotal(input.buyerScope)) + input.totalMinor > buyerCap) {
    throw Object.assign(new Error("Today's cash-on-delivery limit for this buyer is reached."), {
      code: "cod-not-eligible",
    });
  }

  const categoryCache = new Map<string, string[]>();
  for (const item of input.items) {
    const sellerId = sellerOf(item) ?? "";
    const policy = policies[sellerIds.indexOf(sellerId)];
    if (!policy || policy.blocked_category_ids.length === 0 || !item.product_id) continue;
    let categoryIds = categoryCache.get(item.product_id);
    if (!categoryIds) {
      try {
        const product = await medusa.getProduct(item.product_id);
        categoryIds = (product.categories ?? []).map((category) => category.id);
      } catch {
        categoryIds = [];
      }
      categoryCache.set(item.product_id, categoryIds);
    }
    if (categoryIds.some((id) => policy.blocked_category_ids.includes(id))) {
      throw Object.assign(
        new Error("Cash on delivery is not available for a product in this cart."),
        { code: "cod-not-eligible" },
      );
    }
  }
}


/**
 * Build a COD cart and authorise a cash-due session. The order is completed immediately, but no
 * money moves: the seller collects at delivery and the order stays `cod_pending`.
 */
async function prepareCodCart(input: CodCartInput): Promise<{
  cart: StoreCart;
  collection: StorePaymentCollection;
  session: StorePaymentSession;
  amountMinor: number;
  currency: string;
  capMinor: number;
}> {
  const cart = await medusa.createCart(
    // A Medusa country belongs to one region. The B2B region is a read-side pricing context with
    // no countries, so a canonical cart (B2C or B2B) must use the India delivery region.
    config.medusaRegionId,
    "inr",
    input.customerEmail ? { customerEmail: input.customerEmail } : {},
  );
  await medusa.updateCartMetadata(cart.id, {
    ...(cart.metadata ?? {}),
    channel: input.channel,
    payment_method: "cod",
    cod_status: "pending",
    ...(input.channel === "b2b" && input.businessAccountId
      ? { business_account_id: input.businessAccountId }
      : {}),
    ...(input.mobile ? { guest_mobile: input.mobile } : {}),
  });
  for (const line of input.lines) {
    await medusa.addLineItem(cart.id, line.offerId, line.quantity);
  }
  const withOffer = await applyAutomaticOffer(cart.id, await medusa.getCart(cart.id));
  await medusa.updateCartCustomerDetails(cart.id, {
    email: input.email,
    shipping_address: {
      first_name: input.firstName,
      last_name: input.lastName,
      address_1: input.address1,
      city: input.city,
      postal_code: input.postalCode,
      country_code: "in",
      ...(input.mobile ? { phone: input.mobile } : {}),
    },
  });
  if (input.promoCode) {
    for (const code of appliedPromotionCodes(withOffer)) {
      try {
        await medusa.removePromotion(cart.id, code);
      } catch {
        // The add below still validates what the engine grants.
      }
    }
    const applied = await medusa.addPromotion(cart.id, input.promoCode);
    if (!hasPromotionCode(applied, input.promoCode)) {
      throw Object.assign(new Error("That promo code is not eligible for this order."), {
        code: "promotion-rejected",
      });
    }
  }
  const delivered = await applyDeliveryForCart(cart.id);
  const totalMinor = medusaToMinor(delivered.total) ?? 0;
  if (totalMinor <= 0) {
    throw Object.assign(new Error("The order total could not be calculated."), {
      code: "cod-not-eligible",
    });
  }
  const capMinor = input.channel === "b2b" ? COD_B2B_CAP_MINOR : COD_B2C_CAP_MINOR;
  if (!Number.isFinite(capMinor) || capMinor <= 0 || totalMinor > capMinor) {
    throw Object.assign(
      new Error(
        input.channel === "b2b"
          ? "This order is above the cash-on-delivery limit for trade orders. Pay online instead."
          : "This order is above the cash-on-delivery limit. Pay online instead.",
      ),
      { code: "cod-not-eligible" },
    );
  }
  await assertCodEligible({
    postalCode: input.postalCode,
    buyerScope: input.buyerScope ?? input.email,
    totalMinor,
    items: delivered.items ?? [],
  });
  const collection = await medusa.createPaymentCollection(cart.id);
  const withSession = await medusa.createPaymentSession(collection.id, COD_PAYMENT_PROVIDER_ID);
  const session = withSession.payment_sessions.find(
    (candidate) => candidate.provider_id === COD_PAYMENT_PROVIDER_ID,
  );
  if (!session) throw new Error("COD payment session was not created.");
  await medusa.updateCartMetadata(cart.id, {
    ...(delivered.metadata ?? {}),
    payment_method: "cod",
    cod_status: "pending",
    cod_amount_minor: totalMinor,
    cod_payment_session_id: session.id,
  });
  return {
    cart: delivered,
    collection: withSession,
    session,
    amountMinor: totalMinor,
    currency: String(delivered.currency_code ?? "inr").toUpperCase(),
    capMinor,
  };
}

/**
 * Validate the shared checkout fields. Kept beside the COD flow so prepaid validation is untouched
 * until both paths are refactored together.
 */
type ParsedCheckoutFields = {
  channel: "b2c" | "b2b";
  lines: Array<{ offerId: string; quantity: number; channel: "b2c" | "b2b" }>;
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
};

function parseCheckoutFields(
  body: Record<string, unknown>,
):
  | { ok: true; fields: ParsedCheckoutFields }
  | { ok: false; status: number; code: string; message: string } {
  const channel = body.channel === "b2b" ? "b2b" : "b2c";
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const entry = line as { offerId?: unknown; quantity?: unknown; channel?: unknown };
      const offerId = typeof entry.offerId === "string" ? entry.offerId.trim() : "";
      const quantity = Number(entry.quantity);
      if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return null;
      }
      return {
        offerId,
        quantity,
        channel: entry.channel === "b2b" ? ("b2b" as const) : ("b2c" as const),
      };
    })
    .filter(
      (line): line is { offerId: string; quantity: number; channel: "b2c" | "b2b" } =>
        line !== null,
    );
  if (lines.length === 0) {
    return { ok: false, status: 400, code: "empty-cart", message: "The cart is empty." };
  }
  if (lines.length > 30) {
    return {
      ok: false,
      status: 400,
      code: "too-many-lines",
      message: "This cart has too many lines.",
    };
  }
  if (new Set(lines.map((line) => line.channel)).size !== 1 || lines[0].channel !== channel) {
    return {
      ok: false,
      status: 400,
      code: "mixed-cart",
      message: "The cart channel does not match its items.",
    };
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim().slice(0, 80) : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim().slice(0, 80) : "";
  const address1 =
    typeof body.address1 === "string" ? body.address1.trim().slice(0, 240) : "";
  const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
  const postalCode =
    typeof body.postalCode === "string"
      ? body.postalCode.replace(/\D/g, "").slice(0, 6)
      : "";
  if (!email || !firstName || !lastName || !address1 || !city || !/^\d{6}$/.test(postalCode)) {
    return {
      ok: false,
      status: 400,
      code: "invalid-customer-details",
      message: "Email, name, address, city and a six-digit postal code are required.",
    };
  }
  return {
    ok: true,
    fields: { channel, lines, email, firstName, lastName, address1, city, postalCode },
  };
}

/** Fallback until sellers supply a product-level GST rate. */
const DEFAULT_GST_RATE_PERCENT = 18;

async function productGstRate(
  productId: unknown,
): Promise<{ rate: number; source: "product" | "default" }> {
  if (typeof productId === "string" && productId) {
    try {
      const product = await medusa.getProduct(productId);
      const raw = product.metadata?.gst_rate;
      const rate = Number(raw);
      if (Number.isFinite(rate) && rate >= 0 && rate <= 28) {
        return { rate, source: "product" };
      }
    } catch {
      // Fall through to the governed default.
    }
  }
  return { rate: DEFAULT_GST_RATE_PERCENT, source: "default" };
}

/**
 * Write the seller receivable for a collected COD order: commission, GST on commission, COD fee
 * and TCS. TCS uses the product GST rate when present and the governed 18% fallback otherwise.
 */
async function postCodDues(input: {
  orderGroupId: string;
  record: { medusa_order_group: Record<string, unknown> | null };
  sellerId: string;
  policy: { commission_bps: number; cod_fee_minor: number };
  status: string;
  /** Collection month; defaults to the existing snapshot or the current period. */
  period?: string | null;
}): Promise<void> {
  if (input.status === "refused") return;
  const group = input.record.medusa_order_group ?? {};
  const lines = Array.isArray(group.lines)
    ? (group.lines as Array<Record<string, unknown>>).filter(
        (line) => line.seller_id === input.sellerId,
      )
    : [];
  const goodsMinor = lines.reduce(
    (total, line) =>
      total + Math.round(Number(line.unit_price ?? 0)) * Number(line.quantity ?? 0),
    0,
  );
  if (goodsMinor <= 0) return;
  // Per-order override wins; otherwise the seller policy rate applies.
  const orderCommission = await codStore.getOrderCommission(input.orderGroupId, input.sellerId);
  const commissionBps = orderCommission?.commission_bps ?? input.policy.commission_bps;
  const commissionSource: "override" | "policy" = orderCommission ? "override" : "policy";
  const commission = Math.round((goodsMinor * commissionBps) / 10000);
  const gstOnCommission = Math.round((commission * BAZARBEE_GST_RATE_BPS) / 10000);
  const entries: Array<{ kind: string; amountMinor: number; note: string }> = [
    {
      kind: "commission",
      amountMinor: commission,
      note:
        commissionSource === "override"
          ? `${commissionBps} bps (per-order override: ${orderCommission!.reason})`
          : `${commissionBps} bps (seller policy)`,
    },
    { kind: "gst_on_commission", amountMinor: gstOnCommission, note: "18% GST on commission" },
  ];
  if (input.policy.cod_fee_minor > 0) {
    entries.push({
      kind: "cod_fee",
      amountMinor: input.policy.cod_fee_minor,
      note: "COD collection fee",
    });
  }
  let tcs = 0;
  let usedDefaultRate = false;
  for (const line of lines) {
    const { rate, source } = await productGstRate(line.product_id);
    if (source === "default") usedDefaultRate = true;
    const lineTotal = Math.round(Number(line.unit_price ?? 0)) * Number(line.quantity ?? 0);
    const taxable = Math.round(lineTotal / (1 + rate / 100));
    tcs += Math.round((taxable * COD_TCS_RATE_BPS) / 10000);
  }
  entries.push({
    kind: "tcs",
    amountMinor: tcs,
    note: usedDefaultRate
      ? "0.5% of net taxable value at the 18% default GST rate (product rate not set)"
      : "0.5% of net taxable value (ex-GST)",
  });
  // Reuse the period recorded when the order was first posted so a recompute does not move
  // historical dues into the current month.
  const existingDue = await codStore.getOrderDue(input.orderGroupId, input.sellerId);
  const period =
    existingDue?.period ?? (input.period ? input.period.slice(0, 7) : currentPeriod());
  await codStore.addDues(
    entries.map((entry) => ({
      sellerId: input.sellerId,
      period,
      kind: entry.kind,
      amountMinor: entry.amountMinor,
      sourceRef: `${input.orderGroupId}:${input.sellerId}`,
      note: entry.note,
    })),
  );
  await codStore.upsertOrderDue({
    orderGroupId: input.orderGroupId,
    sellerId: input.sellerId,
    period,
    goodsMinor,
    commissionBps,
    commissionSource,
    commissionMinor: commission,
    gstOnCommissionMinor: gstOnCommission,
    tcsMinor: tcs,
    tcsDefaultRate: usedDefaultRate,
    codFeeMinor: input.policy.cod_fee_minor,
    invoiceRef: existingDue?.invoice_ref ?? null,
  });
}

function duesTotals(entries: Array<{ amount_minor: number }>): number {
  return entries.reduce((total, entry) => total + Number(entry.amount_minor ?? 0), 0);
}

function duesCsv(entries: Array<Record<string, unknown>>): string {
  const header = ["seller_id", "period", "kind", "amount_minor", "currency", "source_ref", "status", "note"];
  const rows = entries.map((entry) =>
    header.map((key) => `"${String(entry[key] ?? "").replaceAll('"', '""')}"`).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/** Order-level rows for the COD statement CSV: one line per seller per order, never a net-only total. */
function orderDuesCsv(lines: CodOrderDue[]): string {
  const header = [
    "order_ref",
    "invoice_ref",
    "seller_id",
    "period",
    "goods_minor",
    "commission_bps",
    "commission_source",
    "commission_minor",
    "gst_on_commission_minor",
    "tcs_minor",
    "cod_fee_minor",
    "adjustments_minor",
    "amount_due_minor",
    "currency",
  ];
  const rows = lines.map((line) =>
    header
      .map((key) => {
        const value =
          key === "order_ref"
            ? line.order_group_id
            : key === "commission_bps"
              ? line.commission_bps
              : key === "commission_source"
                ? line.commission_source
                : (line as unknown as Record<string, unknown>)[key];
        return `"${String(value ?? "").replaceAll('"', '""')}"`;
      })
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

async function handle(req: Request, url: URL, cid: string): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, idempotency-key, x-device-id, x-correlation-id",
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
  // Ops identity endpoints authenticate themselves: the gate with the Cloudflare assertion, the
  // TOTP forms with that assertion plus a CSRF token.
  const opsSelfAuthenticated =
    url.pathname === "/v1/ops/gate" ||
    url.pathname === "/v1/ops/totp/verify" ||
    url.pathname === "/v1/ops/totp/enroll" ||
    url.pathname === "/v1/ops/staff" ||
    url.pathname.startsWith("/v1/ops/staff/");
  const requiredRoles =
    config.pilotRoleAssignmentsJson && !opsSelfAuthenticated
      ? privilegedRoles(url.pathname)
      : null;
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
      identity_mode: config.identityMode,
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
      ["pilot_access", pilotAccess.poolStats()],
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

  // GET /v1/ops/gate — nginx auth_request for the operator host. Not a browser endpoint.
  if (url.pathname === "/v1/ops/gate" && req.method === "GET") {
    if (!opsContext) {
      return new Response(null, {
        status: 204,
        headers: { "x-ops-gate": "off", "cache-control": "no-store" },
      });
    }
    const decision = await opsContext.gate.evaluate({
      accessJwt: req.headers.get("cf-access-jwt-assertion"),
      sessionToken: readCookie(req.headers.get("cookie"), OPS_SESSION_COOKIE),
    });
    const headers = new Headers({
      "x-ops-reason": decision.reason,
      "cache-control": "no-store",
    });
    if (decision.next) headers.set("x-ops-next", decision.next);
    if (decision.shadow) {
      headers.set("x-ops-shadow-status", String(decision.shadow.wouldBeStatus));
      headers.set("x-ops-shadow-reason", decision.shadow.reason);
    }
    return new Response(null, { status: decision.status, headers });
  }

  // GET /ops/login — TOTP step for a staff user already verified by Cloudflare Access.
  if (url.pathname === "/ops/login" && req.method === "GET") {
    if (!opsContext) {
      return opsHtml(
        opsNoticePage({
          title: "Not configured",
          message: "Ops identity is not enabled in this environment.",
        }),
        404,
      );
    }
    const identity = await opsIdentity(req);
    if (!identity) {
      return opsHtml(
        opsNoticePage({
          title: "Access required",
          message: "Open this page through Cloudflare Access.",
        }),
        401,
      );
    }
    const staff = await opsContext.staff.get(identity.email);
    if (!staff || staff.status === "disabled") {
      return opsHtml(
        opsNoticePage({
          title: "No access",
          message: "This account is not on the ops staff list.",
        }),
        403,
      );
    }
    const next = safeOpsNext(url.searchParams.get("next"));
    if (!staff.totpEnrolled) return opsRedirect("/ops/enroll");
    const existing = await opsContext.sessions.resolveSession(
      readCookie(req.headers.get("cookie"), OPS_SESSION_COOKIE),
    );
    if (existing?.email === staff.email) return opsRedirect(next);
    return opsHtml(
      opsLoginPage({
        email: staff.email,
        csrf: issueFormToken(staff.email, opsContext.formKey),
        next,
      }),
    );
  }

  // GET /ops/enroll — first-time authenticator setup for an invited staff user.
  if (url.pathname === "/ops/enroll" && req.method === "GET") {
    if (!opsContext) return opsRedirect("/ops/login");
    const identity = await opsIdentity(req);
    if (!identity) {
      return opsHtml(
        opsNoticePage({
          title: "Access required",
          message: "Open this page through Cloudflare Access.",
        }),
        401,
      );
    }
    const staff = await opsContext.staff.get(identity.email);
    if (!staff || staff.status === "disabled") {
      return opsHtml(
        opsNoticePage({
          title: "No access",
          message: "This account is not on the ops staff list.",
        }),
        403,
      );
    }
    if (staff.totpEnrolled) return opsRedirect("/ops/login");
    let state = await opsContext.staff.getTotpState(staff.email);
    if (!state?.secret) {
      const secret = generateTotpSecret();
      const started = await opsContext.staff.beginEnrollment(staff.email, secret);
      if (!started) return opsRedirect("/ops/login");
      state = await opsContext.staff.getTotpState(staff.email);
    }
    if (!state?.secret) {
      return opsHtml(
        opsNoticePage({
          title: "Enrolment unavailable",
          message: "The authenticator secret could not be prepared. Try again.",
        }),
        500,
      );
    }
    return opsHtml(
      opsEnrollPage({
        email: staff.email,
        csrf: issueFormToken(staff.email, opsContext.formKey),
        secret: state.secret,
        uri: otpauthUri(state.secret, staff.email),
      }),
    );
  }

  // GET /ops/logout — clear the ops session cookie.
  if (url.pathname === "/ops/logout" && req.method === "GET") {
    if (opsContext) {
      await opsContext.sessions.revokeSession(
        readCookie(req.headers.get("cookie"), OPS_SESSION_COOKIE),
      );
    }
    return opsRedirect("/ops/login", clearOpsSessionCookie());
  }

  // POST /v1/ops/totp/verify — verify TOTP or a recovery code and issue the ops session.
  if (url.pathname === "/v1/ops/totp/verify" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    if (!sameOriginPost(req)) {
      return opsHtml(
        opsNoticePage({ title: "Rejected", message: "Cross-origin form submission." }),
        403,
      );
    }
    const limited = await enforceAuthRateLimit(req, "ops-totp-verify", {
      ipLimit: 20,
      windowSeconds: 600,
    });
    if (limited) {
      return opsHtml(
        opsNoticePage({
          title: "Too many attempts",
          message: "Wait a few minutes before trying again.",
        }),
        429,
      );
    }
    let code = "";
    let next = "/dashboard";
    let csrfToken = "";
    try {
      const form = await req.formData();
      code = String(form.get("code") ?? "").trim();
      next = safeOpsNext(String(form.get("next") ?? ""));
      csrfToken = String(form.get("csrf") ?? "");
    } catch {
      return problem(400, "invalid-request-body", "Expected a form body.");
    }
    const identity = await opsIdentity(req);
    if (!identity) return problem(401, "access-required", "Cloudflare Access is required.");
    if (!verifyFormToken(csrfToken, identity.email, opsContext.formKey)) {
      return opsHtml(
        opsNoticePage({ title: "Expired form", message: "Reload the sign-in page and try again." }),
        403,
      );
    }
    const staff = await opsContext.staff.get(identity.email);
    if (!staff || staff.status === "disabled") {
      return opsHtml(
        opsNoticePage({ title: "No access", message: "This account is not on the ops staff list." }),
        403,
      );
    }
    if (staff.lockedUntil && new Date(staff.lockedUntil).getTime() > Date.now()) {
      return opsHtml(
        opsNoticePage({
          title: "Temporarily locked",
          message: "Too many failed codes. Try again in 15 minutes or ask a superadmin to reset.",
        }),
        423,
      );
    }
    const state = await opsContext.staff.getTotpState(staff.email);
    if (!state?.secret) return opsRedirect("/ops/enroll");

    let success = false;
    let replay = false;
    if (/^\d{6}$/.test(code)) {
      const result = verifyTotp(state.secret, code, state.lastStep);
      if (result.valid) {
        success = await opsContext.staff.consumeTotpStep(staff.email, result.step);
        replay = !success;
      }
    } else {
      success = await opsContext.staff.consumeRecoveryCode(staff.email, code);
    }

    if (success) {
      const issued = await opsContext.sessions.issueSession({
        email: staff.email,
        name: staff.name,
        roles: staff.roles,
        accessSub: identity.sub,
        totpAt: new Date().toISOString(),
      });
      return opsRedirect(next, opsSessionCookie(issued.session_token, issued.expires_in_seconds));
    }

    const failure = await opsContext.staff.registerFailure(staff.email);
    if (failure.lockedUntil && new Date(failure.lockedUntil).getTime() > Date.now()) {
      return opsHtml(
        opsNoticePage({
          title: "Temporarily locked",
          message: "Too many failed codes. Try again in 15 minutes or ask a superadmin to reset.",
        }),
        423,
      );
    }
    return opsHtml(
      opsLoginPage({
        email: staff.email,
        csrf: issueFormToken(staff.email, opsContext.formKey),
        next,
        error:
          replay
            ? "That code was already used. Wait for the next code."
            : "That code was not accepted.",
      }),
      401,
    );
  }

  // POST /v1/ops/totp/enroll — confirm the first authenticator code and show recovery codes once.
  if (url.pathname === "/v1/ops/totp/enroll" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    if (!sameOriginPost(req)) {
      return opsHtml(
        opsNoticePage({ title: "Rejected", message: "Cross-origin form submission." }),
        403,
      );
    }
    const limited = await enforceAuthRateLimit(req, "ops-totp-enroll", {
      ipLimit: 10,
      windowSeconds: 600,
    });
    if (limited) {
      return opsHtml(
        opsNoticePage({
          title: "Too many attempts",
          message: "Wait a few minutes before trying again.",
        }),
        429,
      );
    }
    let code = "";
    let csrfToken = "";
    try {
      const form = await req.formData();
      code = String(form.get("code") ?? "").trim();
      csrfToken = String(form.get("csrf") ?? "");
    } catch {
      return problem(400, "invalid-request-body", "Expected a form body.");
    }
    const identity = await opsIdentity(req);
    if (!identity) return problem(401, "access-required", "Cloudflare Access is required.");
    if (!verifyFormToken(csrfToken, identity.email, opsContext.formKey)) {
      return opsHtml(
        opsNoticePage({ title: "Expired form", message: "Reload the setup page and try again." }),
        403,
      );
    }
    const staff = await opsContext.staff.get(identity.email);
    if (!staff || staff.status === "disabled") {
      return opsHtml(
        opsNoticePage({ title: "No access", message: "This account is not on the ops staff list." }),
        403,
      );
    }
    if (staff.totpEnrolled) return opsRedirect("/ops/login");
    const state = await opsContext.staff.getTotpState(staff.email);
    if (!state?.secret) return opsRedirect("/ops/enroll");
    const result = verifyTotp(state.secret, code, null);
    if (!result.valid) {
      const failure = await opsContext.staff.registerFailure(staff.email);
      if (failure.lockedUntil && new Date(failure.lockedUntil).getTime() > Date.now()) {
        return opsHtml(
          opsNoticePage({
            title: "Temporarily locked",
            message: "Too many failed codes. Ask a superadmin to reset your enrolment.",
          }),
          423,
        );
      }
      return opsHtml(
        opsEnrollPage({
          email: staff.email,
          csrf: issueFormToken(staff.email, opsContext.formKey),
          secret: state.secret,
          uri: otpauthUri(state.secret, staff.email),
          error: "That code was not accepted. Check the device clock and try the next code.",
        }),
        401,
      );
    }
    const recoveryCodes = generateRecoveryCodes();
    const confirmed = await opsContext.staff.confirmEnrollment(
      staff.email,
      recoveryCodes,
      staff.email,
      result.step,
    );
    if (!confirmed) return opsRedirect("/ops/login");
    return opsHtml(opsRecoveryPage({ codes: recoveryCodes }));
  }

  // GET /ops/staff - superadmin staff directory.
  if (url.pathname === "/ops/staff" && req.method === "GET") {
    if (!opsContext) return opsActorHtmlError("not-configured");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorHtmlError(auth.error);
    return renderStaffPage(auth.actor, {
      message: url.searchParams.get("message") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
    });
  }

  // POST /ops/staff - staff actions from the page.
  if (url.pathname === "/ops/staff" && req.method === "POST") {
    if (!opsContext) return opsActorHtmlError("not-configured");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorHtmlError(auth.error);
    if (!sameOriginPost(req)) {
      return problem(403, "cross-origin", "Cross-origin form submission.");
    }
    let action = "";
    let email = "";
    let reason = "";
    let name = "";
    let status = "";
    let csrfToken = "";
    let roles: string[] = [];
    try {
      const form = await req.formData();
      action = String(form.get("action") ?? "");
      email = String(form.get("email") ?? "").trim().toLowerCase();
      reason = String(form.get("reason") ?? "").trim();
      name = String(form.get("name") ?? "").trim();
      status = String(form.get("status") ?? "");
      csrfToken = String(form.get("csrf") ?? "");
      roles = form.getAll("roles").map(String);
    } catch {
      return problem(400, "invalid-request-body", "Expected a form body.");
    }
    if (!verifyFormToken(csrfToken, auth.actor.email, opsContext.formKey)) {
      return opsHtml(
        opsNoticePage({
          title: "Expired form",
          message: "Reload the staff page and try again.",
        }),
        403,
      );
    }
    if (!reason) {
      return opsRedirect(`/ops/staff?error=${encodeURIComponent("A reason is required.")}`);
    }
    const back = (kind: "message" | "error", text: string) =>
      opsRedirect(`/ops/staff?${kind}=${encodeURIComponent(text)}`);
    try {
      if (action === "invite") {
        const nextRoles = roles as OpsStaffRole[];
        if (needsSecondApproval("create", null, nextRoles)) {
          const request = await opsContext.staff.createRequest({
            action: "create",
            targetEmail: email,
            payload: { email, name, roles: nextRoles },
            reason,
            requestedBy: auth.actor.email,
          });
          return back("message", `Second approval required: request ${request.id} is pending.`);
        }
        const created = await opsContext.staff.create({
          email,
          name,
          roles: nextRoles,
          actorEmail: auth.actor.email,
          reason,
        });
        const syncWarning = await syncOpsStaff(created);
        if (syncWarning) return renderStaffPage(auth.actor, { error: syncWarning });
        const mercur = await createMercurInvite(created.email);
        if (mercur.status === "created") {
          return renderStaffPage(auth.actor, {
            message: `Invited ${created.email} and synced the Access group.`,
            inviteEmail: created.email,
            inviteUrl: mercur.url,
          });
        }
        if (mercur.status === "failed") {
          return renderStaffPage(auth.actor, {
            message: `Invited ${created.email} and synced the Access group.`,
            inviteWarning: `Mercur invite failed: ${mercur.error}. Create the user in Mercur manually.`,
          });
        }
        return renderStaffPage(auth.actor, {
          message: `Invited ${created.email} and synced the Access group.`,
          inviteWarning:
            "Mercur invite automation is not configured; create the user in Mercur manually.",
        });
      }
      if (action === "roles") {
        const target = await opsContext.staff.get(email);
        if (!target) return back("error", "Staff user not found.");
        const nextRoles = roles as OpsStaffRole[];
        if (needsSecondApproval("roles", target, nextRoles)) {
          const request = await opsContext.staff.createRequest({
            action: "roles",
            targetEmail: email,
            payload: { email, roles: nextRoles },
            reason,
            requestedBy: auth.actor.email,
          });
          return back("message", `Second approval required: request ${request.id} is pending.`);
        }
        const guard = await superadminChangeGuard("roles", auth.actor.email, email, roles);
        if (guard) return back("error", guard);
        const updated = await opsContext.staff.setRoles(
          email,
          nextRoles,
          auth.actor.email,
          reason,
        );
        if (!updated) return back("error", "Staff user not found.");
        const warning = await syncOpsStaff(updated);
        if (warning) return back("error", warning);
        return back("message", `Roles updated for ${updated.email} and synced.`);
      }
      if (action === "status") {
        const nextStatus =
          status === "active" ? "active" : status === "disabled" ? "disabled" : null;
        if (!nextStatus) return back("error", "Invalid status.");
        const target = await opsContext.staff.get(email);
        if (!target) return back("error", "Staff user not found.");
        if (needsSecondApproval("status", target)) {
          const request = await opsContext.staff.createRequest({
            action: "status",
            targetEmail: email,
            payload: { email, status: nextStatus },
            reason,
            requestedBy: auth.actor.email,
          });
          return back("message", `Second approval required: request ${request.id} is pending.`);
        }
        const guard = await superadminChangeGuard(
          "status",
          auth.actor.email,
          email,
          undefined,
          nextStatus,
        );
        if (guard) return back("error", guard);
        const updated = await opsContext.staff.setStatus(
          email,
          nextStatus,
          auth.actor.email,
          reason,
        );
        if (!updated) return back("error", "Staff user not found.");
        const warning = await syncOpsStaff(updated);
        if (warning) return back("error", warning);
        return back("message", `${updated.email} is now ${updated.status} and synced.`);
      }
      if (action === "reset-totp") {
        const target = await opsContext.staff.get(email);
        if (!target) return back("error", "Staff user not found.");
        if (needsSecondApproval("reset_totp", target)) {
          const request = await opsContext.staff.createRequest({
            action: "reset_totp",
            targetEmail: email,
            payload: { email },
            reason,
            requestedBy: auth.actor.email,
          });
          return back("message", `Second approval required: request ${request.id} is pending.`);
        }
        const updated = await opsContext.staff.resetEnrollment(email, auth.actor.email, reason);
        if (!updated) return back("error", "Staff user not found.");
        return back("message", `TOTP reset for ${updated.email}; they must enrol again.`);
      }
      return problem(400, "unknown-action", "Unknown staff action.");
    } catch (error) {
      return back("error", (error as Error).message);
    }
  }

  // POST /ops/staff/approvals - second-superadmin decision on a pending request.
  if (url.pathname === "/ops/staff/approvals" && req.method === "POST") {
    if (!opsContext) return opsActorHtmlError("not-configured");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorHtmlError(auth.error);
    if (!sameOriginPost(req)) {
      return problem(403, "cross-origin", "Cross-origin form submission.");
    }
    let requestId = "";
    let decision = "";
    let reason = "";
    let csrfToken = "";
    try {
      const form = await req.formData();
      requestId = String(form.get("request_id") ?? "").trim();
      decision = String(form.get("decision") ?? "").trim();
      reason = String(form.get("reason") ?? "").trim();
      csrfToken = String(form.get("csrf") ?? "");
    } catch {
      return problem(400, "invalid-request-body", "Expected a form body.");
    }
    if (!verifyFormToken(csrfToken, auth.actor.email, opsContext.formKey)) {
      return opsHtml(
        opsNoticePage({ title: "Expired form", message: "Reload the staff page and try again." }),
        403,
      );
    }
    if (decision !== "approved" && decision !== "rejected") {
      return problem(400, "invalid-decision", "Decision must be approved or rejected.");
    }
    if (!reason) {
      return opsRedirect(`/ops/staff?error=${encodeURIComponent("A decision reason is required.")}`);
    }
    const request = await opsContext.staff.decideRequest(
      requestId,
      decision,
      auth.actor.email,
      reason,
    );
    if (!request) {
      return opsRedirect(
        `/ops/staff?error=${encodeURIComponent("Request not found, already decided, expired, or your own.")}`,
      );
    }
    const back = (kind: "message" | "error", text: string) =>
      opsRedirect(`/ops/staff?${kind}=${encodeURIComponent(text)}`);
    if (decision === "rejected") {
      return back("message", `Request ${request.id} rejected.`);
    }
    const baseReason = `approved request ${request.id}: ${request.reason}`;
    try {
      if (request.action === "create") {
        const created = await opsContext.staff.create({
          email: request.targetEmail,
          name: String(request.payload.name ?? ""),
          roles: requestedRoles(request.payload),
          actorEmail: auth.actor.email,
          reason: baseReason,
        });
        const warning = await syncOpsStaff(created);
        if (warning) return back("error", warning);
        const mercur = await createMercurInvite(created.email);
        if (mercur.status === "created") {
          return renderStaffPage(auth.actor, {
            message: `Approved: ${created.email} created and synced.`,
            inviteEmail: created.email,
            inviteUrl: mercur.url,
          });
        }
        return renderStaffPage(auth.actor, {
          message: `Approved: ${created.email} created and synced.`,
          inviteWarning:
            mercur.status === "failed"
              ? `Mercur invite failed: ${mercur.error}. Create the user in Mercur manually.`
              : "Mercur invite automation is not configured; create the user in Mercur manually.",
        });
      }
      if (request.action === "roles") {
        const roles = requestedRoles(request.payload);
        const guard = await superadminChangeGuard(
          "roles",
          auth.actor.email,
          request.targetEmail,
          roles,
        );
        if (guard) {
          await opsContext.staff.markRequestFailed(request.id, guard);
          return back("error", guard);
        }
        const updated = await opsContext.staff.setRoles(
          request.targetEmail,
          roles,
          auth.actor.email,
          baseReason,
        );
        if (!updated) {
          await opsContext.staff.markRequestFailed(request.id, "Staff user not found.");
          return back("error", "Staff user not found.");
        }
        const warning = await syncOpsStaff(updated);
        if (warning) return back("error", warning);
        return back("message", `Approved: roles updated for ${updated.email}.`);
      }
      if (request.action === "status") {
        const nextStatus =
          request.payload.status === "active"
            ? "active"
            : request.payload.status === "disabled"
              ? "disabled"
              : null;
        if (!nextStatus) {
          await opsContext.staff.markRequestFailed(request.id, "Invalid status in request.");
          return back("error", "Invalid status in request.");
        }
        const guard = await superadminChangeGuard(
          "status",
          auth.actor.email,
          request.targetEmail,
          undefined,
          nextStatus,
        );
        if (guard) {
          await opsContext.staff.markRequestFailed(request.id, guard);
          return back("error", guard);
        }
        const updated = await opsContext.staff.setStatus(
          request.targetEmail,
          nextStatus,
          auth.actor.email,
          baseReason,
        );
        if (!updated) {
          await opsContext.staff.markRequestFailed(request.id, "Staff user not found.");
          return back("error", "Staff user not found.");
        }
        const warning = await syncOpsStaff(updated);
        if (warning) return back("error", warning);
        return back("message", `Approved: ${updated.email} is now ${updated.status}.`);
      }
      if (request.action === "reset_totp") {
        const updated = await opsContext.staff.resetEnrollment(
          request.targetEmail,
          auth.actor.email,
          baseReason,
        );
        if (!updated) {
          await opsContext.staff.markRequestFailed(request.id, "Staff user not found.");
          return back("error", "Staff user not found.");
        }
        return back("message", `Approved: TOTP reset for ${updated.email}.`);
      }
      await opsContext.staff.markRequestFailed(request.id, "Unknown request action.");
      return back("error", "Unknown request action.");
    } catch (error) {
      const message = (error as Error).message;
      await opsContext.staff.markRequestFailed(request.id, message);
      return back("error", message);
    }
  }

  // GET /ops/staff/audit - audit trail for one staff user.
  if (url.pathname === "/ops/staff/audit" && req.method === "GET") {
    if (!opsContext) return opsActorHtmlError("not-configured");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorHtmlError(auth.error);
    const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) return opsRedirect("/ops/staff");
    const rows = await opsContext.staff.auditTrail(email, 200);
    return opsHtml(
      opsStaffAuditPage({
        actorEmail: auth.actor.email,
        targetEmail: email,
        rows,
      }),
    );
  }

  // GET /v1/ops/staff - JSON list.
  if (url.pathname === "/v1/ops/staff" && req.method === "GET") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    return json({ items: await opsContext.staff.list() });
  }

  // GET /v1/ops/staff/requests - pending second-approval requests.
  if (url.pathname === "/v1/ops/staff/requests" && req.method === "GET") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    return json({ items: await opsContext.staff.listPendingRequests() });
  }

  // POST /v1/ops/staff - JSON invite.
  if (url.pathname === "/v1/ops/staff" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    if (!sameOriginPost(req)) return problem(403, "cross-origin", "Cross-origin request.");
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
    const reason = String(body.reason ?? "").trim();
    if (!reason) return problem(400, "reason-required", "A reason is required.");
    if (needsSecondApproval("create", null, roles)) {
      const request = await opsContext.staff.createRequest({
        action: "create",
        targetEmail: email,
        payload: { email, name, roles },
        reason,
        requestedBy: auth.actor.email,
      });
      return json({ request }, 202);
    }
    try {
      const created = await opsContext.staff.create({
        email,
        name,
        roles: roles as OpsStaffRole[],
        actorEmail: auth.actor.email,
        reason,
      });
      const warning = await syncOpsStaff(created);
      const mercur = await createMercurInvite(created.email);
      return json({ staff: created, sync_warning: warning, mercur_invite: mercur }, 201);
    } catch (error) {
      return problem(400, "staff-create-failed", (error as Error).message);
    }
  }

  // POST /v1/ops/staff/roles - JSON role change.
  if (url.pathname === "/v1/ops/staff/roles" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    if (!sameOriginPost(req)) return problem(403, "cross-origin", "Cross-origin request.");
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = String(body.email ?? "").trim();
    const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
    const reason = String(body.reason ?? "").trim();
    if (!reason) return problem(400, "reason-required", "A reason is required.");
    const target = await opsContext.staff.get(email);
    if (!target) return problem(404, "not-found");
    if (needsSecondApproval("roles", target, roles)) {
      const request = await opsContext.staff.createRequest({
        action: "roles",
        targetEmail: email,
        payload: { email, roles },
        reason,
        requestedBy: auth.actor.email,
      });
      return json({ request }, 202);
    }
    const guard = await superadminChangeGuard("roles", auth.actor.email, email, roles);
    if (guard) return problem(409, "superadmin-guard", guard);
    try {
      const updated = await opsContext.staff.setRoles(
        email,
        roles as OpsStaffRole[],
        auth.actor.email,
        reason,
      );
      if (!updated) return problem(404, "not-found");
      const warning = await syncOpsStaff(updated);
      return json({ staff: updated, sync_warning: warning });
    } catch (error) {
      return problem(400, "staff-update-failed", (error as Error).message);
    }
  }

  // POST /v1/ops/staff/status - JSON disable/enable.
  if (url.pathname === "/v1/ops/staff/status" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    if (!sameOriginPost(req)) return problem(403, "cross-origin", "Cross-origin request.");
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = String(body.email ?? "").trim();
    const status = body.status === "active" ? "active" : body.status === "disabled" ? "disabled" : null;
    const reason = String(body.reason ?? "").trim();
    if (!status) return problem(400, "invalid-status", "Status must be active or disabled.");
    if (!reason) return problem(400, "reason-required", "A reason is required.");
    const target = await opsContext.staff.get(email);
    if (!target) return problem(404, "not-found");
    if (needsSecondApproval("status", target)) {
      const request = await opsContext.staff.createRequest({
        action: "status",
        targetEmail: email,
        payload: { email, status },
        reason,
        requestedBy: auth.actor.email,
      });
      return json({ request }, 202);
    }
    const guard = await superadminChangeGuard("status", auth.actor.email, email, undefined, status);
    if (guard) return problem(409, "superadmin-guard", guard);
    const updated = await opsContext.staff.setStatus(email, status, auth.actor.email, reason);
    if (!updated) return problem(404, "not-found");
    const warning = await syncOpsStaff(updated);
    return json({ staff: updated, sync_warning: warning });
  }

  // POST /v1/ops/staff/reset-totp - JSON TOTP reset.
  if (url.pathname === "/v1/ops/staff/reset-totp" && req.method === "POST") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    if (!sameOriginPost(req)) return problem(403, "cross-origin", "Cross-origin request.");
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = String(body.email ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!reason) return problem(400, "reason-required", "A reason is required.");
    const target = await opsContext.staff.get(email);
    if (!target) return problem(404, "not-found");
    if (needsSecondApproval("reset_totp", target)) {
      const request = await opsContext.staff.createRequest({
        action: "reset_totp",
        targetEmail: email,
        payload: { email },
        reason,
        requestedBy: auth.actor.email,
      });
      return json({ request }, 202);
    }
    const updated = await opsContext.staff.resetEnrollment(email, auth.actor.email, reason);
    if (!updated) return problem(404, "not-found");
    return json({ staff: updated });
  }

  // GET /v1/ops/staff/export.csv - access review export.
  if (url.pathname === "/v1/ops/staff/export.csv" && req.method === "GET") {
    if (!opsContext) return problem(404, "not-found");
    const auth = await resolveOpsActor(req);
    if ("error" in auth) return opsActorJsonError(auth.error);
    const staff = await opsContext.staff.list();
    const header = [
      "email",
      "name",
      "roles",
      "status",
      "totp_enrolled",
      "recovery_codes",
      "created_at",
      "last_login_at",
    ];
    const lines = staff.map((person) =>
      [
        person.email,
        person.name,
        person.roles.join("|"),
        person.status,
        person.totpEnrolled ? "yes" : "no",
        person.recoveryCodesRemaining,
        person.createdAt,
        person.lastLoginAt ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    return new Response([header.join(","), ...lines].join("\n") + "\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="bazarbee-ops-staff.csv"',
        "cache-control": "no-store",
      },
    });
  }

  // POST /v1/auth/email/code — email a six-digit sign-in code.
  if (url.pathname === "/v1/auth/email/code" && req.method === "POST") {
    const limited = await enforceAuthRateLimit(req, "email-code", {
      ipLimit: 10,
      deviceLimit: 5,
    });
    if (limited) return limited;
    let body: { email?: string };
    try {
      body = (await req.json()) as { email?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !email.includes("@")) {
      return problem(400, "invalid-email", "A valid email address is required.");
    }
    if (!emailSender && config.environment === "production") {
      return problem(503, "email-not-configured", "Email sign-in is not configured.");
    }
    const user = await resolveEmailUser(email);
    if (!user) {
      return problem(403, "sign-in-unavailable", "This email is not available for sign-in.");
    }
    if (!(await emailAuth.beginRequest(email))) {
      return problem(429, "email-cooldown", "Wait a minute before requesting another code.");
    }
    try {
      const issued = await emailAuth.issueCode(user.id);
      const minutes = Math.max(1, Math.round(issued.expiresInSeconds / 60));
      const message: EmailMessage = {
        to: user.email,
        subject: "Your BazarBee sign-in code",
        text: `Your BazarBee sign-in code is ${issued.code}. It expires in ${minutes} minutes. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Inter,Arial,sans-serif;background:#F6F7FE;padding:32px;color:#1C2260"><div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px"><h1 style="font-size:22px;margin:0 0 12px">BazarBee</h1><p>Use this code to sign in:</p><div style="font-size:32px;letter-spacing:8px;font-weight:800;color:#5B6EE1;margin:20px 0">${issued.code}</div><p style="color:#5B6478">It expires in ${minutes} minutes. If you did not request it, ignore this email.</p></div></div>`,
      };
      if (emailSender) await emailSender.send(message);
      return json({
        challenge_id: issued.challengeId,
        expires_in_seconds: issued.expiresInSeconds,
        test_data: config.environment !== "production",
        ...(emailSender ? {} : { preview_code: issued.code }),
        environment: config.environment,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      console.warn("[experience-api] email code send failed:", (error as Error).message);
      return problem(502, "email-send-failed", "The sign-in email could not be sent.");
    }
  }

  // POST /v1/auth/email/verify — verify an email code and issue a session.
  if (url.pathname === "/v1/auth/email/verify" && req.method === "POST") {
    const limited = await enforceAuthRateLimit(req, "email-verify", {
      ipLimit: 30,
      deviceLimit: 15,
    });
    if (limited) return limited;
    let body: { challenge_id?: string; code?: string };
    try {
      body = (await req.json()) as { challenge_id?: string; code?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const challengeId = body.challenge_id?.trim() ?? "";
    const code = body.code?.trim() ?? "";
    if (!challengeId || !/^\d{6}$/.test(code)) {
      return problem(400, "invalid-email-code", "challenge_id and a six-digit code are required.");
    }
    const userId = await emailAuth.verifyCode(challengeId, code);
    if (!userId) {
      return problem(401, "invalid-email-code", "Invalid or expired email code.");
    }
    const user = await resolveSessionUser(userId);
    if (!user) {
      return problem(401, "invalid-email-code", "The sign-in identity is no longer active.");
    }
    const session = await issueUserSession(userId);
    return json({
      session_token: session.session_token,
      expires_in_seconds: session.expires_in_seconds,
      user,
      test_data: config.environment !== "production",
      environment: config.environment,
      correlation_id: cid,
    });
  }

  // POST /v1/auth/email/magic-link — email a single-use sign-in link.
  if (url.pathname === "/v1/auth/email/magic-link" && req.method === "POST") {
    const limited = await enforceAuthRateLimit(req, "email-magic", {
      ipLimit: 10,
      deviceLimit: 5,
    });
    if (limited) return limited;
    let body: { email?: string };
    try {
      body = (await req.json()) as { email?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !email.includes("@")) {
      return problem(400, "invalid-email", "A valid email address is required.");
    }
    if (!emailSender && config.environment === "production") {
      return problem(503, "email-not-configured", "Email sign-in is not configured.");
    }
    const user = await resolveEmailUser(email);
    if (!user) {
      return problem(403, "sign-in-unavailable", "This email is not available for sign-in.");
    }
    if (!(await emailAuth.beginRequest(email))) {
      return problem(429, "email-cooldown", "Wait a minute before requesting another link.");
    }
    try {
      const issued = await emailAuth.issueMagicToken(user.id);
      const link = `${config.emailAuthLinkBaseUrl}/auth/email?token=${encodeURIComponent(issued.token)}`;
      const minutes = Math.max(1, Math.round(issued.expiresInSeconds / 60));
      const message: EmailMessage = {
        to: user.email,
        subject: "Your BazarBee sign-in link",
        text: `Sign in to BazarBee: ${link}\nThis link expires in ${minutes} minutes and can be used once. If you did not request it, ignore this email.`,
        html: `<div style="font-family:Inter,Arial,sans-serif;background:#F6F7FE;padding:32px;color:#1C2260"><div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px"><h1 style="font-size:22px;margin:0 0 12px">BazarBee</h1><p>Use the button below to sign in. This link can be used once.</p><p style="margin:24px 0"><a href="${link}" style="background:#5B6EE1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Sign in to BazarBee</a></p><p style="color:#5B6478">The link expires in ${minutes} minutes. If you did not request it, ignore this email.</p></div></div>`,
      };
      if (emailSender) await emailSender.send(message);
      return json({
        expires_in_seconds: issued.expiresInSeconds,
        test_data: config.environment !== "production",
        ...(emailSender ? {} : { preview_link: link }),
        environment: config.environment,
        correlation_id: cid,
      }, 201);
    } catch (error) {
      console.warn("[experience-api] magic link send failed:", (error as Error).message);
      return problem(502, "email-send-failed", "The sign-in link could not be sent.");
    }
  }

  // POST /v1/auth/email/magic/verify — consume a magic link and issue a session.
  if (url.pathname === "/v1/auth/email/magic/verify" && req.method === "POST") {
    const limited = await enforceAuthRateLimit(req, "magic-verify", {
      ipLimit: 30,
      deviceLimit: 15,
    });
    if (limited) return limited;
    let body: { token?: string };
    try {
      body = (await req.json()) as { token?: string };
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const token = body.token?.trim() ?? "";
    if (!token) {
      return problem(400, "invalid-magic-link", "A magic-link token is required.");
    }
    const userId = await emailAuth.consumeMagicToken(token);
    if (!userId) {
      return problem(401, "invalid-magic-link", "This sign-in link is invalid or has expired.");
    }
    const user = await resolveSessionUser(userId);
    if (!user) {
      return problem(401, "invalid-magic-link", "The sign-in identity is no longer active.");
    }
    const session = await issueUserSession(userId);
    return json({
      session_token: session.session_token,
      expires_in_seconds: session.expires_in_seconds,
      user,
      test_data: config.environment !== "production",
      environment: config.environment,
      correlation_id: cid,
    });
  }

  // POST /v1/auth/otp/challenges — issue a simulated OTP challenge (allowlisted pilot users only)
  if (url.pathname === "/v1/auth/otp/challenges" && req.method === "POST") {
    const limited = await enforceAuthRateLimit(req, "otp-challenge", {
      ipLimit: 10,
      deviceLimit: 5,
    });
    if (limited) return limited;
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
    const limited = await enforceAuthRateLimit(req, "otp-verify", {
      ipLimit: 30,
      deviceLimit: 15,
    });
    if (limited) return limited;
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
      return: withEvidenceUrls(record),
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

  const sellerReturnInspection = url.pathname.match(
    /^\/v1\/seller\/returns\/([^/]+)\/inspection$/,
  );
  if (sellerReturnInspection && req.method === "POST") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const scoped = (await sellerScopedReturns(sellerId, 500)).find(
      (candidate) => candidate.id === sellerReturnInspection[1],
    );
    if (!scoped) return problem(404, "return-not-found");
    let body: {
      expected_version?: number;
      lines?: Array<{
        line_key?: string;
        received_qty?: number;
        condition?: string;
        disposition?: string;
        note?: string;
      }>;
      note?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
      return problem(400, "expected-version-required", "expected_version must be a positive integer.");
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return problem(400, "inspection-lines-required", "Inspection lines are required.");
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
      const updated = await returns.inspect({
        id: scoped.id,
        expectedVersion: Number(body.expected_version),
        actorId: seller.user.id,
        actorRole: "seller",
        allowedLineKeys: scoped.lines.map((line) => line.lineKey),
        note: body.note?.trim() || null,
        lines: body.lines.map((line) => ({
          lineKey: String(line.line_key ?? ""),
          receivedQty: Number(line.received_qty ?? 0),
          condition: String(line.condition ?? "") as ReturnCondition,
          disposition: String(line.disposition ?? "") as ReturnDisposition,
          note: line.note?.trim() || body.note?.trim() || null,
        })),
      });
      await events.append({
        event_type: "return.inspection_completed",
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
          lines: updated.lines
            .filter((line) => line.inspectedAt !== null)
            .map((line) => ({
              line_key: line.lineKey,
              approved_qty: line.approvedQty,
              received_qty: line.receivedQty,
              condition: line.condition,
              disposition: line.disposition,
              note: line.inspectionNote,
            })),
          inspected_at: updated.lines.find((line) => line.inspectedAt)?.inspectedAt,
          inspected_by: seller.user.id,
          test_data: true,
          simulated: true,
          money_effect: "none",
          stock_effect: "none",
        },
      });
      await privilegedAudit.complete(auditId, 200);
      return json({
        return: updated,
        environment: config.environment,
        test_data: true,
        seller_id: sellerId,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "return-not-found"
        ? 404
        : code === "return-version-conflict" ||
            code === "return-not-inspectable" ||
            code === "inspection-scope-incomplete"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "return-inspection-failed", (error as Error).message);
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

  // Admin COD seller policy: opt-in, pincodes, blocked categories, caps and commission.
  if (url.pathname === "/v1/admin/cod/policies") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    if (req.method === "GET") {
      return json({
        policies: await codStore.listPolicies(),
        test_data: config.environment !== "production",
        correlation_id: cid,
      });
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const sellerId = typeof body.seller_id === "string" ? body.seller_id.trim() : "";
    if (!sellerId) return problem(400, "seller-required", "seller_id is required.");
    const stringArray = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
        : [];
    const numberOrNull = (value: unknown): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Math.round(Number(value));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const policy = await codStore.upsertPolicy({
      sellerId,
      enabled: body.enabled === true,
      pincodes: stringArray(body.pincodes).map((code) => code.replace(/\D/g, "")).filter(Boolean),
      blockedCategoryIds: stringArray(body.blocked_category_ids),
      maxOrderMinor: numberOrNull(body.max_order_minor),
      buyerDailyCapMinor: numberOrNull(body.buyer_daily_cap_minor),
      sellerDailyCapMinor: numberOrNull(body.seller_daily_cap_minor),
      codFeeMinor: numberOrNull(body.cod_fee_minor) ?? 0,
      commissionBps: numberOrNull(body.commission_bps) ?? 300,
      updatedBy: operator.user.id,
    });
    return json({
      policy,
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }

  // Seller dues for one period, with an optional CSV export.
  if (url.pathname === "/v1/seller/dues" && req.method === "GET") {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const period = (url.searchParams.get("period") ?? currentPeriod()).slice(0, 7);
    const entries = await codStore.listDues({ sellerId, period, limit: 1000 });
    if (url.searchParams.get("format") === "csv") {
      return new Response(duesCsv(entries as unknown as Array<Record<string, unknown>>), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="bazarbee-dues-${period}.csv"`,
          "access-control-allow-origin": "*",
        },
      });
    }
    return json({
      seller_id: sellerId,
      period,
      entries,
      total_due_minor: duesTotals(entries),
      currency: "INR",
      tcs_pending: entries.some(
        (entry) => entry.kind === "tcs" && String(entry.note ?? "").startsWith("pending"),
      ),
      tcs_default_rate_applied: entries.some(
        (entry) =>
          entry.kind === "tcs" &&
          String(entry.note ?? "").includes("default GST rate"),
      ),
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }

  // Admin COD cash collections.
  if (url.pathname === "/v1/admin/cod/collections" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const status = url.searchParams.get("status");
    const allowed = ["pending", "collected", "short", "refused"];
    const statuses = status && allowed.includes(status) ? [status] : allowed;
    return json({
      collections: await codStore.listCollections(statuses),
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }

  // Recompute derived COD dues from stored orders, e.g. after a TCS rate change.
  if (url.pathname === "/v1/admin/cod/recompute-dues" && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const collections = await codStore.listCollections(["collected", "short"]);
    let sellersUpdated = 0;
    for (const collection of collections) {
      const record = await correlation.getByOrderGroup(collection.order_group_id);
      if (!record) continue;
      const lines = Array.isArray(record.medusa_order_group?.lines)
        ? (record.medusa_order_group!.lines as Array<Record<string, unknown>>)
        : [];
      const sellerIds = [
        ...new Set(
          lines
            .map((line) => (typeof line.seller_id === "string" ? line.seller_id : ""))
            .filter(Boolean),
        ),
      ];
      for (const sellerId of sellerIds) {
        const policy = await codStore.getPolicy(sellerId);
        if (!policy) continue;
        await postCodDues({
          orderGroupId: collection.order_group_id,
          record,
          sellerId,
          policy,
          status: collection.status,
          period: collection.collected_at,
        });
        sellersUpdated += 1;
      }
    }
    return json({
      collections: collections.length,
      seller_dues_recomputed: sellersUpdated,
      default_gst_rate_percent: DEFAULT_GST_RATE_PERCENT,
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }

  // Admin monthly COD statement across sellers.
  if (url.pathname === "/v1/admin/cod/statements" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const period = (url.searchParams.get("period") ?? currentPeriod()).slice(0, 7);
    const entries = await codStore.listDues({ period, limit: 5000 });
    const bySeller = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = bySeller.get(entry.seller_id) ?? [];
      list.push(entry);
      bySeller.set(entry.seller_id, list);
    }
    if (url.searchParams.get("format") === "csv") {
      return new Response(duesCsv(entries as unknown as Array<Record<string, unknown>>), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="bazarbee-cod-statement-${period}.csv"`,
          "access-control-allow-origin": "*",
        },
      });
    }
    return json({
      period,
      statements: [...bySeller.entries()].map(([sellerId, rows]) => ({
        seller_id: sellerId,
        total_due_minor: duesTotals(rows),
        tcs_pending: rows.some(
          (entry) => entry.kind === "tcs" && String(entry.note ?? "").startsWith("pending"),
        ),
        tcs_default_rate_applied: rows.some(
          (entry) =>
            entry.kind === "tcs" &&
            String(entry.note ?? "").includes("default GST rate"),
        ),
        entries: rows,
      })),
      currency: "INR",
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }


  // Admin settlement statements built from the COD dues ledger (one line per order).
  if (url.pathname === "/v1/admin/cod/settlement-statements" && req.method === "GET") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    const period = (url.searchParams.get("period") ?? currentPeriod()).slice(0, 7);
    const sellerFilter = url.searchParams.get("seller_id")?.trim() || null;
    const allLines = await codStore.listOrderDues({ period, limit: 5000 });
    const lines = sellerFilter
      ? allLines.filter((line) => line.seller_id === sellerFilter)
      : allLines;
    if (url.searchParams.get("format") === "csv") {
      return new Response(orderDuesCsv(lines), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="bazarbee-cod-dues-${period}.csv"`,
          "access-control-allow-origin": "*",
        },
      });
    }
    const bySeller = new Map<string, CodOrderDue[]>();
    for (const line of lines) {
      const list = bySeller.get(line.seller_id) ?? [];
      list.push(line);
      bySeller.set(line.seller_id, list);
    }
    const statements = [];
    for (const [sellerId, sellerLines] of bySeller) {
      const sum = (key: keyof CodOrderDue) =>
        sellerLines.reduce((total, line) => total + Number(line[key] ?? 0), 0);
      const amountDue = sum("amount_due_minor");
      const carryForward = await codStore.carryForwardMinor(sellerId, period);
      statements.push({
        id: `${period}~${sellerId}`,
        statement_number: `COD-${period}-${sellerId.replace(/^sel_/, "").slice(0, 8).toUpperCase()}`,
        seller_id: sellerId,
        seller_name: sellerId,
        period,
        currency: sellerLines[0]?.currency ?? "INR",
        status: "open",
        order_count: sellerLines.length,
        goods_minor: sum("goods_minor"),
        commission_minor: sum("commission_minor"),
        gst_on_commission_minor: sum("gst_on_commission_minor"),
        tcs_minor: sum("tcs_minor"),
        cod_fee_minor: sum("cod_fee_minor"),
        adjustments_minor: sum("adjustments_minor"),
        amount_due_minor: amountDue,
        carry_forward_minor: carryForward,
        total_outstanding_minor: amountDue + carryForward,
        tcs_default_rate_applied: sellerLines.some((line) => line.tcs_default_rate === true),
        lines: sellerLines.map((line) => ({
          order_group_id: line.order_group_id,
          invoice_ref: line.invoice_ref,
          goods_minor: line.goods_minor,
          commission_bps: line.commission_bps,
          commission_source: line.commission_source,
          commission_minor: line.commission_minor,
          gst_on_commission_minor: line.gst_on_commission_minor,
          tcs_minor: line.tcs_minor,
          cod_fee_minor: line.cod_fee_minor,
          adjustments_minor: line.adjustments_minor,
          amount_due_minor: line.amount_due_minor,
        })),
      });
    }
    statements.sort(
      (left, right) => right.total_outstanding_minor - left.total_outstanding_minor,
    );
    return json({
      period,
      statements,
      currency: "INR",
      test_data: config.environment !== "production",
      correlation_id: cid,
    });
  }

  // Per-order commission override. Applies to one seller on one COD order, with a reason.
  if (
    url.pathname === "/v1/admin/cod/commission" &&
    (req.method === "POST" || req.method === "DELETE")
  ) {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return problem(400, "invalid-request-body", "Expected a JSON body.");
      }
    }
    const orderGroupId = String(
      body.order_group_id ?? url.searchParams.get("order_group_id") ?? "",
    ).trim();
    const sellerId = String(body.seller_id ?? url.searchParams.get("seller_id") ?? "").trim();
    if (!orderGroupId || !sellerId) {
      return problem(400, "order-and-seller-required", "order_group_id and seller_id are required.");
    }
    const record = await correlation.getByOrderGroup(orderGroupId);
    if (!record) return problem(404, "order-not-found", "That order group does not exist.");
    const group = record.medusa_order_group ?? {};
    const groupLines = Array.isArray(group.lines)
      ? (group.lines as Array<Record<string, unknown>>)
      : [];
    if (!groupLines.some((line) => line.seller_id === sellerId)) {
      return problem(400, "seller-not-on-order", "That seller has no line on this order.");
    }
    let commission: Record<string, unknown> | null = null;
    if (req.method === "DELETE") {
      await codStore.clearOrderCommission(orderGroupId, sellerId);
    } else {
      const commissionBps = Math.round(Number(body.commission_bps ?? -1));
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
        return problem(400, "invalid-commission", "commission_bps must be between 0 and 10000.");
      }
      if (reason.length < 3) {
        return problem(400, "reason-required", "A reason is required for a per-order commission.");
      }
      commission = (await codStore.setOrderCommission({
        orderGroupId,
        sellerId,
        commissionBps,
        reason,
        actorUserId: operator.user.id,
      })) as unknown as Record<string, unknown>;
    }
    // If cash was already recorded, reprice this order so the ledger and statement agree.
    const collection = await codStore.getCollectionByOrderGroup(orderGroupId);
    const policy = await codStore.getPolicy(sellerId);
    let recomputed = false;
    if (collection && collection.status !== "pending" && policy) {
      await postCodDues({
        orderGroupId,
        record,
        sellerId,
        policy,
        status: collection.status,
      });
      recomputed = true;
    }
    return json({
      commission,
      due: await codStore.getOrderDue(orderGroupId, sellerId),
      recomputed,
      seller_id: sellerId,
      order_group_id: orderGroupId,
      test_data: config.environment !== "production",
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
  // Owner-scoped evidence upload for a return request. Images only, 5 MB cap, private storage.
  const evidenceUpload = url.pathname.match(/^\/v1\/orders\/([^/]+)\/evidence$/);
  if (evidenceUpload && req.method === "POST") {
    const orderId = decodeURIComponent(evidenceUpload[1]);
    const authenticated = await authorizeCheckoutOwner(req, orderId);
    if ("response" in authenticated) return authenticated.response;
    const form = await req.formData().catch(() => null);
    if (!form) {
      return problem(400, "invalid-multipart", "Expected multipart form data.");
    }
    const file = form.get("file");
    const upload = file as
      | { type?: unknown; size?: unknown; arrayBuffer?: () => Promise<ArrayBuffer> }
      | null;
    if (!upload || typeof upload.arrayBuffer !== "function") {
      return problem(400, "evidence-file-required", "Attach a file in the 'file' field.");
    }
    const contentType = typeof upload.type === "string" ? upload.type : "";
    if (!isEvidenceContentType(contentType)) {
      return problem(415, "evidence-type-not-allowed", "Evidence must be a JPEG, PNG or WebP image.");
    }
    if (typeof upload.size === "number" && upload.size > EVIDENCE_MAX_BYTES) {
      return problem(413, "evidence-too-large", "Evidence must be 5 MB or smaller.");
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > EVIDENCE_MAX_BYTES) {
      return problem(413, "evidence-too-large", "Evidence must be between 1 byte and 5 MB.");
    }
    try {
      const stored = await evidenceStore.put({
        ownerId: authenticated.user.id,
        contentType,
        bytes,
      });
      return json(
        {
          evidence: {
            line_key: null,
            object_key: stored.objectKey,
            content_type: stored.contentType,
            size_bytes: stored.sizeBytes,
            sha256: stored.sha256,
          },
          environment: config.environment,
          test_data: true,
          correlation_id: cid,
        },
        201,
      );
    } catch (error) {
      console.error("[experience-api] evidence upload failed:", (error as Error).message);
      return problem(500, "evidence-store-failed", "The evidence file could not be stored.");
    }
  }

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
    const priceByLine = new Map(
      orderLineSnapshots(ref).map((line) => [line.line_key, line.unit_price]),
    );
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
        unitPriceMinor: Math.max(0, Math.round(priceByLine.get(line.line_key) ?? 0)),
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
      return: withEvidenceUrls(record),
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // Signed, short-lived evidence reader. The URL carries an expiry and HMAC, never the object key.
  const evidenceRead = url.pathname.match(/^\/v1\/evidence\/([^/]+)$/);
  if (evidenceRead && (req.method === "GET" || req.method === "HEAD")) {
    const evidenceId = decodeURIComponent(evidenceRead[1]);
    const expiresAt = Number.parseInt(url.searchParams.get("exp") ?? "0", 10);
    const signature = url.searchParams.get("sig") ?? "";
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expiresAt) || expiresAt < nowSeconds) {
      return problem(410, "evidence-url-expired", "This evidence link has expired.");
    }
    if (
      !verifyEvidenceSignature(
        config.evidenceSigningSecret,
        evidenceId,
        expiresAt,
        signature,
      )
    ) {
      return problem(403, "evidence-signature-invalid", "This evidence link is not valid.");
    }
    const record = await returns.getEvidence(evidenceId);
    if (!record) return problem(404, "evidence-not-found");
    if (record.scanStatus === "rejected") {
      return problem(410, "evidence-rejected", "This evidence file was rejected.");
    }
    const bytes = await evidenceStore.get(record.objectKey);
    if (!bytes) return problem(404, "evidence-object-missing");
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": record.contentType,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, max-age=300, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-evidence-scan": record.scanStatus,
      },
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
      return: withEvidenceUrls(record),
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

  const adminReturnInspection = url.pathname.match(
    /^\/v1\/admin\/returns\/([^/]+)\/inspection$/,
  );
  if (adminReturnInspection && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      expected_version?: number;
      lines?: Array<{
        line_key?: string;
        received_qty?: number;
        condition?: string;
        disposition?: string;
        note?: string;
      }>;
      note?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
      return problem(400, "expected-version-required", "expected_version must be a positive integer.");
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return problem(400, "inspection-lines-required", "Inspection lines are required.");
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
      const updated = await returns.inspect({
        id: adminReturnInspection[1],
        expectedVersion: Number(body.expected_version),
        actorId: operator.user.id,
        actorRole: "marketplace_operator",
        note: body.note?.trim() || null,
        lines: body.lines.map((line) => ({
          lineKey: String(line.line_key ?? ""),
          receivedQty: Number(line.received_qty ?? 0),
          condition: String(line.condition ?? "") as ReturnCondition,
          disposition: String(line.disposition ?? "") as ReturnDisposition,
          note: line.note?.trim() || body.note?.trim() || null,
        })),
      });
      await events.append({
        event_type: "return.inspection_completed",
        aggregate_type: "return",
        aggregate_id: updated.id,
        correlation_id: cid,
        payload: {
          return_id: updated.id,
          order_id: updated.orderId,
          order_group_id: updated.orderGroupId,
          status: updated.status,
          version: updated.version,
          source: "admin_console",
          lines: updated.lines
            .filter((line) => line.inspectedAt !== null)
            .map((line) => ({
              line_key: line.lineKey,
              approved_qty: line.approvedQty,
              received_qty: line.receivedQty,
              condition: line.condition,
              disposition: line.disposition,
              note: line.inspectionNote,
            })),
          inspected_at: updated.lines.find((line) => line.inspectedAt)?.inspectedAt,
          inspected_by: operator.user.id,
          test_data: true,
          simulated: true,
          money_effect: "none",
          stock_effect: "none",
        },
      });
      await privilegedAudit.complete(auditId, 200);
      return json({
        return: updated,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "return-not-found"
        ? 404
        : code === "return-version-conflict" ||
            code === "return-not-inspectable"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "return-inspection-failed", (error as Error).message);
    }
  }

  const adminReturnRefundSimulation = url.pathname.match(
    /^\/v1\/admin\/returns\/([^/]+)\/refund-simulation$/,
  );
  if (adminReturnRefundSimulation && req.method === "POST") {
    const operator = await requireOperator(req);
    if ("response" in operator) return operator.response;
    let body: {
      expected_version?: number;
      operation_key?: string;
      method?: string;
      amount_minor?: number;
      currency_code?: string;
      breakdown?: {
        item_subtotal_minor?: number;
        tax_minor?: number;
        shipping_minor?: number;
        restocking_fee_minor?: number;
        return_freight_minor?: number;
      };
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) {
      return problem(400, "expected-version-required", "expected_version must be a positive integer.");
    }
    const operationKey = body.operation_key?.trim() ||
      req.headers.get("idempotency-key")?.trim() ||
      "";
    if (operationKey.length < 8 || operationKey.length > 200) {
      return problem(400, "operation-key-required", "An operation key between 8 and 200 characters is required.");
    }
    if (!Number.isInteger(body.amount_minor) || Number(body.amount_minor) <= 0) {
      return problem(400, "refund-amount-required", "amount_minor must be a positive integer.");
    }
    if (body.currency_code?.trim().toUpperCase() !== "INR") {
      return problem(400, "unsupported-refund-currency", "currency_code must be INR.");
    }
    if (
      body.method !== "original_method_simulation" &&
      body.method !== "cod_bank_transfer_simulation"
    ) {
      return problem(400, "invalid-refund-method", "A supported simulated refund method is required.");
    }
    const breakdown = body.breakdown;
    const breakdownValues = breakdown
      ? [
          breakdown.item_subtotal_minor,
          breakdown.tax_minor,
          breakdown.shipping_minor,
          breakdown.restocking_fee_minor,
          breakdown.return_freight_minor,
        ]
      : [];
    if (
      breakdownValues.length !== 5 ||
      breakdownValues.some((value) => !Number.isInteger(value) || Number(value) < 0)
    ) {
      return problem(
        400,
        "invalid-refund-breakdown",
        "Every refund simulation breakdown value must be a non-negative integer.",
      );
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
      const result = await returns.recordRefundSimulation({
        id: adminReturnRefundSimulation[1],
        expectedVersion: Number(body.expected_version),
        operationKey,
        actorId: operator.user.id,
        actorRole: "marketplace_operator",
        method: body.method,
        amountMinor: Number(body.amount_minor),
        currencyCode: body.currency_code!,
        breakdown: {
          itemSubtotalMinor: Number(breakdown!.item_subtotal_minor),
          taxMinor: Number(breakdown!.tax_minor),
          shippingMinor: Number(breakdown!.shipping_minor),
          restockingFeeMinor: Number(breakdown!.restocking_fee_minor),
          returnFreightMinor: Number(breakdown!.return_freight_minor),
        },
      });
      if (!result.duplicate) {
        const simulation = result.refundSimulation;
        await events.append({
          event_type: "return.refund_simulation_recorded",
          aggregate_type: "return",
          aggregate_id: result.returnCase.id,
          correlation_id: cid,
          payload: {
            return_id: result.returnCase.id,
            order_id: result.returnCase.orderId,
            order_group_id: result.returnCase.orderGroupId,
            return_status: result.returnCase.status,
            refund_simulation_id: simulation.id,
            status: simulation.status,
            amount: {
              amount_minor: simulation.amountMinor,
              currency_code: simulation.currencyCode,
            },
            method: simulation.method,
            simulation_reference: simulation.simulationReference,
            breakdown: {
              item_subtotal_minor: simulation.breakdown.itemSubtotalMinor,
              tax_minor: simulation.breakdown.taxMinor,
              shipping_minor: simulation.breakdown.shippingMinor,
              restocking_fee_minor: simulation.breakdown.restockingFeeMinor,
              return_freight_minor: simulation.breakdown.returnFreightMinor,
            },
            recorded_at: simulation.recordedAt,
            test_data: true,
            simulated: true,
            money_effect: "none",
            stock_effect: "none",
          },
        });
      }
      await privilegedAudit.complete(auditId, 200);
      return json({
        return: result.returnCase,
        refund_simulation: result.refundSimulation,
        duplicate: result.duplicate,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = code === "return-not-found"
        ? 404
        : code === "return-version-conflict" ||
            code === "return-not-refundable" ||
            code === "refund-simulation-exists" ||
            code === "idempotency-key-reuse"
          ? 409
          : 400;
      await privilegedAudit.complete(auditId, status);
      return problem(status, code ?? "return-refund-simulation-failed", (error as Error).message);
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
  // U-003 D1: exactly one offer is active per cart. Applying a code replaces the current offer and
  // a rejection restores it. Removing an offer is sticky for that cart (D2): the store-applied
  // FLAT5 never returns on a refresh, quantity change or checkout. The engine still decides
  // eligibility; the BFF only translates its answer and never advertises an ungranted discount.
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
    if (req.method === "POST" && codes.length > 1) {
      return problem(
        400,
        "invalid-promotion-code",
        "Only one promotion code can be applied at a time.",
      );
    }

    try {
      if (req.method === "DELETE") {
        const removed: string[] = [];
        const rejected: { code: string; reason: string }[] = [];
        for (const target of codes) {
          try {
            await medusa.removePromotion(cartId, target);
            removed.push(target);
          } catch (error) {
            rejected.push({
              code: target,
              reason: promotionRejectionReason((error as Error).message),
            });
          }
        }
        const cart = await medusa.getCart(cartId);
        const metadata = offerMetadata(cart, { appliedCode: null, optedOut: true });
        try {
          await medusa.updateCartMetadata(cartId, metadata);
        } catch {
          // The removal is already true on the cart; never turn it into a failure.
        }
        if (!removed.length && rejected.length) {
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
          ...composeCartView({ ...cart, metadata }),
          applied_codes: removed,
          rejected_codes: rejected,
          environment: config.environment,
          test_data: true,
          correlation_id: cid,
        });
      }

      const code = codes[0];
      const current = await medusa.getCart(cartId);
      const previousCodes = appliedPromotionCodes(current);
      if (
        previousCodes.length === 1 &&
        previousCodes[0].toLowerCase() === code.toLowerCase()
      ) {
        return json({
          ...composeCartView(current),
          applied_codes: [code],
          rejected_codes: [],
          environment: config.environment,
          test_data: true,
          correlation_id: cid,
        });
      }

      for (const previous of previousCodes) {
        try {
          await medusa.removePromotion(cartId, previous);
        } catch {
          // Engine-owned automatic promotions cannot be removed; the guard below catches leftovers.
        }
      }

      let cart: StoreCart | null = null;
      let rejection: string | null = null;
      try {
        cart = await medusa.addPromotion(cartId, code);
        // Medusa can accept a code and still grant nothing (for example when no line matches the
        // promotion's target). Only a code present on the returned cart is a real application.
        if (!hasPromotionCode(cart, code)) rejection = "not_eligible";
      } catch (error) {
        rejection = promotionRejectionReason((error as Error).message);
      }

      if (!rejection && cart) {
        // One offer at a time: if the engine kept an older promotion, drop it before returning.
        const extras = appliedPromotionCodes(cart).filter(
          (appliedCode) => appliedCode.toLowerCase() !== code.toLowerCase(),
        );
        for (const extra of extras) {
          try {
            await medusa.removePromotion(cartId, extra);
          } catch {
            // fall through to the read-back check
          }
        }
        if (extras.length) {
          const refreshed = await medusa.getCart(cartId).catch(() => null);
          if (refreshed) cart = refreshed;
        }
        if (appliedPromotionCodes(cart).length > 1) {
          // The engine refuses to release an offer. Refuse the swap rather than show 15%.
          for (const appliedCode of appliedPromotionCodes(cart)) {
            try {
              await medusa.removePromotion(cartId, appliedCode);
            } catch {
              // best effort
            }
          }
          for (const previous of previousCodes) {
            try {
              await medusa.addPromotion(cartId, previous);
            } catch {
              // best effort
            }
          }
          return json({
            type: "promotion-rejected",
            title: "promotion-rejected",
            status: 422,
            rejected_codes: [{ code, reason: "not_eligible" }],
            restored_codes: previousCodes,
            environment: config.environment,
            test_data: true,
            correlation_id: cid,
          }, 422);
        }
        const metadata = offerMetadata(cart, { appliedCode: null, optedOut: true });
        try {
          await medusa.updateCartMetadata(cartId, metadata);
        } catch {
          // The applied code is already on the cart; keep the discount visible.
        }
        return json({
          ...composeCartView({ ...cart, metadata }),
          applied_codes: [code],
          rejected_codes: [],
          environment: config.environment,
          test_data: true,
          correlation_id: cid,
        });
      }

      // Rejected: keep the customer's current offer and return the engine's reason.
      for (const previous of previousCodes) {
        try {
          await medusa.addPromotion(cartId, previous);
        } catch {
          // best effort restore
        }
      }
      return json({
        type: "promotion-rejected",
        title: "promotion-rejected",
        status: 422,
        rejected_codes: [{ code, reason: rejection ?? "not_eligible" }],
        restored_codes: previousCodes,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      }, 422);
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/checkouts/razorpay/start — create the cart and Razorpay order.
  if (url.pathname === "/v1/checkouts/razorpay/start" && req.method === "POST") {
    if (config.paymentAdapterMode !== "provider" || !config.razorpayKeySecret) {
      return problem(503, "razorpay-not-configured", "Razorpay is not enabled.");
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON checkout body.");
    }
    const requestedChannel = body.channel === "b2b" ? "b2b" : "b2c";
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines = rawLines
      .map((line) => {
        if (!line || typeof line !== "object") return null;
        const entry = line as { offerId?: unknown; quantity?: unknown; channel?: unknown };
        const offerId = typeof entry.offerId === "string" ? entry.offerId.trim() : "";
        const quantity = Number(entry.quantity);
        if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          return null;
        }
        return {
          offerId,
          quantity,
          channel: entry.channel === "b2b" ? "b2b" : "b2c",
        };
      })
      .filter(
        (line): line is { offerId: string; quantity: number; channel: "b2c" | "b2b" } =>
          line !== null,
      );
    if (lines.length === 0) return problem(400, "empty-cart", "The cart is empty.");
    if (lines.length > 30) return problem(400, "too-many-lines", "This cart has too many lines.");
    if (new Set(lines.map((line) => line.channel)).size !== 1 || lines[0].channel !== requestedChannel) {
      return problem(400, "mixed-cart", "The cart channel does not match its items.");
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim().slice(0, 80) : "";
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim().slice(0, 80) : "";
    const address1 =
      typeof body.address1 === "string" ? body.address1.trim().slice(0, 240) : "";
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
    const postalCode =
      typeof body.postalCode === "string"
        ? body.postalCode.replace(/\D/g, "").slice(0, 6)
        : "";
    if (!email || !firstName || !lastName || !address1 || !city || !/^\d{6}$/.test(postalCode)) {
      return problem(
        400,
        "invalid-customer-details",
        "Email, name, address, city and a six-digit postal code are required.",
      );
    }
    const token = bearerToken(req);
    let authenticated: Exclude<AuthenticationResult, { response: Response }> | null = null;
    if (token) {
      const candidate = await authenticate(req);
      if ("response" in candidate) return candidate.response;
      authenticated = candidate;
      if (!hasAnyRole(authenticated.authorization, [
        "customer",
        "b2b_buyer",
        "b2b_account_admin",
        "b2b_approver",
      ])) {
        return problem(403, "checkout-forbidden", "This account cannot check out.");
      }
    }
    if (!authenticated && requestedChannel !== "b2c") {
      return problem(403, "sign-in-required", "Sign in to place a trade order.");
    }
    if (authenticated && requestedChannel === "b2b" && !isBusinessBuyer(authenticated.authorization)) {
      return problem(403, "trade-access-required", "A trade-enabled account is required.");
    }
    const effectiveEmail = authenticated?.user.email ?? email;
    if (authenticated && email && email !== effectiveEmail.toLowerCase()) {
      return problem(403, "identity-mismatch", "Checkout email must match the signed-in account.");
    }
    const rawMobile = typeof body.mobile === "string" ? body.mobile : "";
    const mobile = rawMobile ? normalizeIndianMobile(rawMobile) : null;
    if (!authenticated && !mobile) {
      return problem(400, "mobile-required", "A valid Indian mobile number is required.");
    }
    try {
      const prepared = await prepareRazorpayCart({
        lines: lines.map((line) => ({ offerId: line.offerId, quantity: line.quantity })),
        email: effectiveEmail,
        mobile: mobile ?? undefined,
        firstName,
        lastName,
        address1,
        city,
        postalCode,
        promoCode:
          typeof body.promoCode === "string"
            ? body.promoCode.trim().slice(0, 40) || undefined
            : undefined,
        channel: requestedChannel,
        regionId: authenticated ? regionFor(authenticated.authorization) : config.medusaRegionId,
        customerEmail: authenticated?.user.email,
        businessAccountId: authenticated?.authorization.businessAccountId,
      });
      if (authenticated) {
        await correlation.link(prepared.cart.id, { ownerUserId: authenticated.user.id });
      }
      const checkoutToken =
        authenticated
          ? null
          : signCheckoutToken({
              cartId: prepared.cart.id,
              collectionId: prepared.collection.id,
              sessionId: prepared.session.id,
              email: effectiveEmail,
              mobile: mobile!,
              exp: Date.now() + 30 * 60 * 1000,
            });
      return json(
        {
          cart_id: prepared.cart.id,
          payment_collection_id: prepared.collection.id,
          payment_session_id: prepared.session.id,
          razorpay_order_id: prepared.orderId,
          razorpay_key_id: prepared.keyId,
          amount_minor: prepared.amountMinor,
          currency: prepared.currency,
          checkout_token: checkoutToken,
          test_data: prepared.keyId.startsWith("rzp_test"),
          environment: config.environment,
          correlation_id: cid,
        },
        201,
      );
    } catch (error) {
      if ((error as { code?: string }).code === "promotion-rejected") {
        return problem(400, "promotion-rejected", "That promo code is not eligible for this cart.");
      }
      return problem(502, "razorpay-start-failed", (error as Error).message);
    }
  }

  // POST /v1/checkouts/razorpay/confirm — verify the Razorpay signature and complete the order.
  if (url.pathname === "/v1/checkouts/razorpay/confirm" && req.method === "POST") {
    if (config.paymentAdapterMode !== "provider" || !config.razorpayKeySecret) {
      return problem(503, "razorpay-not-configured", "Razorpay is not enabled.");
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON confirmation body.");
    }
    const cartId = typeof body.cart_id === "string" ? body.cart_id.trim() : "";
    const collectionId =
      typeof body.payment_collection_id === "string"
        ? body.payment_collection_id.trim()
        : "";
    const sessionId =
      typeof body.payment_session_id === "string" ? body.payment_session_id.trim() : "";
    const paymentId =
      typeof body.razorpay_payment_id === "string"
        ? body.razorpay_payment_id.trim()
        : "";
    const orderId =
      typeof body.razorpay_order_id === "string" ? body.razorpay_order_id.trim() : "";
    const signature =
      typeof body.razorpay_signature === "string"
        ? body.razorpay_signature.trim()
        : "";
    if (!cartId || !collectionId || !sessionId || !paymentId || !orderId || !signature) {
      return problem(
        400,
        "invalid-razorpay-confirmation",
        "Cart, payment session, payment, order and signature are required.",
      );
    }
    const expectedSignature = createHmac("sha256", config.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    if (
      expectedSignature.length !== signature.length ||
      !timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    ) {
      return problem(400, "invalid-razorpay-signature", "Razorpay signature verification failed.");
    }
    const bearer = bearerToken(req);
    let authenticated: Exclude<AuthenticationResult, { response: Response }> | null = null;
    if (bearer) {
      const candidate = await authenticate(req);
      if ("response" in candidate) return candidate.response;
      authenticated = candidate;
    }
    let guest:
      | { email: string; mobile: string }
      | undefined;
    if (!authenticated) {
      const checkoutToken =
        typeof body.checkout_token === "string" ? body.checkout_token.trim() : "";
      const payload = checkoutToken ? verifyCheckoutToken(checkoutToken) : null;
      if (
        !payload ||
        payload.cartId !== cartId ||
        payload.collectionId !== collectionId ||
        payload.sessionId !== sessionId
      ) {
        return problem(401, "checkout-token-invalid", "The guest checkout session is invalid.");
      }
      guest = { email: payload.email, mobile: payload.mobile };
    } else {
      const owner = await authorizeCheckoutOwner(req, cartId);
      if ("response" in owner) return owner.response;
    }
    const cart = await medusa.getCart(cartId);
    if (String(cart.metadata?.razorpay_order_id ?? "") !== orderId) {
      return problem(409, "razorpay-order-mismatch", "The Razorpay order does not match this cart.");
    }
    return completeCanonicalCart({
      cartId,
      regionId: authenticated
        ? regionFor(authenticated.authorization)
        : config.medusaRegionId,
      cid,
      ownerUserId: authenticated?.user.id,
      guest,
      payment: {
        collectionId,
        sessionId,
        providerId: RAZORPAY_PAYMENT_PROVIDER_ID,
        providerPaymentId: paymentId,
        providerStatus: "captured",
      },
    });
  }

  // POST /v1/checkouts/razorpay/status — fallback when Razorpay's browser callback is delayed
  // or blocked. It only completes when Razorpay reports a captured/authorized payment.
  if (url.pathname === "/v1/checkouts/razorpay/status" && req.method === "POST") {
    if (config.paymentAdapterMode !== "provider") {
      return problem(503, "razorpay-not-configured", "Razorpay is not enabled.");
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON status body.");
    }
    const cartId = typeof body.cart_id === "string" ? body.cart_id.trim() : "";
    const collectionId =
      typeof body.payment_collection_id === "string"
        ? body.payment_collection_id.trim()
        : "";
    const sessionId =
      typeof body.payment_session_id === "string" ? body.payment_session_id.trim() : "";
    if (!cartId || !collectionId || !sessionId) {
      return problem(400, "invalid-razorpay-status", "Cart, payment collection and session are required.");
    }
    const bearer = bearerToken(req);
    let authenticated: Exclude<AuthenticationResult, { response: Response }> | null = null;
    if (bearer) {
      const candidate = await authenticate(req);
      if ("response" in candidate) return candidate.response;
      authenticated = candidate;
    }
    let guest: { email: string; mobile: string } | undefined;
    if (!authenticated) {
      const checkoutToken =
        typeof body.checkout_token === "string" ? body.checkout_token.trim() : "";
      const payload = checkoutToken ? verifyCheckoutToken(checkoutToken) : null;
      if (
        !payload ||
        payload.cartId !== cartId ||
        payload.collectionId !== collectionId ||
        payload.sessionId !== sessionId
      ) {
        return problem(401, "checkout-token-invalid", "The guest checkout session is invalid.");
      }
      guest = { email: payload.email, mobile: payload.mobile };
    } else {
      const owner = await authorizeCheckoutOwner(req, cartId);
      if ("response" in owner) return owner.response;
    }
    const cart = await medusa.getCart(cartId);
    const orderId = String(cart.metadata?.razorpay_order_id ?? "");
    if (!orderId) {
      return problem(409, "razorpay-order-missing", "This cart has no Razorpay order.");
    }
    try {
      const captured = await razorpayCapturedPayment(orderId);
      if (!captured) return json({ status: "pending" });
      return completeCanonicalCart({
        cartId,
        regionId: authenticated
          ? regionFor(authenticated.authorization)
          : config.medusaRegionId,
        cid,
        ownerUserId: authenticated?.user.id,
        guest,
        payment: {
          collectionId,
          sessionId,
          providerId: RAZORPAY_PAYMENT_PROVIDER_ID,
          providerPaymentId: captured.id,
          providerStatus: captured.status,
        },
      });
    } catch (error) {
      return problem(502, "razorpay-status-failed", (error as Error).message);
    }
  }

  // POST /v1/checkouts/cod/place — seller-collected cash on delivery. The order is
  // confirmed with cash due; no gateway is called and no payment is captured.
  if (url.pathname === "/v1/checkouts/cod/place" && req.method === "POST") {
    if (config.paymentAdapterMode !== "provider") {
      return problem(503, "cod-not-configured", "Cash on delivery is not enabled.");
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON checkout body.");
    }
    const parsed = parseCheckoutFields(body);
    if (!parsed.ok) return problem(parsed.status, parsed.code, parsed.message);
    const { channel: requestedChannel, lines, email, firstName, lastName, address1, city, postalCode } =
      parsed.fields;
    const token = bearerToken(req);
    let authenticated: Exclude<AuthenticationResult, { response: Response }> | null = null;
    if (token) {
      const candidate = await authenticate(req);
      if ("response" in candidate) return candidate.response;
      authenticated = candidate;
      if (!hasAnyRole(authenticated.authorization, [
        "customer",
        "b2b_buyer",
        "b2b_account_admin",
        "b2b_approver",
      ])) {
        return problem(403, "checkout-forbidden", "This account cannot check out.");
      }
    }
    if (!authenticated && requestedChannel !== "b2c") {
      return problem(403, "sign-in-required", "Sign in to place a trade order.");
    }
    if (authenticated && requestedChannel === "b2b" && !isBusinessBuyer(authenticated.authorization)) {
      return problem(403, "trade-access-required", "A trade-enabled account is required.");
    }
    const effectiveEmail = authenticated?.user.email ?? email;
    if (authenticated && email && email !== effectiveEmail.toLowerCase()) {
      return problem(403, "identity-mismatch", "Checkout email must match the signed-in account.");
    }
    const rawMobile = typeof body.mobile === "string" ? body.mobile : "";
    const mobile = rawMobile ? normalizeIndianMobile(rawMobile) : null;
    if (!authenticated && !mobile) {
      return problem(400, "mobile-required", "A valid Indian mobile number is required.");
    }
    const idempotencyKey = (req.headers.get("idempotency-key") ?? "").trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return problem(
        400,
        "idempotency-key-required",
        "A stable idempotency-key header is required for COD placement.",
      );
    }
    const buyerScope = authenticated?.user.id ?? `guest:${effectiveEmail}`;
    const promoCode =
      typeof body.promoCode === "string"
        ? body.promoCode.trim().slice(0, 40) || undefined
        : undefined;
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          lines,
          email: effectiveEmail,
          mobile,
          firstName,
          lastName,
          address1,
          city,
          postalCode,
          promoCode: promoCode ?? null,
          channel: requestedChannel,
        }),
      )
      .digest("hex");
    const claim = await codStore.beginRequest(buyerScope, idempotencyKey, requestHash);
    if (claim.state === "replay") {
      return json({ ...claim.response, idempotent_replay: true }, 200);
    }
    if (claim.state === "conflict") {
      return problem(
        409,
        "idempotency-conflict",
        "This idempotency key was already used with different checkout details.",
      );
    }
    if (claim.state === "in-flight") {
      return problem(
        409,
        "checkout-in-progress",
        "This checkout is already being placed. Please wait.",
      );
    }
    try {
      const prepared = await prepareCodCart({
        lines: lines.map((line) => ({ offerId: line.offerId, quantity: line.quantity })),
        email: effectiveEmail,
        mobile: mobile ?? undefined,
        firstName,
        lastName,
        address1,
        city,
        postalCode,
        promoCode,
        channel: requestedChannel,
        regionId: authenticated ? regionFor(authenticated.authorization) : config.medusaRegionId,
        customerEmail: authenticated?.user.email,
        businessAccountId: authenticated?.authorization.businessAccountId,
        buyerScope,
      });
      if (authenticated) {
        await correlation.link(prepared.cart.id, { ownerUserId: authenticated.user.id });
      }
      const completion = await completeCanonicalCart({
        cartId: prepared.cart.id,
        regionId: authenticated
          ? regionFor(authenticated.authorization)
          : config.medusaRegionId,
        cid,
        ownerUserId: authenticated?.user.id,
        guest: authenticated
          ? undefined
          : { email: effectiveEmail, mobile: mobile! },
        payment: {
          collectionId: prepared.collection.id,
          sessionId: prepared.session.id,
          providerId: COD_PAYMENT_PROVIDER_ID,
          method: "cod",
          expectedMinor: prepared.amountMinor,
        },
      });
      if (!completion.ok) {
        await codStore.clearRequest(buyerScope, idempotencyKey);
        return completion;
      }
      const payload = (await completion.clone().json()) as Record<string, unknown>;
      const orderGroup = payload.order_group as { id?: string } | undefined;
      if (payload.type === "order_group" && orderGroup?.id) {
        await codStore.ensureCollection({
          orderGroupId: orderGroup.id,
          checkoutRef: prepared.cart.id,
          buyerScope,
          expectedMinor: prepared.amountMinor,
        });
      }
      await codStore.completeRequest(
        buyerScope,
        idempotencyKey,
        prepared.cart.id,
        payload,
      );
      return completion;
    } catch (error) {
      await codStore.clearRequest(buyerScope, idempotencyKey).catch(() => undefined);
      if ((error as { code?: string }).code === "promotion-rejected") {
        return problem(400, "promotion-rejected", "That promo code is not eligible for this cart.");
      }
      if ((error as { code?: string }).code === "cod-not-eligible") {
        return problem(400, "cod-not-eligible", (error as Error).message);
      }
      return problem(502, "cod-checkout-failed", (error as Error).message);
    }
  }

  // Seller COD cash capture. The seller records what was actually collected at delivery.
  const sellerCod = url.pathname.match(/^\/v1\/seller\/shipments\/([^/]+)\/cod$/);
  if (sellerCod) {
    const seller = await requireSeller(req);
    if ("response" in seller) return seller.response;
    const sellerId = seller.authorization.sellerId!;
    const shipment = await logistics.get(sellerCod[1]);
    if (!shipment || shipment.sellerId !== sellerId) return problem(404, "shipment-not-found");
    const record = await correlation.getByOrderGroup(shipment.orderGroupId);
    if (!record || record.payment_evidence?.payment_mode !== "cod") {
      return problem(409, "not-a-cod-order", "This shipment is not a cash-on-delivery order.");
    }
    const expectedMinor = Number(record.payment_evidence?.expected_minor ?? 0);
    const group = record.medusa_order_group ?? {};
    const buyerScope =
      record.owner_user_id ??
      `guest:${String((group.guest_contact as { email?: string } | undefined)?.email ?? "")}`;
    const collection = await codStore.ensureCollection({
      orderGroupId: shipment.orderGroupId,
      checkoutRef: record.checkout_ref,
      buyerScope,
      expectedMinor,
    });
    if (req.method === "GET") {
      return json({
        collection,
        events: await codStore.listEvents(shipment.orderGroupId),
        dues: await codStore.listDues({ sellerId, limit: 50 }),
        seller_id: sellerId,
        test_data: config.environment !== "production",
        correlation_id: cid,
      });
    }
    if (req.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return problem(400, "invalid-request-body", "Expected a JSON body.");
      }
      const status = body.status === "short" || body.status === "refused" ? body.status : "collected";
      const amount = Math.round(Number(body.amount_minor ?? 0));
      const proof = typeof body.proof_ref === "string" ? body.proof_ref.trim().slice(0, 200) : "";
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (status === "collected" && !proof) {
        return problem(400, "proof-required", "A proof reference is required for cash collection.");
      }
      if (status !== "collected" && !reason) {
        return problem(400, "reason-required", "A reason is required for a short or refused entry.");
      }
      try {
        const updated = await codStore.recordCollection({
          orderGroupId: shipment.orderGroupId,
          status,
          collectedMinor: amount,
          collectorKind: "seller",
          collectorUserId: seller.user.id,
          proofRef: proof || null,
          reason: reason || null,
          actorRoles: seller.authorization.roles,
          eventType: "cod.seller_recorded",
          expectedVersion:
            typeof body.expected_version === "number" ? body.expected_version : undefined,
        });
        const policy = await codStore.getPolicy(sellerId);
        if (policy) {
          await postCodDues({
            orderGroupId: shipment.orderGroupId,
            record,
            sellerId,
            policy,
            status,
            period: updated.collected_at,
          });
        }
        return json({
          collection: updated,
          events: await codStore.listEvents(shipment.orderGroupId),
          dues: await codStore.listDues({ sellerId, limit: 50 }),
          seller_id: sellerId,
          test_data: config.environment !== "production",
          correlation_id: cid,
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "version-conflict") return problem(409, code, (error as Error).message);
        if (code === "amount-mismatch" || code === "invalid-transition" || code === "not-found") {
          return problem(400, code, (error as Error).message);
        }
        return problem(502, "cod-capture-failed", (error as Error).message);
      }
    }
  }

  // Admin COD correction and readback. Corrections always carry a reason and an audit event.
  const adminCod = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/cod$/);
  if (adminCod) {
    const operator = await requireAnyRole(req, [
      "super_admin",
      "marketplace_operator",
      "finance_operator",
      "erp_operator",
    ]);
    if ("response" in operator) return operator.response;
    const orderGroupId = adminCod[1];
    const record = await correlation.getByOrderGroup(orderGroupId);
    if (!record || record.payment_evidence?.payment_mode !== "cod") {
      return problem(409, "not-a-cod-order", "This order is not cash on delivery.");
    }
    const expectedMinor = Number(record.payment_evidence?.expected_minor ?? 0);
    const group = record.medusa_order_group ?? {};
    const buyerScope =
      record.owner_user_id ??
      `guest:${String((group.guest_contact as { email?: string } | undefined)?.email ?? "")}`;
    const collection = await codStore.ensureCollection({
      orderGroupId,
      checkoutRef: record.checkout_ref,
      buyerScope,
      expectedMinor,
    });
    if (req.method === "GET") {
      return json({
        collection,
        events: await codStore.listEvents(orderGroupId),
        test_data: config.environment !== "production",
        correlation_id: cid,
      });
    }
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const status = body.status === "short" || body.status === "refused" ? body.status : "collected";
    const amount = Math.round(Number(body.amount_minor ?? 0));
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) {
      return problem(400, "reason-required", "An admin COD correction requires a reason.");
    }
    try {
      const updated = await codStore.recordCollection({
        orderGroupId,
        status,
        collectedMinor: amount,
        collectorKind: "admin",
        collectorUserId: operator.user.id,
        proofRef:
          typeof body.proof_ref === "string" ? body.proof_ref.trim().slice(0, 200) : null,
        reason,
        actorRoles: operator.authorization.roles,
        eventType: "cod.admin_corrected",
        expectedVersion:
          typeof body.expected_version === "number" ? body.expected_version : undefined,
      });
      return json({
        collection: updated,
        events: await codStore.listEvents(orderGroupId),
        test_data: config.environment !== "production",
        correlation_id: cid,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "version-conflict") return problem(409, code, (error as Error).message);
      if (code === "amount-mismatch" || code === "invalid-transition" || code === "not-found") {
        return problem(400, code, (error as Error).message);
      }
      return problem(502, "cod-correction-failed", (error as Error).message);
    }
  }

  // POST /v1/guest/cart-quote — public B2C quote without creating an account.
  if (url.pathname === "/v1/guest/cart-quote" && req.method === "POST") {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON quote body.");
    }
    const parsed = parseGuestQuoteBody(raw);
    if (!parsed.ok) return problem(400, "invalid-guest-quote", parsed.error);
    try {
      const cart = await prepareGuestCart({
        lines: parsed.value.lines,
        email: `guest-quote+${randomUUID()}@bazarbee.invalid`,
        firstName: "Guest",
        lastName: "Buyer",
        address1: "Quote address",
        city: "Jaipur",
        postalCode: parsed.value.postalCode,
        promoCode: parsed.value.promoCode,
      });
      return json({
        ...composeCartView(cart),
        item_count: cart.items?.length ?? 0,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "promotion-rejected") {
        return problem(400, "promotion-rejected", "That promo code is not eligible for this cart.");
      }
      return problem(502, "upstream-error", (error as Error).message);
    }
  }

  // POST /v1/guest/checkout — public B2C checkout. An account is never created; the normalized
  // mobile and email are stored on the order so delivery and support can reach the buyer.
  if (url.pathname === "/v1/guest/checkout" && req.method === "POST") {
    const requestKey = req.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(requestKey)) {
      return problem(
        400,
        "idempotency-key-required",
        "A 16-100 character Idempotency-Key header is required.",
      );
    }
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON checkout body.");
    }
    const parsed = parseGuestCheckoutBody(raw);
    if (!parsed.ok) return problem(400, "invalid-guest-checkout", parsed.error);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(parsed.value))
      .digest("hex");
    let reservation;
    try {
      reservation = await guestCheckout.begin(requestKey, requestHash);
    } catch (error) {
      if ((error as { code?: string }).code === "idempotency-key-reuse") {
        return problem(
          409,
          "idempotency-key-reuse",
          "This checkout key was already used for a different cart.",
        );
      }
      return problem(502, "guest-checkout-store-unavailable", (error as Error).message);
    }
    if (reservation.response) {
      return json({ ...reservation.response, idempotent_replay: true });
    }
    if (reservation.cart_id) {
      return problem(
        409,
        "guest-checkout-in-progress",
        "This checkout is already being processed. Retry shortly.",
      );
    }
    let completionBody: Record<string, unknown> | null = null;
    let cartAttached = false;
    let completionAttempted = false;
    try {
      const cart = await prepareGuestCart(
        parsed.value,
        async (cartId) => {
          const attached = await guestCheckout.attachCart(requestKey, cartId);
          if (!attached) {
            throw Object.assign(new Error("Another guest checkout attempt won the reservation."), {
              code: "guest-checkout-in-progress",
            });
          }
          cartAttached = true;
        },
      );
      completionAttempted = true;
      const response = await completeCanonicalCart({
        cartId: cart.id,
        regionId: config.medusaRegionId,
        cid,
        guest: { email: parsed.value.email, mobile: parsed.value.mobile },
      });
      if (response.status >= 400) {
        // Once a cart exists, keep the reservation. A retry must not create a second order while
        // the first attempt may still have completed in Medusa.
        if (!cartAttached) await guestCheckout.fail(requestKey);
        return response;
      }
      completionBody = (await response.clone().json()) as Record<string, unknown>;
      await guestCheckout.complete(requestKey, completionBody);
      return response;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "guest-checkout-in-progress" && !completionBody && !completionAttempted) {
        await guestCheckout.fail(requestKey).catch(() => undefined);
      }
      if (code === "promotion-rejected") {
        // No order was attempted; release the key so the buyer can retry without the code.
        await guestCheckout.fail(requestKey).catch(() => undefined);
        return problem(400, "promotion-rejected", "That promo code is not eligible for this cart.");
      }
      if (code === "guest-checkout-in-progress") {
        return problem(
          409,
          "guest-checkout-in-progress",
          "This checkout is already being processed. Retry shortly.",
        );
      }
      return problem(502, "upstream-error", (error as Error).message);
    }
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
    // B2B vs B2C is an explicit sales channel. A missing channel defaults to B2C; B2B clients
    // must send b2b_app or b2b_web. This prevents a dual-role tester from creating a trade cart
    // through an API call that omits the channel.
    const wantsB2B = typeof body.channel === "string" && body.channel
      ? body.channel.toLowerCase().startsWith("b2b")
      : false;
    if (
      wantsB2B &&
      !hasAnyRole(authenticated.authorization, [
        "b2b_buyer",
        "b2b_account_admin",
        "b2b_approver",
      ])
    ) {
      return problem(
        403,
        "trade-access-required",
        "A trade-enabled account is required for a B2B cart.",
      );
    }
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
      if (channel === "b2b" && authenticated.authorization.businessAccountId) {
        metadata.business_account_id = authenticated.authorization.businessAccountId;
      } else {
        delete metadata.business_account_id;
      }
      await medusa.updateCartMetadata(cart.id, metadata);
      await correlation.link(cart.id, { ownerUserId: authenticated.user.id });
      return json({
        ...composeCartView({ ...cart, metadata }),
        channel,
        business_account_id:
          channel === "b2b" ? authenticated.authorization.businessAccountId ?? null : null,
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
      await medusa.updateCartCustomerDetails(cartId, {
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
      // R6: the fee resolves from the home-selected address now, not at
      // checkout. Applying here keeps the cart total honest before the
      // customer visits checkout.
      const cart = await applyDeliveryForCart(cartId);
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
          amount: medusaToMinorOr(option.amount),
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

  // POST /v1/carts/{cartId}/delivery — (re)resolve the single Delivery method per seller.
  // Used after an address/pincode change and whenever the cart page reloads.
  const cartDelivery = url.pathname.match(/^\/v1\/carts\/([^/]+)\/delivery$/);
  if (cartDelivery && req.method === "POST") {
    const cartId = cartDelivery[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    try {
      const cart = await applyDeliveryForCart(cartId);
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
      // U-003: the first line makes the cart eligible for the store-applied Flat5% offer. The cart
      // is created empty, so this is the earliest point where the engine can grant it.
      const withOffer = await applyAutomaticOffer(cartId, cart);
      return json({
        ...composeCartView(withOffer),
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

  // POST /v1/checkouts/{cartId}/complete - complete the cart into per-seller orders (Commerce + Marketplace)
  const complete = url.pathname.match(/^\/v1\/checkouts\/([^/]+)\/complete$/);
  if (complete && req.method === "POST") {
    const cartId = complete[1];
    const authenticated = await authorizeCheckoutOwner(req, cartId);
    if ("response" in authenticated) return authenticated.response;
    try {
      return await completeCanonicalCart({
        cartId,
        regionId: regionFor(authenticated.authorization),
        cid,
        ownerUserId: authenticated.user.id,
      });
    } catch (error) {
      return problem(502, "upstream-error", (error as Error).message);
    }
  }
  // POST /v1/internal/catalogue/readiness — server-owned Product Studio visibility diagnostics.
  if (
    url.pathname === "/v1/internal/catalogue/readiness" &&
    req.method === "POST"
  ) {
    const operator = await requireAnyRole(req, [
      "marketplace_operator",
      "super_admin",
    ]);
    if ("response" in operator) return operator.response;
    let body: { product_ids?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    const productIds = Array.isArray(body.product_ids)
      ? [
          ...new Set(
            body.product_ids
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
          ),
        ].slice(0, 50)
      : [];
    if (productIds.length === 0) {
      return problem(
        400,
        "product-ids-required",
        "At least one product id is required.",
      );
    }

    const result = new Map<
      string,
      Record<"b2c" | "b2b", Record<string, unknown>>
    >(
      productIds.map((id) => [
        id,
        {
          b2c: { evaluated: false, visible: false },
          b2b: { evaluated: false, visible: false },
        },
      ]),
    );

    for (const channel of ["b2c", "b2b"] as const) {
      if (channel === "b2b" && !config.medusaB2bSalesChannelId) {
        for (const id of productIds) {
          result.get(id)!.b2b = {
            evaluated: true,
            enabled: false,
            visible: false,
            gates: {
              published_and_channel: false,
              offer: false,
              price: false,
              stock: false,
            },
            blocker: {
              code: "channel_not_enabled",
              message: "B2B sales channel is not enabled.",
            },
          };
        }
        continue;
      }
      const channelId = salesChannelIdFor(channel);
      const availableEntries = await Promise.all(
        productIds.map(async (id) => {
          try {
            return [id, await medusa.getProduct(id, channelId)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      const products = availableEntries
        .map(([, product]) => product)
        .filter((product): product is StoreProduct => product !== null);
      const regionId =
        channel === "b2b"
          ? config.medusaB2bRegionId ?? config.medusaRegionId
          : config.medusaRegionId;
      const offers = await medusa.listOffersByProducts(
        products.map((product) => product.id),
        regionId,
        channelId,
      );
      const offersByProduct = new Map<string, StoreOffer[]>();
      for (const offer of offers) {
        const rows = offersByProduct.get(offer.product_id) ?? [];
        rows.push(offer);
        offersByProduct.set(offer.product_id, rows);
      }

      for (const id of productIds) {
        const product = products.find((candidate) => candidate.id === id);
        if (!product) {
          result.get(id)![channel] = {
            evaluated: true,
            enabled: true,
            visible: false,
            gates: {
              published_and_channel: false,
              offer: false,
              price: false,
              stock: false,
            },
            blocker: {
              code: "not_published_or_not_in_channel",
              message: `Product is not published in ${channel.toUpperCase()} or is not assigned to that channel.`,
            },
          };
          continue;
        }
        const productOffers = offersByProduct.get(id) ?? [];
        const readiness = productCommercialReadiness(
          product,
          productOffers,
          channel,
        );
        const priced = readiness.offerViews.filter(
          (offer) =>
            offer.unit_amount_minor !== null && offer.unit_amount_minor > 0,
        );
        const firstOffer = readiness.offerViews[0] ?? null;
        const firstPriced = priced[0] ?? null;
        const blocker = !readiness.gates.offer
          ? {
              code: "missing_offer",
              message: `No seller offer is available in ${channel.toUpperCase()}.`,
            }
          : !readiness.gates.price
            ? {
                code: "missing_price",
                message:
                  channel === "b2b"
                    ? "No active B2B price is saved for this seller offer."
                    : "No positive B2C price is saved for this seller offer.",
                variant_id: firstOffer?.variant_id ?? null,
                offer_id: firstOffer?.id ?? null,
                seller_name: firstOffer?.seller_name ?? null,
              }
            : !readiness.gates.stock
              ? {
                  code: "out_of_stock",
                  message: "Priced seller offers have no sellable stock.",
                  variant_id: firstPriced?.variant_id ?? null,
                  offer_id: firstPriced?.id ?? null,
                  seller_name: firstPriced?.seller_name ?? null,
                }
              : null;
        result.get(id)![channel] = {
          evaluated: true,
          enabled: true,
          visible: readiness.visible,
          selected_offer: readiness.selected,
          gates: readiness.gates,
          blocker,
          checked_at: new Date().toISOString(),
        };
      }
    }

    return json({
      items: productIds.map((productId) => ({
        product_id: productId,
        channels: result.get(productId),
      })),
      rule: "published + channel + positive channel price + in-stock seller offer",
      environment: config.environment,
      correlation_id: cid,
    });
  }

  // GET /v1/products — composed commercially-ready products.
  // `catalogue_import` is retained only as an explicit diagnostic filter for old links.
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
      const channelId = salesChannelIdFor(channel);
      let candidates: Awaited<ReturnType<typeof medusa.listProducts>> = [];
      if (collectionId) {
        candidates = await medusa.listProductsByCollection(
          collectionId,
          Math.min(MAX_CATALOGUE_SCAN, 250),
          channelId,
        );
      } else {
        for (
          let start = 0;
          start < MAX_CATALOGUE_SCAN;
          start += CATALOGUE_SCAN_PAGE_SIZE
        ) {
          const page = await medusa.listProducts(
            CATALOGUE_SCAN_PAGE_SIZE,
            start,
            channelId,
          );
          candidates.push(...page);
          if (page.length < CATALOGUE_SCAN_PAGE_SIZE) break;
        }
      }
      // Kept only as an explicit diagnostic filter for old links. Default visibility never depends
      // on a change-id marker; it is evaluated from commercial readiness below.
      if (catalogueImport) {
        candidates = candidates.filter(
          (product) =>
            String(product.metadata?.catalogue_import ?? "") ===
            catalogueImport,
        );
      }
      const productsMs = performance.now() - t0;

      const productIds = candidates.map((product) => product.id);
      const t1 = performance.now();
      const { offers: allOffers, cacheHit } = await getOffersCached(
        productIds,
        `${config.medusaCountryCode}:inr:${channel}`,
        regionId,
        channelId,
      );
      const offersMs = performance.now() - t1;

      const t2 = performance.now();
      const offersByProduct = new Map<string, StoreOffer[]>();
      for (const o of allOffers) {
        const list = offersByProduct.get(o.product_id) ?? [];
        list.push(o);
        offersByProduct.set(o.product_id, list);
      }
      const commerciallyReady = candidates.flatMap((p) => {
        const offers = offersByProduct.get(p.id) ?? [];
        const readiness = productCommercialReadiness(p, offers, channel);
        if (!readiness.visible) return [];
        return [{
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
          variants: composeVariantPrices(
            p.variants,
            offers,
            readiness.composeOptions,
          ),
          best_price: readiness.selected,
          offer_count: offers.length,
          image_quality_score: imageQualityScore(p.id),
          image_quality_fixture: p.metadata?.catalogue_import === "CHG-049" ? "CHG-060" : null,
        }];
      });
      const ordered = orderByImageQuality(commerciallyReady);
      const totalCount = ordered.length;
      const composed = ordered.slice(offset, offset + limit);
      const composeMs = performance.now() - t2;

      return json({
        products: composed,
        count: totalCount,
        limit,
        offset,
        channel,
        visibility_rule: "commercial_readiness",
        legacy_filter_applied: catalogueImport || null,
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
      let p: StoreProduct;
      try {
        p = await medusa.getProduct(productId, salesChannelIdFor(channel));
      } catch {
        // Medusa hides draft/unpublished records, so an unavailable id is a normal storefront 404 —
        // never an upstream 502. This keeps archived records indistinguishable from unknown ones.
        return problem(
          404,
          "product-not-found",
          "The product is not available in this channel.",
        );
      }
      const productMs = performance.now() - t0;

      const t1 = performance.now();
      const { offers, cacheHit } = await getOffersCached(
        [productId],
        context,
        regionId,
        salesChannelIdFor(channel),
      );
      const offersMs = performance.now() - t1;

      const t2 = performance.now();
      const readiness = productCommercialReadiness(p, offers, channel);
      const composeMs = performance.now() - t2;

      if (!readiness.visible) {
        return problem(
          404,
          "product-not-commercially-ready",
          "The product is not available in this channel.",
        );
      }

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
        variants: composeVariantPrices(
          p.variants,
          offers,
          readiness.composeOptions,
        ),
        offers: readiness.offerViews,
        channel,
        cache_hit: cacheHit,
        timing_ms: {
          product_fetch: Math.round(productMs * 10) / 10,
          offers: Math.round(offersMs * 10) / 10,
          composition: Math.round(composeMs * 10) / 10,
        },
        commercial: {
          selected_seller: readiness.selected,
          payment_eligibility: [config.paymentAdapterMode],
          moq: readiness.selected?.b2b_moq ?? null,
          quantity_tiers: readiness.selected?.b2b_tiers ?? null,
          visibility_rule: "commercial_readiness",
          gates: readiness.gates,
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

  // GET /v1/admin/pilot-users — test-user access directory and the roles an operator can grant.
  // The environment assignment is the baseline; a database override wins until changed again.
  if (url.pathname === "/v1/admin/pilot-users" && req.method === "GET") {
    const operator = await requireAnyRole(req, ["super_admin"]);
    if ("response" in operator) return operator.response;
    const overrides = await pilotAccess.list();
    const byUser = new Map(overrides.map((assignment) => [assignment.userId, assignment]));
    const roleSet = new Set<string>(PILOT_ROLES);
    const users = pilotDirectory.users.map((user) => {
      const override = byUser.get(user.id);
      const environment = pilotAuthorizations.get(user.id);
      const assignment = override ?? environment;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: (assignment?.roles ?? []).filter((role) => roleSet.has(role)),
        business_account_id: assignment?.businessAccountId ?? null,
        seller_id: assignment?.sellerId ?? null,
        source: override ? "override" : "environment",
        updated_at: override?.updatedAt ?? null,
        updated_by: override?.updatedBy ?? null,
      };
    });
    return json({
      users,
      roles: PILOT_ROLES,
      total: users.length,
      environment: config.environment,
      test_data: true,
      correlation_id: cid,
    });
  }

  // POST /v1/admin/pilot-users/grant-all — give every allowlisted tester both channels.
  // Existing seller/operator roles are preserved; a shared staging business is used when the
  // tester has no business account yet.
  if (url.pathname === "/v1/admin/pilot-users/grant-all" && req.method === "POST") {
    const operator = await requireAnyRole(req, ["super_admin"]);
    if ("response" in operator) return operator.response;
    try {
      const changed: Array<Record<string, unknown>> = [];
      for (const user of pilotDirectory.users) {
        const existing =
          (await pilotAccess.get(user.id)) ??
          pilotAuthorizations.get(user.id) ??
          ({ userId: user.id, roles: ["customer"] } as PilotAuthorization);
        const roles = [...new Set([...existing.roles, "customer", "b2b_buyer"])] as PilotRole[];
        const assignment = await pilotAccess.upsert({
          userId: user.id,
          roles,
          businessAccountId: existing.businessAccountId ?? "business_bazarbee_pilot",
          sellerId: existing.sellerId,
          updatedBy: operator.user.id,
        });
        changed.push({
          id: user.id,
          roles: assignment.roles,
          business_account_id: assignment.businessAccountId ?? null,
          seller_id: assignment.sellerId ?? null,
        });
      }
      return json({
        updated: changed.length,
        users: changed,
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "pilot-access-update-failed", (error as Error).message);
    }
  }

  // PATCH /v1/admin/pilot-users/{userId} — update one tester's roles and account scope.
  const pilotUserMatch = url.pathname.match(/^\/v1\/admin\/pilot-users\/([^/]+)$/);
  if (pilotUserMatch && req.method === "PATCH") {
    const operator = await requireAnyRole(req, ["super_admin"]);
    if ("response" in operator) return operator.response;
    const userId = decodeURIComponent(pilotUserMatch[1]);
    const user = pilotDirectory.get(userId);
    if (!user) return problem(404, "pilot-user-not-found", "That pilot user is not allowlisted.");
    let body: {
      roles?: unknown;
      businessAccountId?: unknown;
      sellerId?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return problem(400, "invalid-request-body", "Expected a JSON body.");
    }
    if (!Array.isArray(body.roles) || body.roles.length < 1) {
      return problem(400, "invalid-roles", "At least one role is required.");
    }
    const roles = [...new Set(body.roles.map((role) => String(role)))] as PilotRole[];
    const unknownRole = roles.find((role) => !PILOT_ROLES.includes(role));
    if (unknownRole) {
      return problem(400, "invalid-role", `Unknown pilot role: ${unknownRole}`);
    }
    const businessAccountId =
      typeof body.businessAccountId === "string" && body.businessAccountId.trim()
        ? body.businessAccountId.trim()
        : undefined;
    const sellerId =
      typeof body.sellerId === "string" && body.sellerId.trim()
        ? body.sellerId.trim()
        : undefined;
    if (roles.some((role) => role.startsWith("b2b_")) && !businessAccountId) {
      return problem(
        400,
        "business-account-required",
        "A B2B role requires a business account id.",
      );
    }
    if (roles.some((role) => role.startsWith("seller_")) && !sellerId) {
      return problem(400, "seller-required", "A seller role requires a seller id.");
    }
    try {
      const assignment = await pilotAccess.upsert({
        userId,
        roles,
        businessAccountId,
        sellerId,
        updatedBy: operator.user.id,
      });
      return json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: assignment.roles,
          business_account_id: assignment.businessAccountId ?? null,
          seller_id: assignment.sellerId ?? null,
          source: "override",
          updated_at: assignment.updatedAt ?? null,
          updated_by: assignment.updatedBy ?? null,
        },
        environment: config.environment,
        test_data: true,
        correlation_id: cid,
      });
    } catch (error) {
      return problem(502, "pilot-access-update-failed", (error as Error).message);
    }
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
    const moveRefs = ref?.tryton_moves?.length
      ? ref.tryton_moves
      : ref?.tryton_move_id
        ? [{ move_id: ref.tryton_move_id, sku: "", quantity: 0 }]
        : [];
    const trytonMove = moveRefs[0]?.move_id ?? null;
    const moveEntityId = moveRefs.length > 1
      ? `tryton_moves_${moveRefs.length}`
      : trytonMove
        ? `tryton_move_${trytonMove}`
        : null;
    const orderGroup = ref?.medusa_order_group_id ?? null;

    // Reflect every Tryton stock move, not just the first line. A multi-line order is committed
    // only when all of its moves are assigned; a cancelled line releases the projection.
    let reservationStatus: "not_started" | "reserved" | "committed" | "released" = "not_started";
    let movementStatus = "not_started";
    if (moveRefs.length > 0) {
      const states: string[] = [];
      for (const moveRef of moveRefs) {
        const [move] = await tryton
          .read("stock.move", [moveRef.move_id], ["state"])
          .catch(() => [] as Record<string, unknown>[]);
        states.push(String(move?.state ?? "missing"));
      }
      if (states.some((state) => state === "cancelled")) {
        reservationStatus = "released";
        movementStatus = "released";
      } else if (states.every((state) => state === "assigned")) {
        reservationStatus = "committed";
        movementStatus = "staging-posted";
      } else {
        reservationStatus = "reserved";
        movementStatus = "staging-pending";
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
      reservation: { system: "tryton", entity_type: "inventory-reservation", entity_id: moveEntityId, environment: "staging", test_data: true, status: reservationStatus, observed_at: now },
      movement: { system: "tryton", entity_type: "stock-movement", entity_id: moveEntityId, environment: "staging", test_data: true, status: movementStatus, observed_at: now },
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
        shipping_address:
          (ref.medusa_order_group as Record<string, unknown> | null)?.shipping_address ?? null,
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
      shipping_address:
        (ref.medusa_order_group as Record<string, unknown> | null)?.shipping_address ?? null,
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
    // Ops identity endpoints authenticate themselves: the gate with the Cloudflare assertion, the
  // TOTP forms with that assertion plus a CSRF token.
  const opsSelfAuthenticated =
    url.pathname === "/v1/ops/gate" ||
    url.pathname === "/v1/ops/totp/verify" ||
    url.pathname === "/v1/ops/totp/enroll" ||
    url.pathname === "/v1/ops/staff" ||
    url.pathname.startsWith("/v1/ops/staff/");
  const requiredRoles =
    config.pilotRoleAssignmentsJson && !opsSelfAuthenticated
      ? privilegedRoles(url.pathname)
      : null;
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
