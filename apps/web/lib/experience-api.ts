/**
 * Server-side client for the shared BuildKart Experience API.
 *
 * This web surface never re-implements commerce rules: it calls the same composed endpoints as the
 * Flutter app, then renders the authoritative result. It never manufactures transactional success.
 */

const baseUrl = process.env.EXPERIENCE_API_BASE_URL ?? "http://localhost:9020";

export const PILOT_SESSION_COOKIE = "buildkart_pilot_session";
export const PILOT_CHALLENGE_COOKIE = "buildkart_pilot_challenge";
export const EMAIL_CHALLENGE_COOKIE = "bazarbee_email_challenge";
export const EMAIL_HINT_COOKIE = "bazarbee_email_hint";

export class ExperienceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problemType?: string,
  ) {
    super(message);
    this.name = "ExperienceApiError";
  }
}

export interface B2bTier {
  min_quantity: number;
  max_quantity: number | null;
  amount: number;
}

export interface OfferView {
  id: string;
  seller_id: string;
  seller_name?: string;
  sku: string;
  variant_id?: string;
  currency_code: string;
  unit_amount_minor: number;
  list_amount_minor?: number;
  discount_percent?: number;
  inventory_quantity?: number;
  in_stock?: boolean;
  stock_badge?: string;
  b2b_configured?: boolean;
  b2b_moq?: number | null;
  b2b_tiers?: B2bTier[];
  b2b_starts_at?: string | null;
  b2b_ends_at?: string | null;
}

export interface BuyerContext {
  user_id: string;
  roles: string[];
  business_account_id: string | null;
  seller_id: string | null;
}

/** Server-owned role/context projection for the signed-in buyer. */
export async function getMyContexts(sessionToken: string): Promise<BuyerContext[]> {
  const result = await call<{ contexts: BuyerContext[] }>("/v1/me/contexts", {
    headers: authenticatedHeaders(sessionToken),
  });
  return result.contexts ?? [];
}

export function hasTradeRole(contexts: BuyerContext[]): boolean {
  return contexts.some((context) =>
    context.roles.some((role) => role === "b2b_buyer" || role.startsWith("b2b_")),
  );
}

export function hasAdminRole(contexts: BuyerContext[]): boolean {
  return contexts.some((context) => context.roles.includes("super_admin"));
}

export interface PilotAccessUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  business_account_id: string | null;
  seller_id: string | null;
  source: "environment" | "override";
  updated_at: string | null;
  updated_by: string | null;
}

export interface PilotAccessDirectory {
  users: PilotAccessUser[];
  roles: string[];
  total: number;
}

/** Super-admin test-user directory. The environment is the baseline; overrides win. */
export async function listPilotAccess(sessionToken: string): Promise<PilotAccessDirectory> {
  return call<PilotAccessDirectory>("/v1/admin/pilot-users", {
    headers: authenticatedHeaders(sessionToken),
    cache: "no-store",
  });
}

export async function updatePilotAccess(
  sessionToken: string,
  userId: string,
  input: { roles: string[]; businessAccountId?: string; sellerId?: string },
): Promise<{ user: PilotAccessUser }> {
  return call<{ user: PilotAccessUser }>(
    `/v1/admin/pilot-users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: authenticatedHeaders(sessionToken),
      body: JSON.stringify(input),
    },
  );
}

export async function grantAllPilotAccess(
  sessionToken: string,
): Promise<{ updated: number; users: PilotAccessUser[] }> {
  return call<{ updated: number; users: PilotAccessUser[] }>(
    "/v1/admin/pilot-users/grant-all",
    {
      method: "POST",
      headers: authenticatedHeaders(sessionToken),
    },
  );
}

export interface Serviceability {
  serviceable: boolean;
  eta_days: number;
  reason: string | null;
}

/** Staging logistics promise for a postal code (same endpoint as the Flutter fulfilment card). */
export async function checkServiceability(postcode: string): Promise<Serviceability> {
  return call<Serviceability>(
    `/v1/logistics/serviceability?postcode=${encodeURIComponent(postcode)}`,
  );
}

export interface ComposedProduct {
  id: string;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  handle?: string | null;
  metadata?: Record<string, unknown> | null;
  categories?: { id: string; name: string; parent_category_id?: string | null }[];
  badges?: string[];
  variants?: VariantView[];
  best_price?: OfferView | null;
  offer_count?: number;
}

export interface StorefrontBanner {
  content_key: string;
  placement: string;
  title: string;
  body?: string;
  image_uri?: string;
  image_mobile_uri?: string;
  image_tablet_uri?: string;
  image_desktop_uri?: string;
  image_focal_point?: string;
  image_alt?: string;
  action_label?: string;
  action_uri?: string;
  action_web_path?: string;
  action_app_route?: string;
  web_title?: string;
  web_subtitle?: string;
  web_cta_label?: string;
  priority?: number;
}

export interface StorefrontCategory {
  category_id: string;
  slug: string;
  name: string;
  label: string;
  short_text?: string;
  icon_key?: string;
  banner_image_uri?: string;
  banner_image_alt?: string;
  presentation_source?: string;
}

export interface StorefrontPresentation {
  locale: string;
  channel: "b2c" | "b2b";
  banners: StorefrontBanner[];
  categories: StorefrontCategory[];
  source?: string;
  freshness?: unknown;
}

export interface LayoutProductRef {
  id: string;
  title: string;
  handle?: string | null;
  thumbnail?: string | null;
}

export interface StorefrontLayoutSection {
  placement: string;
  label?: string;
  source?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  collection_key?: string;
  limit?: number;
  see_all_label?: string;
  see_all_uri?: string;
  visible?: boolean;
  products?: LayoutProductRef[];
  products_unavailable_reason?: string;
  children?: StorefrontLayoutSection[];
}

export interface StorefrontLayout {
  layout_key: string;
  channel: "b2c" | "b2b";
  locale: string;
  sections: StorefrontLayoutSection[];
  modules?: unknown[];
  hero_rotation_ms?: number;
  empty_collections?: string[];
  source?: string;
}

export interface StorefrontAppShell {
  locale: string;
  channel?: "b2c" | "b2b";
  layout?: StorefrontLayout;
  source?: string;
  freshness?: unknown;
}

export async function getStorefrontPresentation(
  channel: "b2c" | "b2b",
  locale = "en-IN",
): Promise<StorefrontPresentation> {
  return call<StorefrontPresentation>(
    `/v1/content/presentation?locale=${encodeURIComponent(locale)}&channel=${channel}`,
  );
}

export async function getStorefrontAppShell(
  channel: "b2c" | "b2b",
  locale = "en-IN",
): Promise<StorefrontAppShell> {
  return call<StorefrontAppShell>(
    `/v1/content/app-shell?locale=${encodeURIComponent(locale)}&channel=${channel}`,
  );
}

export interface VariantView {
  id: string;
  title?: string;
  sku?: string;
  best_price?: OfferView | null;
  in_stock?: boolean | null;
  offer_count?: number;
}

export interface ProductDetail extends ComposedProduct {
  offers?: OfferView[];
  variants?: VariantView[];
  commercial?: {
    selected_seller?: OfferView | null;
    payment_eligibility?: string[];
  };
  environment?: string;
  test_data?: boolean;
  freshness?: { source: string; observed_at: string; stale: boolean }[];
}

export interface CompletionResult {
  type: "order_group" | "cart";
  order_group?: { id: string; total?: number };
  order_number?: string | null;
  total_minor?: number | null;
  payment?: { payment_mode?: string; test_data?: boolean; provider_id?: string };
  environment?: string;
  test_data?: boolean;
  correlation_id?: string;
}

export function experienceApiBase(): string {
  return baseUrl;
}

/** Formats a minor-unit amount using the currency code (server-composed prices are authoritative). */
export { formatMoney } from "./money";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...(typeof init?.body === "string" ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Experience API request failed (${res.status}).`;
    let problemType: string | undefined;
    try {
      const problem = JSON.parse(text) as {
        detail?: unknown;
        title?: unknown;
        type?: unknown;
      };
      if (typeof problem.detail === "string" && problem.detail.trim()) {
        message = problem.detail.trim();
      } else if (typeof problem.title === "string" && problem.title.trim()) {
        message = problem.title.trim();
      }
      if (typeof problem.type === "string") problemType = problem.type;
    } catch {
      // Do not expose an upstream HTML/error body to the browser.
    }
    throw new ExperienceApiError(res.status, message, problemType);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

function authenticatedHeaders(sessionToken: string): HeadersInit {
  return { authorization: `Bearer ${sessionToken}` };
}

export interface PilotUserView {
  id: string;
  email: string;
  name: string;
}

export interface OtpChallengeResult {
  challenge_id: string;
  expires_in_seconds: number;
  test_data: true;
}

export interface OtpVerificationResult {
  session_token: string;
  expires_in_seconds: number;
  user: PilotUserView;
  test_data: true;
}

export async function requestOtpChallenge(identifier: string): Promise<OtpChallengeResult> {
  return call<OtpChallengeResult>("/v1/auth/otp/challenges", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function verifyOtpChallenge(
  challengeId: string,
  code: string,
): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
}

export interface EmailCodeChallengeResult {
  challenge_id: string;
  expires_in_seconds: number;
  test_data: true;
  /** Present only when the API has no email sender configured (staging preview). */
  preview_code?: string;
  environment?: string;
}

export interface MagicLinkResult {
  expires_in_seconds: number;
  test_data: true;
  /** Present only when the API has no email sender configured (staging preview). */
  preview_link?: string;
  environment?: string;
}

/** Requests a six-digit email sign-in code. The API decides whether the allowlisted user exists. */
export async function requestEmailCode(email: string): Promise<EmailCodeChallengeResult> {
  return call<EmailCodeChallengeResult>("/v1/auth/email/code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailCode(
  challengeId: string,
  code: string,
): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
}

/** Requests a single-use magic link delivered by email. */
export async function requestMagicLink(email: string): Promise<MagicLinkResult> {
  return call<MagicLinkResult>("/v1/auth/email/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicLink(token: string): Promise<OtpVerificationResult> {
  return call<OtpVerificationResult>("/v1/auth/email/magic/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function revokePilotSession(sessionToken: string): Promise<void> {
  await call<void>("/v1/auth/logout", {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
}

export interface CustomerOrderLine {
  line_key: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  variant_id: string | null;
  seller_id: string | null;
}

export interface CustomerOrderSummary {
  order_id: string;
  medusa_order_group_id: string | null;
  order_number: string | null;
  status: string;
  created_at: string;
  subtotal_minor: number | null;
  shipping_minor: number | null;
  discount_minor: number | null;
  total_minor: number | null;
  currency_code: string;
  payment_mode: string;
  test_data: true;
  lines: CustomerOrderLine[];
}

export interface CustomerShipment {
  id: string;
  trackingNumber: string;
  provider: string;
  status: string;
  deliveredAt: string | null;
  logisticsMode: "simulated";
  testData: true;
}

export interface CustomerReturnLine {
  id: string;
  lineKey: string;
  sku: string;
  requestedQty: number;
  approvedQty: number | null;
  receivedQty: number | null;
  condition: string | null;
  disposition: string | null;
  inspectionNote: string | null;
  inspectedAt: string | null;
}

export interface CustomerRefundSimulation {
  id: string;
  amountMinor: number;
  currencyCode: string;
  method: string;
  status: "simulated_pending" | "simulated_completed" | "simulated_failed";
  simulationReference: string;
  recordedAt: string;
  testData: true;
  simulated: true;
  moneyEffect: "none";
  stockEffect: "none";
}

export interface CustomerReturn {
  id: string;
  orderId: string;
  status: string;
  resolution: string;
  reasonCode: string;
  requestedAt: string;
  decisionComment: string | null;
  testData: true;
  lines: CustomerReturnLine[];
  evidence: CustomerReturnEvidence[];
  refundSimulation: CustomerRefundSimulation | null;
}

export interface CustomerReturnEvidence {
  id: string;
  lineKey: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  scanStatus: string;
  createdAt: string;
  url: string;
}

export interface StoredReturnEvidence {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface CustomerReturnEligibilityLine {
  line_key: string;
  sku: string;
  title: string;
  ordered_qty: number;
  delivered_qty: number;
  requested_qty: number;
  returnable_qty: number;
  deadline: string | null;
  allowed_reasons: string[];
  eligible: boolean;
  ineligible_reason: string | null;
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  reservation_status: string;
  reconciled: boolean;
  shipments: CustomerShipment[];
  returns: CustomerReturn[];
  return_eligibility: CustomerReturnEligibilityLine[];
  logistics_mode: "simulated";
}

export interface CreateReturnLineInput {
  lineKey: string;
  requestedQty: number;
  reasonCode: string;
}

export interface CreateReturnInput {
  idempotencyKey: string;
  resolution: "refund" | "replacement";
  reasonCode: string;
  comment?: string;
  lines: CreateReturnLineInput[];
  evidence?: StoredReturnEvidence[];
}

export interface NotificationView {
  id: string;
  template_key: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
  test_data: true;
}

export async function listMyNotifications(
  sessionToken: string,
  limit = 50,
): Promise<NotificationView[]> {
  const result = await call<{ notifications: NotificationView[] }>(
    `/v1/me/notifications?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.notifications ?? [];
}

export async function markNotificationRead(
  sessionToken: string,
  notificationId: string,
): Promise<void> {
  await call<void>(`/v1/me/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
}

export async function markAllNotificationsRead(sessionToken: string): Promise<number> {
  const result = await call<{ updated: number }>("/v1/me/notifications/read-all", {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
  });
  return result.updated ?? 0;
}

export async function listMyOrders(
  sessionToken: string,
  limit = 50,
): Promise<CustomerOrderSummary[]> {
  const result = await call<{ items: CustomerOrderSummary[] }>(
    `/v1/me/orders?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.items ?? [];
}

export async function getMyOrder(
  sessionToken: string,
  orderId: string,
): Promise<CustomerOrderDetail> {
  return call<CustomerOrderDetail>(`/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: authenticatedHeaders(sessionToken),
  });
}

export async function getMyReturn(
  sessionToken: string,
  returnId: string,
): Promise<CustomerReturn> {
  const result = await call<{ return: CustomerReturn }>(
    `/v1/returns/${encodeURIComponent(returnId)}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.return;
}

/** Owner-scoped list of the signed-in customer's return requests. */
export async function listMyReturns(
  sessionToken: string,
  limit = 50,
): Promise<CustomerReturn[]> {
  const result = await call<{ items: CustomerReturn[] }>(
    `/v1/me/returns?limit=${Math.max(1, Math.min(limit, 100))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.items ?? [];
}

/**
 * Owner-scoped return request. Eligibility, allowed reasons and returnable quantities are
 * server-computed; this client only forwards the customer's choice and the idempotency key.
 */
export async function createMyReturn(
  sessionToken: string,
  orderId: string,
  input: CreateReturnInput,
): Promise<CustomerReturn> {
  const result = await call<{ return: CustomerReturn }>(
    `/v1/orders/${encodeURIComponent(orderId)}/returns`,
    {
      method: "POST",
      headers: {
        ...authenticatedHeaders(sessionToken),
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        resolution: input.resolution,
        reason_code: input.reasonCode,
        customer_comment: input.comment?.trim() ? input.comment.trim() : undefined,
        lines: input.lines.map((line) => ({
          line_key: line.lineKey,
          requested_qty: line.requestedQty,
          reason_code: line.reasonCode,
        })),
        evidence: input.evidence?.length
          ? input.evidence.map((item) => ({
              object_key: item.objectKey,
              content_type: item.contentType,
              size_bytes: item.sizeBytes,
              sha256: item.sha256,
            }))
          : undefined,
      }),
    },
  );
  return result.return;
}

/** Owner-scoped evidence upload. The API validates type, size and ownership. */
export async function uploadReturnEvidence(
  sessionToken: string,
  orderId: string,
  file: Blob,
  filename: string,
): Promise<StoredReturnEvidence> {
  const form = new FormData();
  form.append("file", file, filename);
  const result = await call<{ evidence: StoredReturnEvidence }>(
    `/v1/orders/${encodeURIComponent(orderId)}/evidence`,
    {
      method: "POST",
      headers: authenticatedHeaders(sessionToken),
      body: form,
    },
  );
  return result.evidence;
}

export async function listProducts(limit = 24): Promise<ComposedProduct[]> {
  const data = await call<{ products: ComposedProduct[] }>(`/v1/products?limit=${limit}`);
  return data.products ?? [];
}

/**
 * Trade catalogue. The Experience API composes the same product/variant/offer path but reads the
 * `b2b` sales channel and only returns offers with active B2B terms (MOQ + quantity tiers).
 */
export async function listTradeProducts(
  sessionToken: string,
  limit = 100,
): Promise<ComposedProduct[]> {
  const data = await call<{ products: ComposedProduct[] }>(
    `/v1/products?channel=b2b&limit=${Math.max(1, Math.min(limit, 250))}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return data.products ?? [];
}

export async function getProduct(id: string): Promise<ProductDetail> {
  return call<ProductDetail>(`/v1/products/${encodeURIComponent(id)}`);
}

/** B2B detail projection: the same product composed against the trade channel and its offers. */
export async function getTradeProduct(
  id: string,
  sessionToken: string,
): Promise<ProductDetail> {
  return call<ProductDetail>(
    `/v1/products/${encodeURIComponent(id)}?channel=b2b`,
    { headers: authenticatedHeaders(sessionToken) },
  );
}

/** A workspace the signed-in buyer can open. Household projects and trade workspaces share this shape. */
export interface WorkspaceSummary {
  id: string;
  scope_type: "household" | "business_account";
  scope_id: string;
  name: string;
  status: string;
  created_at: string;
  role: string;
  unread_count?: number;
}

export interface WorkspaceChannel {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  status: string;
  created_at: string;
  role?: string;
  unread_count?: number;
}

export interface WorkspaceMessageReference {
  reference_type: string;
  reference_id: string;
  display_snapshot?: {
    product_id?: string | null;
    variant_id?: string | null;
    product_title?: string | null;
    sku?: string | null;
    seller_name?: string | null;
    seller_id?: string | null;
    quantity?: number | null;
    unit_price_minor?: number | null;
    currency_code?: string | null;
  } | null;
}

export interface WorkspaceMessage {
  id: string;
  workspace_id: string;
  channel_id: string;
  actor_id: string;
  actor_name: string;
  body: string;
  message_type: string;
  sequence: number;
  created_at: string;
  edited_at?: string | null;
  references?: WorkspaceMessageReference[];
}

export interface WorkspaceMessagePage {
  messages: WorkspaceMessage[];
  next_cursor: string;
}

export async function listWorkspaces(sessionToken: string): Promise<WorkspaceSummary[]> {
  const result = await call<{ workspaces: WorkspaceSummary[] }>("/v1/workspaces", {
    headers: authenticatedHeaders(sessionToken),
  });
  return result.workspaces ?? [];
}

/** A consumer project powers the household conversation and its read-only assistant channel. */
export async function createHouseholdProject(
  sessionToken: string,
  name: string,
): Promise<WorkspaceSummary | null> {
  const result = await call<{ workspace: WorkspaceSummary | null }>("/v1/household-projects", {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
    body: JSON.stringify({ name }),
  });
  return result.workspace ?? null;
}

export async function listWorkspaceChannels(
  sessionToken: string,
  workspaceId: string,
): Promise<WorkspaceChannel[]> {
  const result = await call<{ channels: WorkspaceChannel[] }>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/channels`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.channels ?? [];
}

export interface WorkspaceDraft {
  id: string;
  workspace_id: string;
  channel_id: string;
  name: string;
  lifecycle_status: string;
  validation_status: string;
  current_version: number;
  role: string;
}

export interface WorkspaceDraftLine {
  line_key: string;
  product_id: string;
  variant_id: string;
  seller_id: string;
  offer_id: string;
  quantity: number;
  commercial_snapshot?: {
    product_title?: string;
    seller_name?: string;
    sku?: string;
    unit_amount_minor?: number;
    currency_code?: string;
    thumbnail?: string;
  } | null;
  material_instruction?: string | null;
}

export interface WorkspaceDraftProposal {
  id: string;
  kind: string;
  status: string;
  proposed_by: string;
  expected_version: number;
  payload: Record<string, unknown>;
  created_at?: string | null;
}

export interface WorkspaceDraftRevision {
  id: string;
  version: number;
  commercial_hash: string;
  lines: WorkspaceDraftLine[];
}

export interface WorkspaceDraftView {
  draft: WorkspaceDraft;
  revision?: WorkspaceDraftRevision | null;
  approval?: Record<string, unknown> | null;
  proposals: WorkspaceDraftProposal[];
}

export interface WorkspaceInvitation {
  id: string;
  invitee_email: string;
  status: string;
  expires_at?: string | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
}

export interface WorkspaceInvitationPage {
  invitations: WorkspaceInvitation[];
  participants: number;
  capacity: number;
}

export interface WorkspaceInvitationCreated {
  invitation: WorkspaceInvitation;
  invite_token: string;
}

export async function listWorkspaceDrafts(
  sessionToken: string,
  workspaceId: string,
): Promise<WorkspaceDraft[]> {
  const result = await call<{ drafts?: WorkspaceDraft[] }>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/purchase-drafts`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return result.drafts ?? [];
}

export async function getWorkspaceDraft(
  sessionToken: string,
  draftId: string,
): Promise<WorkspaceDraftView> {
  return call<WorkspaceDraftView>(
    `/v1/purchase-drafts/${encodeURIComponent(draftId)}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
}

export async function markWorkspaceRead(
  sessionToken: string,
  channelId: string,
  sequence: number,
): Promise<void> {
  await call<void>(`/v1/channels/${encodeURIComponent(channelId)}/read-cursor`, {
    method: "POST",
    headers: authenticatedHeaders(sessionToken),
    body: JSON.stringify({ last_event_sequence: sequence }),
  });
}

export async function getWorkspaceInvitations(
  sessionToken: string,
  workspaceId: string,
): Promise<WorkspaceInvitationPage> {
  return call<WorkspaceInvitationPage>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
    { headers: authenticatedHeaders(sessionToken) },
  );
}

export async function inviteWorkspaceParticipant(
  sessionToken: string,
  workspaceId: string,
  email: string,
): Promise<WorkspaceInvitationCreated> {
  return call<WorkspaceInvitationCreated>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
    {
      method: "POST",
      headers: authenticatedHeaders(sessionToken),
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  );
}

export async function revokeWorkspaceInvitation(
  sessionToken: string,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await call<void>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
    {
      method: "POST",
      headers: authenticatedHeaders(sessionToken),
    },
  );
}

export async function listWorkspaceMessages(
  sessionToken: string,
  channelId: string,
  cursor?: string,
): Promise<WorkspaceMessagePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const result = await call<{ messages?: WorkspaceMessage[]; next_cursor?: string }>(
    `/v1/channels/${encodeURIComponent(channelId)}/messages${query}`,
    { headers: authenticatedHeaders(sessionToken) },
  );
  return {
    messages: result.messages ?? [],
    next_cursor: result.next_cursor ?? cursor ?? "0",
  };
}

export async function sendWorkspaceMessage(
  sessionToken: string,
  channelId: string,
  body: string,
): Promise<WorkspaceMessage> {
  const result = await call<{ message: WorkspaceMessage }>(
    `/v1/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: {
        ...authenticatedHeaders(sessionToken),
        "idempotency-key": `web_msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      },
      body: JSON.stringify({ body, message_type: "text" }),
    },
  );
  return result.message;
}

export interface WorkspaceProductShare {
  productId: string;
  variantId: string;
  offerId: string;
  sellerId?: string | null;
  quantity: number;
  productTitle: string;
  sku?: string | null;
  unitPriceMinor?: number | null;
  currency?: string | null;
  sellerName?: string | null;
}

/**
 * Product "Discuss" capture: writes the product into the shared conversation as a product
 * reference. The workspace service de-duplicates a repeat share of the same variant.
 */
export async function shareWorkspaceProduct(
  sessionToken: string,
  channelId: string,
  input: WorkspaceProductShare,
): Promise<WorkspaceMessage> {
  return call<WorkspaceMessage>(`/v1/channels/${encodeURIComponent(channelId)}/shares`, {
    method: "POST",
    headers: {
      ...authenticatedHeaders(sessionToken),
      "idempotency-key": `web_share_${input.variantId}`,
    },
    body: JSON.stringify({
      product_id: input.productId,
      variant_id: input.variantId,
      offer_id: input.offerId,
      seller_id: input.sellerId ?? null,
      quantity: input.quantity,
      product_title: input.productTitle,
      body: `Shared ${input.productTitle} for discussion.`,
      commercial_snapshot: {
        product_id: input.productId,
        variant_id: input.variantId,
        sku: input.sku ?? null,
        unit_price_minor: input.unitPriceMinor ?? null,
        currency_code: input.currency ?? null,
        seller_name: input.sellerName ?? null,
      },
    }),
  });
}

export interface PairedProduct extends ComposedProduct {
  best_price?: OfferView | null;
  offer_count?: number;
}

/**
 * Resolves the variant the page is showing and the offer for it.
 *
 * The detail endpoint leaves the top-level `best_price` empty and puts the priced offer on
 * `commercial.selected_seller`, while each `variants[].best_price` carries its own offer id and
 * variant id. An explicit `?sku=` always wins, so a price shown is always the price of the variant
 * being quoted - no silent "first variant" choice when one was requested.
 */
export function resolveVariant(
  product: ProductDetail,
  requestedSku?: string | null,
): { variant: VariantView | null; offer: OfferView | null } {
  const variants = product.variants ?? [];
  const fallbackOffer = product.best_price ?? product.commercial?.selected_seller ?? null;
  const requested = requestedSku ? variants.find((variant) => variant.sku === requestedSku) : undefined;
  const variant =
    requested ??
    variants.find((candidate) => candidate.id === fallbackOffer?.variant_id) ??
    variants.find((candidate) => Boolean(candidate.best_price?.id)) ??
    variants[0] ??
    null;
  const offer =
    variant?.best_price ??
    (fallbackOffer && (!variant || variant.id === fallbackOffer.variant_id) ? fallbackOffer : null);
  return { variant, offer };
}

export interface BoughtTogetherResult {
  pair_id: string | null;
  channel?: string;
  paired_availability?: "in_stock" | "out_of_stock";
  paired?: PairedProduct | null;
}

/**
 * Bought together is SKU-scoped: the Experience API only returns a pair when the selected SKU is
 * the one that was paired. Progressive enhancement - any failure returns null and the page renders
 * without the section, exactly as it does when no pair exists.
 */
export async function getBoughtTogether(
  productId: string,
  sku: string | null | undefined,
  channel: "b2c" | "b2b" = "b2c",
  sessionToken?: string,
): Promise<BoughtTogetherResult | null> {
  const query = new URLSearchParams({ channel });
  if (sku) query.set("sku", sku);
  try {
    const data = await call<BoughtTogetherResult>(
      `/v1/products/${encodeURIComponent(productId)}/bought-together?${query.toString()}`,
      sessionToken ? { headers: authenticatedHeaders(sessionToken) } : undefined,
    );
    return data?.pair_id ? data : null;
  } catch {
    return null;
  }
}

export interface CheckoutLineInput {
  offerId: string;
  quantity: number;
  channel: "b2c" | "b2b";
}

export interface CheckoutInput {
  lines: CheckoutLineInput[];
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  promoCode?: string;
  channel?: "b2c" | "b2b";
}

/**
 * Performs the canonical checkout server-side against the shared Experience API. Success is the
 * server's canonical order group; the client cannot fabricate it.
 */
export interface CartQuote {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  itemCount: number;
  promotions?: { code: string; label: string; isAutomatic: boolean }[];
  autoOffer?: { code: string; label: string } | null;
}

interface CartView {
  items?: unknown[];
  subtotal?: number;
  item_subtotal?: number;
  shipping_total?: number;
  discount_total?: number;
  total?: number;
  currency_code?: string;
  promotions?: { code?: unknown; label?: unknown; is_automatic?: unknown }[];
  auto_offer?: { code?: unknown; label?: unknown } | null;
}

/**
 * Quotes a basket without completing it. The cart API is owner-scoped, so this requires the
 * signed-in session. Delivery is resolved for the entered postal code so the customer sees the
 * same subtotal, shipping, automatic discount and total that completion will produce.
 *
 * Staging note: this creates a short-lived Medusa cart per quote. A production build should reuse
 * the checkout cart instead of creating a quote cart.
 */
export async function quoteCart(
  input: {
    lines: CheckoutLineInput[];
    postalCode: string;
    email: string;
    promoCode?: string;
    channel?: "b2c" | "b2b";
  },
  sessionToken: string,
): Promise<CartQuote> {
  if (input.lines.length === 0) throw new Error("The cart is empty.");
  const lineChannels = new Set(
    input.lines.map((line) => line.channel ?? input.channel ?? "b2c"),
  );
  if (lineChannels.size > 1) throw new Error("The cart mixes Shop and Trade items.");
  if (input.channel && !lineChannels.has(input.channel)) {
    throw new Error("The cart channel does not match its lines.");
  }
  const channel =
    input.channel ??
    (Array.from(lineChannels)[0] as "b2c" | "b2b" | undefined) ??
    "b2c";
  const auth = authenticatedHeaders(sessionToken);
  const cart = await call<{ id: string }>("/v1/carts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      channel: channel === "b2b" ? "b2b_web" : "b2c_web",
    }),
  });
  for (const line of input.lines) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ offer_id: line.offerId, quantity: line.quantity }),
    });
  }
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email: input.email,
      shipping_address: {
        first_name: "Quote",
        last_name: "Buyer",
        address_1: "Quote address",
        city: "Jaipur",
        postal_code: /^\d{6}$/.test(input.postalCode) ? input.postalCode : "302001",
        country_code: "IN",
      },
    }),
  });
  const promoCode = input.promoCode?.trim();
  if (promoCode) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/promotions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ code: promoCode }),
    });
  }
  const delivery = await call<{ unavailable?: unknown[] }>(
    `/v1/carts/${encodeURIComponent(cart.id)}/delivery-tier`,
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tier: "standard" }),
    },
  );
  if (delivery.unavailable?.length) {
    throw new Error("Standard delivery is not available for this postal code.");
  }
  const view = await call<CartView>(`/v1/carts/${encodeURIComponent(cart.id)}`, {
    headers: auth,
  });
  const subtotal = view.item_subtotal ?? view.subtotal ?? 0;
  const promotions = Array.isArray(view.promotions)
    ? view.promotions
        .map((promotion) => ({
          code: typeof promotion.code === "string" ? promotion.code : "",
          label:
            typeof promotion.label === "string" && promotion.label.trim()
              ? promotion.label
              : typeof promotion.code === "string"
                ? promotion.code
                : "",
          isAutomatic: Boolean(promotion.is_automatic),
        }))
        .filter((promotion) => promotion.code)
    : [];
  const autoOffer =
    view.auto_offer &&
    typeof view.auto_offer.code === "string" &&
    view.auto_offer.code.trim()
      ? {
          code: view.auto_offer.code,
          label:
            typeof view.auto_offer.label === "string" && view.auto_offer.label.trim()
              ? view.auto_offer.label
              : view.auto_offer.code,
        }
      : null;
  return {
    subtotal,
    shipping: view.shipping_total ?? 0,
    discount: view.discount_total ?? 0,
    total: view.total ?? subtotal,
    currency: (view.currency_code ?? "inr").toUpperCase(),
    itemCount: Array.isArray(view.items) ? view.items.length : input.lines.length,
    promotions,
    autoOffer,
  };
}

export async function completeCheckout(
  input: CheckoutInput,
  sessionToken: string,
): Promise<CompletionResult> {
  const auth = authenticatedHeaders(sessionToken);
  if (input.lines.length === 0) throw new Error("The cart is empty.");
  const lineChannels = new Set(
    input.lines.map((line) => line.channel ?? input.channel ?? "b2c"),
  );
  if (lineChannels.size > 1) throw new Error("The cart mixes Shop and Trade items.");
  if (input.channel && !lineChannels.has(input.channel)) {
    throw new Error("The cart channel does not match its lines.");
  }
  const channel =
    input.channel ??
    (Array.from(lineChannels)[0] as "b2c" | "b2b" | undefined) ??
    "b2c";
  const cart = await call<{ id: string }>("/v1/carts", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      channel: channel === "b2b" ? "b2b_web" : "b2c_web",
    }),
  });
  for (const line of input.lines) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/lines`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ offer_id: line.offerId, quantity: line.quantity }),
    });
  }
  await call(`/v1/carts/${encodeURIComponent(cart.id)}/customer-details`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email: input.email,
      shipping_address: {
        first_name: input.firstName,
        last_name: input.lastName,
        address_1: input.address1,
        city: input.city,
        postal_code: input.postalCode,
        country_code: "IN",
      },
    }),
  });
  const promoCode = input.promoCode?.trim();
  if (promoCode) {
    await call(`/v1/carts/${encodeURIComponent(cart.id)}/promotions`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ code: promoCode }),
    });
  }
  // One cart-level delivery choice resolves a shipping method for every seller group, so a
  // multi-seller basket cannot be left with a partial selection.
  const delivery = await call<{
    unavailable?: { seller_id: string | null; reason: string }[];
  }>(`/v1/carts/${encodeURIComponent(cart.id)}/delivery-tier`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ tier: "standard" }),
  });
  if (delivery.unavailable?.length) {
    throw new Error("Standard delivery is not available for every seller in this cart.");
  }
  return call<CompletionResult>(`/v1/checkouts/${encodeURIComponent(cart.id)}/complete`, {
    method: "POST",
    headers: auth,
  });
}
