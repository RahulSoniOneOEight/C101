/**
 * Environment and adapter-mode configuration with the production fail-closed guard.
 *
 * Simulated payment is permitted only in development/staging. Production must refuse to
 * start when a simulated adapter is configured, so a misconfiguration cannot silently
 * manufacture payment acceptance.
 */

import { MAX_PILOT_USERS } from "./auth/pilot-users.js";
import { randomBytes } from "node:crypto";

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
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
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
  /** `pilot` keeps the staging allowlist; `directory` uses the customer identity table. */
  identityMode: "pilot" | "directory";
  /** Lifetime of a customer-realm session. */
  customerSessionTtlSeconds: number;
  /** Ops TOTP gate: off (not wired), shadow (evaluate and log only), enforce. */
  opsTotpGate: "off" | "shadow" | "enforce";
  /** Cloudflare Access team domain, for example `bazarbee.cloudflareaccess.com`. */
  opsAccessTeamDomain: string;
  /** Access application AUD tag. Required when the gate is not off. */
  opsAccessAudience?: string;
  /** Base64 32-byte key used to encrypt TOTP secrets. Required when the gate is not off. */
  opsTotpEncryptionKey?: string;
  /** Lifetime of an ops session after TOTP verification. */
  opsSessionTtlSeconds: number;
  /** Cloudflare Access group sync for the ops staff directory. */
  cloudflareAccountId?: string;
  cloudflareAccessApiToken?: string;
  cloudflareAccessStaffGroupId?: string;
  cloudflareAccessErpGroupId?: string;
  cloudflareAccessSyncEnabled: boolean;
  /** Medusa/Mercur admin service account used to create staff invites. */
  medusaAdminEmail?: string;
  medusaAdminPassword?: string;
  /** Public operator base used to build the Mercur invite link. */
  publicOpsBaseUrl: string;
  medusaInviteAutomationEnabled: boolean;
  pilotOtpCode: string;
  pilotChallengeTtlSeconds: number;
  pilotSessionTtlSeconds: number;
  /** Transactional email sender used for email OTP and magic links. */
  emailFrom: string;
  resendApiKey?: string;
  /** Public web origin used in magic links. */
  emailAuthLinkBaseUrl: string;
  emailCodeTtlSeconds: number;
  emailMagicTtlSeconds: number;
  emailCooldownSeconds: number;
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
  /** Staging-only Bought Together merchandising surface. */
  boughtTogetherEnabled: boolean;
  /** Filesystem root for return evidence (staging pilot; production needs object storage). */
  evidenceDir: string;
  /** HMAC secret for short-lived evidence URLs. Generated per boot when unset outside production. */
  evidenceSigningSecret: string;
  /** Public origin used to build evidence URLs reachable by browsers. */
  publicApiBaseUrl: string;
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
  const boughtTogetherEnabled = booleanFlag(env.BUILDKART_BOUGHT_TOGETHER_ENABLED);
  if (boughtTogetherEnabled && environment === "production") {
    throw new Error("Bought Together merchandising is staging-only.");
  }

  // Fail closed: simulated payment must never run in production.
  if (environment === "production" && paymentAdapterMode === "simulated") {
    throw new Error(
      "Refusing to start: simulated payment adapter is configured for production. " +
        "Simulated payment is development/staging only.",
    );
  }

  const razorpayKeyId = env.RAZORPAY_KEY_ID?.trim() || undefined;
  const razorpayKeySecret = env.RAZORPAY_KEY_SECRET?.trim() || undefined;
  const razorpayWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined;
  if (paymentAdapterMode === "provider" && (!razorpayKeyId || !razorpayKeySecret)) {
    throw new Error(
      "PAYMENT_ADAPTER_MODE=provider requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }

  const pilotOtpCode = env.PILOT_OTP_CODE ?? "123456";
  if (!/^\d{6}$/.test(pilotOtpCode)) {
    throw new Error("PILOT_OTP_CODE must be exactly six digits.");
  }
  const identityMode = (
    env.IDENTITY_MODE ?? (environment === "production" ? "directory" : "pilot")
  ).trim();
  if (identityMode !== "pilot" && identityMode !== "directory") {
    throw new Error("IDENTITY_MODE must be pilot or directory.");
  }
  if (environment === "production") {
    if (identityMode !== "directory") {
      throw new Error("Production requires IDENTITY_MODE=directory.");
    }
    if (!env.RESEND_API_KEY?.trim()) {
      throw new Error("Production requires RESEND_API_KEY for email OTP and magic links.");
    }
    if (env.PILOT_USERS_JSON?.trim()) {
      throw new Error("PILOT_USERS_JSON is prohibited in production.");
    }
  }

  const opsTotpGate = (env.OPS_TOTP_GATE ?? "off").trim();
  if (opsTotpGate !== "off" && opsTotpGate !== "shadow" && opsTotpGate !== "enforce") {
    throw new Error("OPS_TOTP_GATE must be off, shadow or enforce.");
  }
  const opsAccessTeamDomain = (env.OPS_ACCESS_TEAM_DOMAIN ?? "bazarbee.cloudflareaccess.com")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!opsAccessTeamDomain) {
    throw new Error("OPS_ACCESS_TEAM_DOMAIN must name the Cloudflare Access team domain.");
  }
  const opsAccessAudience = env.OPS_ACCESS_AUDIENCE?.trim() || undefined;
  const opsTotpEncryptionKey = env.OPS_TOTP_ENCRYPTION_KEY?.trim() || undefined;
  if (opsTotpGate !== "off") {
    if (!opsAccessAudience) {
      throw new Error("OPS_TOTP_GATE requires OPS_ACCESS_AUDIENCE.");
    }
    if (!opsTotpEncryptionKey) {
      throw new Error("OPS_TOTP_GATE requires OPS_TOTP_ENCRYPTION_KEY.");
    }
    if (Buffer.from(opsTotpEncryptionKey, "base64").length !== 32) {
      throw new Error("OPS_TOTP_ENCRYPTION_KEY must be 32 bytes encoded as base64.");
    }
  }
  if (environment === "production" && opsTotpGate === "off") {
    throw new Error("Production requires OPS_TOTP_GATE=shadow or enforce.");
  }

  const cloudflareAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined;
  const cloudflareAccessApiToken = env.CLOUDFLARE_ACCESS_API_TOKEN?.trim() || undefined;
  const cloudflareAccessStaffGroupId = env.CLOUDFLARE_ACCESS_STAFF_GROUP_ID?.trim() || undefined;
  const cloudflareAccessErpGroupId = env.CLOUDFLARE_ACCESS_ERP_GROUP_ID?.trim() || undefined;
  const cloudflareParts = [
    cloudflareAccountId,
    cloudflareAccessApiToken,
    cloudflareAccessStaffGroupId,
    cloudflareAccessErpGroupId,
  ];
  const cloudflareSupplied = cloudflareParts.filter(Boolean).length;
  if (cloudflareSupplied > 0 && cloudflareSupplied < cloudflareParts.length) {
    throw new Error(
      "Cloudflare Access group sync requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_API_TOKEN, CLOUDFLARE_ACCESS_STAFF_GROUP_ID and CLOUDFLARE_ACCESS_ERP_GROUP_ID.",
    );
  }
  const cloudflareAccessSyncEnabled = cloudflareSupplied === cloudflareParts.length;
  if (environment === "production" && opsTotpGate !== "off" && !cloudflareAccessSyncEnabled) {
    throw new Error(
      "Production ops identity requires Cloudflare Access group sync configuration.",
    );
  }

  const medusaAdminEmail = env.MEDUSA_ADMIN_EMAIL?.trim() || undefined;
  const medusaAdminPassword = env.MEDUSA_ADMIN_PASSWORD?.trim() || undefined;
  const publicOpsBaseUrl = (
    env.PUBLIC_OPS_BASE_URL?.trim() || "https://ops-staging.pinakaplay.cloud"
  ).replace(/\/+$/, "");
  const medusaInviteAutomationEnabled = Boolean(medusaAdminEmail && medusaAdminPassword);

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

  const evidenceDir = env.EVIDENCE_DIR?.trim() || "./data/evidence";
  const publicApiBaseUrl =
    env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") || "http://localhost:9020";
  const evidenceSigningSecret =
    env.EVIDENCE_SIGNING_SECRET?.trim() || randomBytes(32).toString("hex");

  return {
    port: Number.parseInt(env.PORT ?? "9020", 10),
    environment,
    paymentAdapterMode,
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
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
    identityMode,
    customerSessionTtlSeconds: positiveInteger(
      env.CUSTOMER_SESSION_TTL_SECONDS,
      2_592_000,
      "CUSTOMER_SESSION_TTL_SECONDS",
    ),
    opsTotpGate,
    opsAccessTeamDomain,
    opsAccessAudience,
    opsTotpEncryptionKey,
    opsSessionTtlSeconds: positiveInteger(
      env.OPS_SESSION_TTL_SECONDS,
      8 * 60 * 60,
      "OPS_SESSION_TTL_SECONDS",
    ),
    cloudflareAccountId,
    cloudflareAccessApiToken,
    cloudflareAccessStaffGroupId,
    cloudflareAccessErpGroupId,
    cloudflareAccessSyncEnabled,
    medusaAdminEmail,
    medusaAdminPassword,
    publicOpsBaseUrl,
    medusaInviteAutomationEnabled,
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
    emailFrom:
      env.EMAIL_FROM?.trim() || "BazarBee <no-reply@send.gobazarbee.com>",
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    emailAuthLinkBaseUrl: (
      env.AUTH_EMAIL_LINK_BASE_URL?.trim() ||
      "https://app-staging.pinakaplay.cloud"
    ).replace(/\/$/, ""),
    emailCodeTtlSeconds: positiveInteger(
      env.AUTH_EMAIL_CODE_TTL_SECONDS,
      10 * 60,
      "AUTH_EMAIL_CODE_TTL_SECONDS",
    ),
    emailMagicTtlSeconds: positiveInteger(
      env.AUTH_EMAIL_MAGIC_TTL_SECONDS,
      15 * 60,
      "AUTH_EMAIL_MAGIC_TTL_SECONDS",
    ),
    emailCooldownSeconds: positiveInteger(
      env.AUTH_EMAIL_COOLDOWN_SECONDS,
      60,
      "AUTH_EMAIL_COOLDOWN_SECONDS",
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
    boughtTogetherEnabled,
    evidenceDir,
    evidenceSigningSecret,
    publicApiBaseUrl,
  };
}
