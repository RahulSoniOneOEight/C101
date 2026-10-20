/**
 * CHG-072 household smoke.
 *
 * Exercises the real workspace service over HTTP with signed actor contexts. It creates a throwaway
 * household project, invites participants, chats, proposes a quantity change and proves the negative
 * paths. The project is deleted at the end; no B2B workspace is touched.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";

const BASE = process.env.WORKSPACE_BASE_URL ?? "http://127.0.0.1:9040";
const SECRET = process.env.WORKSPACE_SERVICE_SECRET;
const DATABASE_URL = process.env.WORKSPACE_DATABASE_URL;
if (!SECRET || SECRET.length < 24) throw new Error("WORKSPACE_SERVICE_SECRET is required.");
if (!DATABASE_URL) throw new Error("WORKSPACE_DATABASE_URL is required.");

type ActorInput = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  businessAccountId?: string;
};

function actorHeaders(actor: ActorInput): Record<string, string> {
  const payload = {
    ...actor,
    iat: Math.floor(Date.now() / 1000),
    correlationId: `smoke_${randomUUID()}`,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET as string).update(encoded).digest("hex");
  return { "x-workspace-actor": encoded, "x-workspace-signature": signature };
}

async function call<T>(
  actor: ActorInput,
  method: string,
  path: string,
  body?: unknown,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...actorHeaders(actor),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${method} ${path}: ${response.status} ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const suffix = randomUUID().slice(0, 8);
const owner: ActorInput = {
  userId: `smoke_owner_${suffix}`,
  name: "Smoke Owner",
  email: `owner.${suffix}@buildkart.test`,
  roles: ["customer"],
};
const participant1: ActorInput = {
  userId: `smoke_p1_${suffix}`,
  name: "Smoke Participant One",
  email: `p1.${suffix}@buildkart.test`,
  roles: ["customer"],
};
const participant2: ActorInput = {
  userId: `smoke_p2_${suffix}`,
  name: "Smoke Participant Two",
  email: `p2.${suffix}@buildkart.test`,
  roles: ["customer"],
};
const participant3: ActorInput = {
  userId: `smoke_p3_${suffix}`,
  name: "Smoke Participant Three",
  email: `p3.${suffix}@buildkart.test`,
  roles: ["customer"],
};
const outsider: ActorInput = {
  userId: `smoke_out_${suffix}`,
  name: "Smoke Outsider",
  email: `out.${suffix}@buildkart.test`,
  roles: ["customer"],
};

const cleanup = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
let workspaceId: string | undefined;

try {
  const created = await call<{ workspace: Record<string, unknown> }>(
    owner,
    "POST",
    "/v1/household-projects",
    { name: `Smoke Renovation ${suffix}` },
    201,
  );
  workspaceId = String(created.workspace.id);
  assert.ok(workspaceId);
  assert.equal(created.workspace.scope_type, "household");
  assert.equal(created.workspace.role, "owner");

  const channels = await call<{ channels: Array<{ id: string; kind: string }> }>(
    owner,
    "GET",
    `/v1/workspaces/${workspaceId}/channels`,
  );
  const projectChannel = channels.channels.find((channel) => channel.kind === "project");
  assert.ok(projectChannel, "household project must expose a project channel");

  // Invitation negatives run while the project still has capacity.
  const misdirected = await call<{ invite_token: string }>(
    owner,
    "POST",
    `/v1/workspaces/${workspaceId}/invitations`,
    { email: `someone.${suffix}@buildkart.test` },
    201,
  );
  const mismatch = await call<{ code?: string }>(
    outsider,
    "POST",
    "/v1/workspace-invitations/accept",
    { token: misdirected.invite_token },
    403,
  );
  assert.equal(mismatch.code, "invitation-email-mismatch");

  const revokeTarget = await call<{ invite_token: string; invitation: { id: string } }>(
    owner,
    "POST",
    `/v1/workspaces/${workspaceId}/invitations`,
    { email: `revoked.${suffix}@buildkart.test` },
    201,
  );
  await call(owner, "POST", `/v1/workspaces/${workspaceId}/invitations/${revokeTarget.invitation.id}/revoke`);
  const revoked = await call<{ code?: string }>(
    {
      userId: `smoke_revoked_${suffix}`,
      name: "Revoked Invitee",
      email: `revoked.${suffix}@buildkart.test`,
      roles: ["customer"],
    },
    "POST",
    "/v1/workspace-invitations/accept",
    { token: revokeTarget.invite_token },
    404,
  );
  assert.equal(revoked.code, "invitation-not-found");

  // Owner invites three participants and each accepts with their own identity.
  const participants = [participant1, participant2, participant3];
  for (const participant of participants) {
    const invited: { invite_token: string } = await call<{ invite_token: string }>(
      owner,
      "POST",
      `/v1/workspaces/${workspaceId}/invitations`,
      { email: participant.email },
      201,
    );
    const accepted: { workspace: Record<string, unknown> } = await call<{
      workspace: Record<string, unknown>;
    }>(
      participant,
      "POST",
      "/v1/workspace-invitations/accept",
      { token: invited.invite_token },
    );
    assert.equal(accepted.workspace.role, "member");
    assert.equal(
      Object.hasOwn(accepted.workspace, "owner_user_id"),
      false,
      "participant projection must not carry owner_user_id",
    );
  }

  // Fourth participant is refused by the database-enforced cap.
  const fourth = await call<{ code?: string }>(
    owner,
    "POST",
    `/v1/workspaces/${workspaceId}/invitations`,
    { email: `p4.${suffix}@buildkart.test` },
    409,
  );
  assert.equal(fourth.code, "participant-limit-reached");

  // Chat works for the participant and is visible to the owner.
  await call(participant1, "POST", `/v1/channels/${projectChannel.id}/messages`, {
    body: `Participant message ${suffix}`,
  }, 201);
  const messages = await call<{ messages: Array<{ body: string }> }>(
    owner,
    "GET",
    `/v1/channels/${projectChannel.id}/messages`,
  );
  assert.ok(messages.messages.some((message) => message.body === `Participant message ${suffix}`));

  // A product capture is de-duplicated per conversation.
  const shareBody = {
    product_id: "prod_smoke",
    variant_id: "variant_smoke",
    offer_id: "offer_smoke",
    quantity: 1,
    product_title: "Smoke renovation product",
    commercial_snapshot: {
      product_title: "Smoke renovation product",
      unit_amount_minor: 10000,
      currency_code: "INR",
    },
  };
  const shared = await call<{ id: string }>(
    participant1,
    "POST",
    `/v1/channels/${projectChannel.id}/shares`,
    shareBody,
    201,
  );
  const duplicateShare = await call<{ id: string }>(
    owner,
    "POST",
    `/v1/channels/${projectChannel.id}/shares`,
    shareBody,
    201,
  );
  assert.equal(duplicateShare.id, shared.id);

  const line = {
    line_key: `line_${suffix}`,
    product_id: "prod_smoke",
    variant_id: "variant_smoke",
    seller_id: "seller_smoke",
    offer_id: "offer_smoke",
    fulfilment_context_id: "default",
    quantity: 1,
    unit_amount_minor: 10000,
    currency_code: "INR",
    commercial_snapshot: {
      product_title: "Smoke renovation product",
      unit_amount_minor: 10000,
      currency_code: "INR",
    },
  };

  // A participant cannot create an accepted revision directly.
  const directRevision = await call<{ code?: string }>(
    participant1,
    "POST",
    `/v1/workspaces/${workspaceId}/purchase-drafts`,
    {
      name: "Forbidden direct revision",
      channel_id: projectChannel.id,
      lines: [line],
    },
    403,
  );
  assert.equal(directRevision.code, "participant-must-propose");

  // The participant may initialize an empty shared-list aggregate and propose
  // its first line. No immutable revision exists until the owner accepts.
  const draft = await call<{ draft: { id: string; current_version: number } }>(
    participant1,
    "POST",
    `/v1/workspaces/${workspaceId}/purchase-drafts`,
    {
      name: "Shared renovation list",
      channel_id: projectChannel.id,
      lines: [],
    },
    201,
  );
  const draftId = draft.draft.id;
  assert.equal(draft.draft.current_version, 0);
  const firstLineProposal = await call<{ proposal_id: string }>(
    participant1,
    "POST",
    `/v1/purchase-drafts/${draftId}/proposals`,
    {
      expected_version: draft.draft.current_version,
      kind: "add_line",
      payload: { line },
    },
    201,
  );

  // A participant cannot decide their own proposal.
  const selfDecision = await call<{ code?: string }>(
    participant1,
    "POST",
    `/v1/proposals/${firstLineProposal.proposal_id}/accept`,
    {},
    403,
  );
  assert.equal(selfDecision.code, "proposal-decision-forbidden");

  await call(owner, "POST", `/v1/proposals/${firstLineProposal.proposal_id}/accept`, {});
  const firstRevision = await call<{
    draft: { current_version: number };
    revision: { lines: Array<{ quantity: number }> };
  }>(owner, "GET", `/v1/purchase-drafts/${draftId}`);
  assert.equal(firstRevision.draft.current_version, 1);
  assert.equal(firstRevision.revision.lines[0].quantity, 1);

  // A participant quantity edit is another proposal; only owner acceptance
  // creates the next immutable revision.
  const quantityProposal = await call<{ proposal_id: string }>(
    participant1,
    "POST",
    `/v1/purchase-drafts/${draftId}/proposals`,
    {
      expected_version: firstRevision.draft.current_version,
      kind: "update_quantity",
      payload: { line_key: `line_${suffix}`, quantity: 3 },
    },
    201,
  );
  await call(owner, "POST", `/v1/proposals/${quantityProposal.proposal_id}/accept`, {});
  const accepted = await call<{
    draft: { current_version: number };
    revision: { lines: Array<{ quantity: number }> };
  }>(owner, "GET", `/v1/purchase-drafts/${draftId}`);
  assert.equal(accepted.draft.current_version, 2);
  assert.equal(accepted.revision.lines[0].quantity, 3);

  // Household has no approval step.
  const approval = await call<{ code?: string }>(
    owner,
    "POST",
    `/v1/purchase-drafts/${draftId}/approval-requests`,
    { expected_version: accepted.draft.current_version },
    403,
  );
  assert.equal(approval.code, "approval-not-supported");

  // Participants cannot manage invitations.
  const participantInvites = await call<{ code?: string }>(
    participant1,
    "GET",
    `/v1/workspaces/${workspaceId}/invitations`,
    undefined,
    403,
  );
  assert.equal(participantInvites.code, "owner-required");

  // Outside the project every read is 404, never 403.
  const outsiderRead = await call<{ code?: string }>(
    outsider,
    "GET",
    `/v1/workspaces/${workspaceId}`,
    undefined,
    404,
  );
  assert.equal(outsiderRead.code, "workspace-not-found");

  console.log(
    "household smoke passed: create, invite x3, cap, chat, de-duplicated share, proposal-only participant revisions, owner acceptance, redaction, 404 isolation, revoke",
  );
} finally {
  if (workspaceId) {
    await cleanup.query("delete from workspace where id = $1", [workspaceId]);
  }
  await cleanup.end();
}
