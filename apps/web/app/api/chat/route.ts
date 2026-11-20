import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  createHouseholdProject,
  getWorkspaceDraft,
  getWorkspaceInvitations,
  inviteWorkspaceParticipant,
  listWorkspaceChannels,
  listWorkspaceDrafts,
  listWorkspaceMessages,
  listWorkspaces,
  markWorkspaceRead,
  revokeWorkspaceInvitation,
  sendWorkspaceMessage,
  shareWorkspaceProduct,
} from "@/lib/experience-api";

/** Session-authenticated proxy for the workspace conversation used by the "Ask BazarBee" drawer. */
export async function GET(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to chat with BazarBee." }, { status: 401 });
  }
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel");
  const workspaceId = url.searchParams.get("workspace");
  const draftsWorkspace = url.searchParams.get("drafts");
  const draftId = url.searchParams.get("draft");
  const invitationsWorkspace = url.searchParams.get("invitations");
  try {
    if (invitationsWorkspace) {
      const page = await getWorkspaceInvitations(token, invitationsWorkspace);
      return NextResponse.json(
        { page },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (draftsWorkspace) {
      const drafts = await listWorkspaceDrafts(token, draftsWorkspace);
      return NextResponse.json(
        { drafts },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (draftId) {
      const draft = await getWorkspaceDraft(token, draftId);
      return NextResponse.json(
        { draft },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (channelId) {
      const page = await listWorkspaceMessages(
        token,
        channelId,
        url.searchParams.get("cursor") ?? undefined,
      );
      return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
    }
    if (workspaceId) {
      const channels = await listWorkspaceChannels(token, workspaceId);
      return NextResponse.json(
        { channels },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const workspaces = await listWorkspaces(token);
    return NextResponse.json(
      { workspaces },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to chat with BazarBee." }, { status: 401 });
  }
  let body: {
    action?: unknown;
    channelId?: unknown;
    body?: unknown;
    name?: unknown;
    productId?: unknown;
    variantId?: unknown;
    offerId?: unknown;
    sellerId?: unknown;
    quantity?: unknown;
    productTitle?: unknown;
    sku?: unknown;
    unitPriceMinor?: unknown;
    currency?: unknown;
    sellerName?: unknown;
    sequence?: unknown;
    workspaceId?: unknown;
    email?: unknown;
    invitationId?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  try {
    if (body.action === "create-project") {
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : "My BazarBee project";
      const workspace = await createHouseholdProject(token, name);
      return NextResponse.json({ workspace }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "send") {
      const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!channelId || !text) {
        return NextResponse.json(
          { error: "A channel and a message are required." },
          { status: 400 },
        );
      }
      const message = await sendWorkspaceMessage(token, channelId, text.slice(0, 4000));
      return NextResponse.json({ message }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "invite") {
      const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!workspaceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: "A workspace and a valid email are required." },
          { status: 400 },
        );
      }
      const created = await inviteWorkspaceParticipant(token, workspaceId, email);
      return NextResponse.json(created, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "revoke-invite") {
      const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
      const invitationId =
        typeof body.invitationId === "string" ? body.invitationId.trim() : "";
      if (!workspaceId || !invitationId) {
        return NextResponse.json(
          { error: "A workspace and invitation are required." },
          { status: 400 },
        );
      }
      await revokeWorkspaceInvitation(token, workspaceId, invitationId);
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "mark-read") {
      const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
      const rawSequence = body.sequence;
      const sequence =
        typeof rawSequence === "number"
          ? rawSequence
          : typeof rawSequence === "string" && rawSequence.trim()
            ? Number(rawSequence)
            : Number.NaN;
      if (!channelId || !Number.isInteger(sequence) || sequence < 0) {
        return NextResponse.json(
          { error: "A channel and a non-negative sequence are required." },
          { status: 400 },
        );
      }
      await markWorkspaceRead(token, channelId, sequence);
      return new NextResponse(null, { status: 204 });
    }
    if (body.action === "share-product") {
      const channelId = typeof body.channelId === "string" ? body.channelId.trim() : "";
      const productId = typeof body.productId === "string" ? body.productId.trim() : "";
      const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
      const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
      const productTitle =
        typeof body.productTitle === "string" ? body.productTitle.trim().slice(0, 240) : "";
      const quantity = Number(body.quantity);
      if (
        !channelId ||
        !productId ||
        !variantId ||
        !offerId ||
        !productTitle ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return NextResponse.json(
          { error: "A channel, product, variant, offer and quantity are required." },
          { status: 400 },
        );
      }
      const message = await shareWorkspaceProduct(token, channelId, {
        productId,
        variantId,
        offerId,
        sellerId: typeof body.sellerId === "string" ? body.sellerId : null,
        quantity,
        productTitle,
        sku: typeof body.sku === "string" ? body.sku : null,
        unitPriceMinor:
          typeof body.unitPriceMinor === "number" && Number.isFinite(body.unitPriceMinor)
            ? body.unitPriceMinor
            : null,
        currency: typeof body.currency === "string" ? body.currency : null,
        sellerName: typeof body.sellerName === "string" ? body.sellerName : null,
      });
      return NextResponse.json({ message }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown chat action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
