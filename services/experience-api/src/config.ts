/**
 * Environment and adapter-mode configuration with the production fail-closed guard.
 *
 * Simulated payment is permitted only in development/staging. Production must refuse to
 * start when a simulated adapter is configured, so a misconfiguration cannot silently
 * manufacture payment acceptance.
 */

import { MAX_PILOT_USERS } from "./auth/pilot-users.js";

export type Environment = "development" | "integration" | "staging" | "production";
export type PaymentAdapterMode = "simulated" | "provider";

const ALLOWED_ENVIRONMENTS: Environment[] = [
  "development",
  "integration",
  "staging",
  "production",
];

function readEnvironment(raw: string | undefined): Environment {
  const value = (raw ?? "development").trim() as Environment;
  if (!ALLOWED_ENVIRONMENTS.includes(value)) {
    throw new Error(`Unknown BUILDKART_ENVIRONMENT: ${value}`);
  }
  return value;
}

function readAdapterMode(raw: string | undefined): PaymentAdapterMode {
  const value = (raw ?? "simulated").trim() as PaymentAdapterMode;
  if (value !== "simulated" && value !== "provider") {
    throw new Error(`Unknown PAYMENT_ADAPTER_MODE: ${value}`);
  }
  return value;
}

export interface Config {
  port: number;
  environment: Environment;
  paymentAdapterMode: PaymentAdapterMode;
  medusaBaseUrl: string;
  medusaPublishableKey: string;
  medusaRegionId: string;
  medusaCountryCode: string;
  medusaB2cSalesChannelId?: string;
  medusaB2bSalesChannelId?: string;
  medusaB2bRegionId?: string;
  trytonBaseUrl: string;
  trytonDatabase: string;
  trytonUsername: string;
  trytonPassword: string;
  experienceDatabaseUrl: string;
  redisUrl: string;
  natsUrl: string;
  natsUser?: string;
  natsPassword?: string;
  pilotUsersJson?: string;
  pilotRoleAssignmentsJson?: string;
  pilotExpectedUserCount?: number;
  pilotOtpCode: string;
  pilotChallengeTtlSeconds: number;
  pilotSessionTtlSeconds: number;
  firebaseProjectId: string;
  fcmDeliveryEnabled: boolean;
  notificationTemplatesApproved: boolean;
  cmsBaseUrl?: string;
  cmsApiToken?: string;
  cmsWebhookSecret?: string;
  /**
   * Optional private-network secret for the authenticated draft preview projection. Distinct from
   * the CMS webhook secret and the Medusa-to-CMS operator secret so no secret is reused across
   * purposes.
   */
  experienceOperatorSecret?: string;
  cmsCacheTtlSeconds: number;
  cmsWebhookToleranceSeconds: number;
  /** Internal Workspace Service origin. Clients never call it directly. */
  workspaceServiceUrl?: string;
  /** HMAC secret used only for the Experience API → Workspace actor context. */
  workspaceServiceSecret?: string;
  /** Staging-only shared secret for the simulated logistics webhook. */
  logisticsWebhookSecret?: string;
  /** Staging-only service secret used by the Mercur admin console proxy. */
  adminServiceSecret?: string;
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function booleanFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/**
 * NATS credentials must not be embedded in the server URL: nats.js rejects a URL with userinfo.
 * Split them out so the connection can be built from `servers` + `user` + `pass`.
 */
function parseNats(raw: string | undefined): { url: string; user?: string; password?: string } {
  const value = raw ?? "nats://localhost:4222";
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      const user = decodeURIComponent(parsed.username);
      const password = decodeURIComponent(parsed.password);
      parsed.username = "";
      parsed.password = "";
      return { url: parsed.toString(), user, password };
    }
    return { url: value };
  } catch {
    return { url: value };
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const environment = readEnvironment(env.BUILDKART_ENVIRONMENT);
  const paymentAdapterMode = readAdapterMode(env.PAYMENT_ADAPTER_MODE);

  // Fail closed: simulated payment must never run in production.
  if (environment === "production" && paymentAdapterMode === "simulated") {
    throw new Error(
      "Refusing to start: simulated payment adapter is configured for production. " +
        "Simulated payment is development/staging only.",
    );
  }

  // Provider mode requires an approved provider adapter that does not exist in this increment.
  if (paymentAdapterMode === "provider") {
    throw new Error(
      "Provider payment mode is not implemented in this increment (Razorpay is deferred). " +
        "Set PAYMENT_ADAPTER_MODE=simulated for staging.",
    );
  }

  const pilotOtpCode = env.PILOT_OTP_CODE ?? "123456";
  if (!/^\d{6}$/.test(pilotOtpCode)) {
    throw new Error("PILOT_OTP_CODE must be exactly six digits.");
  }
  if (environment === "production") {
    throw new Error("Pilot simulated identity is prohibited in production.");
  }

  const expectedPilotUsers = env.PILOT_EXPECTED_USER_COUNT
    ? positiveInteger(env.PILOT_EXPECTED_USER_COUNT, 20, "PILOT_EXPECTED_USER_COUNT")
    : undefined;
  if (expectedPilotUsers !== undefined && expectedPilotUsers > MAX_PILOT_USERS) {
    throw new Error(`PILOT_EXPECTED_USER_COUNT cannot exceed the approved maximum of ${MAX_PILOT_USERS}.`);
  }
  if (expectedPilotUsers !== undefined && !env.PILOT_ROLE_ASSIGNMENTS_JSON?.trim()) {
    throw new Error("PILOT_ROLE_ASSIGNMENTS_JSON is required when PILOT_EXPECTED_USER_COUNT is set.");
  }

  const firebaseProjectId = env.FIREBASE_PROJECT_ID ?? "buildkart-staging";
  const fcmDeliveryEnabled = booleanFlag(env.FCM_DELIVERY_ENABLED);
  const notificationTemplatesApproved = booleanFlag(env.PILOT_NOTIFICATION_TEMPLATES_APPROVED);
  if (fcmDeliveryEnabled) {
    if (environment !== "staging") {
      throw new Error("FCM delivery is permitted only in the staging environment.");
    }
    if (firebaseProjectId !== "buildkart-staging") {
      throw new Error("FCM delivery is restricted to the buildkart-staging Firebase project.");
    }
    if (!notificationTemplatesApproved) {
      throw new Error("FCM delivery requires approved notification template wording.");
    }
    if (!env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new Error("FCM delivery requires GOOGLE_APPLICATION_CREDENTIALS to reference a server-side credential file.");
    }
  }

  const nats = parseNats(env.NATS_URL);
  const cmsBaseUrl = env.CMS_BASE_URL?.trim().replace(/\/$/, "") || undefined;
  const cmsApiToken = env.CMS_API_TOKEN?.trim() || undefined;
  const cmsWebhookSecret = env.CMS_WEBHOOK_SECRET?.trim() || undefined;
  if (cmsBaseUrl && (!cmsApiToken || !cmsWebhookSecret)) {
    throw new Error(
      "CMS_API_TOKEN and CMS_WEBHOOK_SECRET are required when CMS_BASE_URL is configured.",
    );
  }

  const workspaceServiceUrl =
    env.WORKSPACE_SERVICE_URL?.trim().replace(/\/$/, "") || undefined;
  const workspaceServiceSecret = env.WORKSPACE_SERVICE_SECRET?.trim() || undefined;
  if (workspaceServiceUrl && (!workspaceServiceSecret || workspaceServiceSecret.length < 24)) {
    throw new Error(
      "WORKSPACE_SERVICE_SECRET (at least 24 characters) is required when WORKSPACE_SERVICE_URL is configured.",
    );
  }

  // Staging/dummy service credentials. Production must supply real secrets from the secret manager;
  // the dummy values are deliberately not applied when BUILDKART_ENVIRONMENT=production.
  // Production is rejected earlier by the pilot-identity guard, so this staging fallback cannot
  // become a production credential.
  const logisticsWebhookSecret =
    env.LOGISTICS_WEBHOOK_SECRET?.trim() ||
    "buildkart-staging-dummy-logistics-webhook-secret";
  if (logisticsWebhookSecret.length < 24) {
    throw new Error("LOGISTICS_WEBHOOK_SECRET must be at least 24 characters when configured.");
  }
  const adminServiceSecret =
    env.BUILDKART_ADMIN_SERVICE_SECRET?.trim() ||
    "buildkart-staging-dummy-admin-service-secret";
  if (adminServiceSecret.length < 24) {
    throw new Error("BUILDKART_ADMIN_SERVICE_SECRET must be at least 24 characters when configured.");
  }

  return {
    port: Number.parseInt(env.PORT ?? "9020", 10),
    environment,
    paymentAdapterMode,
    medusaBaseUrl: env.MEDUSA_BASE_URL ?? "http://localhost:9010",
    medusaPublishableKey: env.MEDUSA_PUBLISHABLE_KEY ?? "",
    medusaRegionId: env.MEDUSA_REGION_ID ?? "",
    medusaCountryCode: env.MEDUSA_COUNTRY_CODE ?? "IN",
    medusaB2cSalesChannelId: env.MEDUSA_B2C_SALES_CHANNEL_ID?.trim() || undefined,
    medusaB2bSalesChannelId: env.MEDUSA_B2B_SALES_CHANNEL_ID?.trim() || undefined,
    medusaB2bRegionId: env.MEDUSA_B2B_REGION_ID?.trim() || undefined,
    trytonBaseUrl: env.TRYTON_BASE_URL ?? "http://localhost:8010",
    trytonDatabase: env.TRYTON_DATABASE ?? "buildkart_tryton",
    trytonUsername: env.TRYTON_USERNAME ?? "admin",
    trytonPassword: env.TRYTON_PASSWORD ?? "buildkart-staging-admin",
    experienceDatabaseUrl:
      env.EXPERIENCE_DATABASE_URL ??
      "postgres://buildkart:buildkart@localhost:5433/buildkart_experience",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    natsUrl: nats.url,
    natsUser: nats.user,
    natsPassword: nats.password,
    pilotUsersJson: env.PILOT_USERS_JSON,
    pilotRoleAssignmentsJson: env.PILOT_ROLE_ASSIGNMENTS_JSON,
    pilotExpectedUserCount: expectedPilotUsers,
    pilotOtpCode,
    pilotChallengeTtlSeconds: positiveInteger(
      env.PILOT_CHALLENGE_TTL_SECONDS,
      5 * 60,
      "PILOT_CHALLENGE_TTL_SECONDS",
    ),
    pilotSessionTtlSeconds: positiveInteger(
      env.PILOT_SESSION_TTL_SECONDS,
      60 * 60,
      "PILOT_SESSION_TTL_SECONDS",
    ),
    firebaseProjectId,
    fcmDeliveryEnabled,
    notificationTemplatesApproved,
    cmsBaseUrl,
    cmsApiToken,
    cmsWebhookSecret,
    experienceOperatorSecret: env.EXPERIENCE_OPERATOR_SECRET?.trim() || undefined,
    cmsCacheTtlSeconds: positiveInteger(
      env.CMS_CACHE_TTL_SECONDS,
      60,
      "CMS_CACHE_TTL_SECONDS",
    ),
    cmsWebhookToleranceSeconds: positiveInteger(
      env.CMS_WEBHOOK_TOLERANCE_SECONDS,
      300,
      "CMS_WEBHOOK_TOLERANCE_SECONDS",
    ),
    workspaceServiceUrl,
    workspaceServiceSecret,
    logisticsWebhookSecret,
    adminServiceSecret,
  };
}
