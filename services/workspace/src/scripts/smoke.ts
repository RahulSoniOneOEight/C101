/**
 * Workspace Phase 2 smoke test. Run inside the private network:
 *   docker exec buildkart-hosted-pilot-workspace-1 bun run src/scripts/smoke.ts
 *
 * It signs the same actor context the Experience API would send and verifies:
 * tenant isolation, product shares, immutable revisions, proposal acceptance,
 * revision-bound approval and approver separation of duties.
 */
import { createHmac } from "node:crypto";

const BASE = process.env.WORKSPACE_SERVICE_URL ?? "http://localhost:9040";
const SECRET = process.env.WORKSPACE_SERVICE_SECRET;
if (!SECRET) throw new Error("WORKSPACE_SERVICE_SECRET is required.");

type Actor = {
  userId: string;
  name: string;
  roles: string[];
  businessAccountId: string;
  iat: number;
  correlationId: string;
};

function headers(actor: Actor, extra?: Record<string, string>): Record<string, string> {
  const encoded = Buffer.from(JSON.stringify(actor)).toString("base64url");
  return {
    "x-workspace-actor": encoded,
    "x-workspace-signature": createHmac("sha256", SECRET as string)
      .update(encoded)
      .digest("hex"),
    "content-type": "application/json",
    ...(extra ?? {}),
  };
}

async function call(
  actor: Actor,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(actor, extraHeaders),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

const arjun: Actor = {
  userId: "pilot_buyer_b2b01",
  name: "Arjun Traders Buyer",
  roles: ["b2b_buyer"],
  businessAccountId: "business_arjun_traders",
  iat: Math.floor(Date.now() / 1000),
  correlationId: "workspace-smoke-arjun",
};
const approver: Actor = {
  userId: "pilot_approver_b2b01",
  name: "Arjun Traders Approver",
  roles: ["b2b_approver"],
  businessAccountId: "business_arjun_traders",
  iat: Math.floor(Date.now() / 1000),
  correlationId: "workspace-smoke-approver",
};
const shakti: Actor = {
  userId: "pilot_buyer_b2b02",
  name: "Shakti Hardware Buyer",
  roles: ["b2b_buyer"],
  businessAccountId: "business_shakti_hardware",
  iat: Math.floor(Date.now() / 1000),
  correlationId: "workspace-smoke-shakti",
};

const failures: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const arjunWorkspaces = await call(arjun, "GET", "/v1/workspaces");
const arjunWorkspaceId = (arjunWorkspaces.body.workspaces as Array<{ id: string }>)[0]?.id;
if (!arjunWorkspaceId) throw new Error("Arjun workspace missing.");
const channels = await call(arjun, "GET", `/v1/workspaces/${arjunWorkspaceId}/channels`);
const channelId = (channels.body.channels as Array<{ id: string; kind: string }>)
  .find((channel) => channel.kind === "procurement")?.id;
if (!channelId) throw new Error("Arjun procurement channel missing.");

// Conversation and tenant isolation.
const posted = await call(arjun, "POST", `/v1/channels/${channelId}/messages`, {
  body: `Workspace smoke ${Date.now()}`,
  message_type: "text",
});
const crossTenantChannel = await call(shakti, "GET", `/v1/channels/${channelId}/messages`);

// Product share + idempotent replay.
const shareKey = `smoke-share-${Date.now()}`;
const shareBody = {
  product_id: "prod_01M59JS4A6QTH32AXVW9P2D3A3",
  variant_id: "variant_01M59JS4DN9Q4S8TF4ATNFTYRS",
  offer_id: "offer_01M59JTETF6DG8WP2V4QAQJX8A",
  seller_id: "sel_01M4EC9DK3DWFSYX18FNDSGYC2",
  product_title: "Action Tesa HDHMR Board, Plain, 8' X 4'",
  quantity: 2,
  commercial_snapshot: {
    unit_amount_minor: 43690,
    currency_code: "INR",
    seller_name: "UrbanBuild Supply",
    sku: "ACTION-TESA-HDHMR-8X4",
  },
};
const shared = await call(arjun, "POST", `/v1/channels/${channelId}/shares`, shareBody, {
  "idempotency-key": shareKey,
});
const replayedShare = await call(arjun, "POST", `/v1/channels/${channelId}/shares`, shareBody, {
  "idempotency-key": shareKey,
});
const crossTenantShare = await call(shakti, "POST", `/v1/channels/${channelId}/shares`, shareBody);
const messagePage = await call(arjun, "GET", `/v1/channels/${channelId}/messages`);
const sharedMessage = (messagePage.body.messages as Array<Record<string, unknown>>)
  .find((message) => message.id === shared.body.id);

// Draft lifecycle: proposal -> accepted revision -> approval -> decision.
const drafts = await call(arjun, "GET", `/v1/workspaces/${arjunWorkspaceId}/purchase-drafts`);
const seeded = (drafts.body.drafts as Array<{ id: string }>)[0];
if (!seeded) throw new Error("Seeded purchase draft missing.");
const before = await call(arjun, "GET", `/v1/purchase-drafts/${seeded.id}`);
const beforeRevision = before.body.revision as Record<string, unknown>;
const beforeVersion = Number(beforeRevision.version);
const beforeLines = beforeRevision.lines as Array<Record<string, unknown>>;
const board = beforeLines.find((line) => line.line_key === "line_board");
if (!board) throw new Error("Seeded board line missing.");
const boardQuantity = Number(board.quantity);

const proposed = await call(
  arjun,
  "POST",
  `/v1/purchase-drafts/${seeded.id}/proposals`,
  {
    expected_version: beforeVersion,
    kind: "update_quantity",
    payload: { line_key: "line_board", quantity: 9 },
  },
  { "idempotency-key": `smoke-proposal-${Date.now()}` },
);
const proposalId = String(proposed.body.proposal_id ?? "");
check(proposed.status === 201 && proposalId.startsWith("prop_"), "proposal creation failed");

const accepted = await call(arjun, "POST", `/v1/proposals/${proposalId}/accept`);
check(accepted.status === 200, "proposal acceptance failed");

const afterAccept = await call(arjun, "GET", `/v1/purchase-drafts/${seeded.id}`);
const acceptedDraft = afterAccept.body.draft as Record<string, unknown>;
const acceptedRevision = afterAccept.body.revision as Record<string, unknown>;
const acceptedLines = acceptedRevision.lines as Array<Record<string, unknown>>;
const acceptedBoard = acceptedLines.find((line) => line.line_key === "line_board");
check(
  Number(acceptedRevision.version) === beforeVersion + 1,
  "accepted proposal did not create exactly one revision",
);
check(Number(acceptedBoard?.quantity) === 9, "accepted quantity was not applied");
check(acceptedDraft.lifecycle_status === "draft", "accepted proposal did not return to draft lifecycle");

const approverProposal = await call(
  approver,
  "POST",
  `/v1/purchase-drafts/${seeded.id}/proposals`,
  {
    expected_version: Number(acceptedRevision.version),
    kind: "update_quantity",
    payload: { line_key: "line_board", quantity: 10 },
  },
  { "idempotency-key": `smoke-approver-proposal-${Date.now()}` },
);
check(approverProposal.status === 403, "approver was allowed to propose a draft change");

const approvalRequested = await call(
  arjun,
  "POST",
  `/v1/purchase-drafts/${seeded.id}/approval-requests`,
  {
    expected_version: Number(acceptedRevision.version),
    revision_id: acceptedRevision.id,
    commercial_hash: acceptedRevision.commercial_hash,
    comment: "Smoke approval for the accepted revision.",
  },
  { "idempotency-key": `smoke-approval-${Date.now()}` },
);
const approvalId = String(approvalRequested.body.id ?? "");
check(approvalRequested.status === 201, "approval request failed");

const approved = await call(
  approver,
  "POST",
  `/v1/approval-requests/${approvalId}/approve`,
);
check(approved.status === 200, "approver decision failed");
const approvedView = await call(arjun, "GET", `/v1/purchase-drafts/${seeded.id}`);
const approvedDraft = approvedView.body.draft as Record<string, unknown> | undefined;
check(approvedDraft?.lifecycle_status === "approved", "approved draft lifecycle missing");

const crossTenantDraft = await call(shakti, "GET", `/v1/purchase-drafts/${seeded.id}`);
check(crossTenantDraft.status === 404, "cross-tenant draft read was not denied");

// Leave a pending approval on a fresh revision so the UI can demonstrate the
// approver decision surface after the smoke run.
const secondProposal = await call(
  arjun,
  "POST",
  `/v1/purchase-drafts/${seeded.id}/proposals`,
  {
    expected_version: Number(acceptedRevision.version) + 1,
    kind: "update_quantity",
    payload: { line_key: "line_tyre", quantity: 3 },
  },
  { "idempotency-key": `smoke-second-proposal-${Date.now()}` },
);
const secondProposalId = String(secondProposal.body.proposal_id ?? "");
await call(arjun, "POST", `/v1/proposals/${secondProposalId}/accept`);
const secondView = await call(arjun, "GET", `/v1/purchase-drafts/${seeded.id}`);
const secondRevision = secondView.body.revision as Record<string, unknown>;
const pendingApproval = await call(
  arjun,
  "POST",
  `/v1/purchase-drafts/${seeded.id}/approval-requests`,
  {
    expected_version: Number(secondRevision.version),
    revision_id: secondRevision.id,
    commercial_hash: secondRevision.commercial_hash,
    comment: "Please approve the staged replenishment.",
  },
  { "idempotency-key": `smoke-pending-approval-${Date.now()}` },
);
check(pendingApproval.status === 201, "pending approval request failed");

const shaktiWorkspaces = await call(shakti, "GET", "/v1/workspaces");
const shaktiWorkspaceId = (shaktiWorkspaces.body.workspaces as Array<{ id: string }>)[0]?.id;

const result = {
  arjun_workspace: arjunWorkspaceId,
  shakti_workspace: shaktiWorkspaceId ?? null,
  post_status: posted.status,
  cross_tenant_channel_status: crossTenantChannel.status,
  share_status: shared.status,
  share_replay_same_id: shared.body.id === replayedShare.body.id,
  share_reference_type:
    ((sharedMessage?.references as Array<Record<string, unknown>>) ?? [])[0]?.reference_type ?? null,
  cross_tenant_share_status: crossTenantShare.status,
  draft_id: seeded.id,
  board_quantity_before: boardQuantity,
  proposal_status: proposed.status,
  accept_status: accepted.status,
  revision_before: beforeVersion,
  revision_after_accept: Number(acceptedRevision.version),
  approver_proposal_status: approverProposal.status,
  approval_request_status: approvalRequested.status,
  approval_decision_status: approved.status,
  approved_lifecycle: approvedDraft?.lifecycle_status ?? null,
  cross_tenant_draft_status: crossTenantDraft.status,
  pending_approval_status: pendingApproval.status,
  final_version: Number(secondRevision.version),
};
console.log(JSON.stringify(result, null, 2));

check(arjunWorkspaces.status === 200, "arjun workspace listing failed");
check(channels.status === 200, "arjun channel listing failed");
check(posted.status === 201, "message post failed");
check(shaktiWorkspaces.status === 200, "shakti workspace listing failed");
check(shaktiWorkspaceId === "ws_shakti_procurement", "shakti workspace mismatch");
check(crossTenantChannel.status === 404, "cross-tenant channel read was not denied");
check(shared.status === 201, "product share failed");
check(shared.body.id === replayedShare.body.id, "share idempotency replay returned a new message");
check(crossTenantShare.status === 404, "cross-tenant share was not denied");

if (failures.length > 0) {
  console.error("WORKSPACE_SMOKE_FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("WORKSPACE_SMOKE_PASS");
