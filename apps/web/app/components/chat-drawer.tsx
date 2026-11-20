"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProductDetail,
  WorkspaceChannel,
  WorkspaceDraft,
  WorkspaceDraftLine,
  WorkspaceDraftProposal,
  WorkspaceDraftView,
  WorkspaceInvitationCreated,
  WorkspaceInvitationPage,
  WorkspaceMessage,
  WorkspaceSummary,
} from "@/lib/experience-api";
import { addToCart, announceCartConflict } from "@/lib/cart";
import { formatMoney } from "@/lib/money";

type LoadState = "idle" | "loading" | "ready" | "error";
type ChatView = "chat" | "shared" | "participants";
type SharedState =
  | { status: "idle" | "loading" }
  | { status: "ready"; view: WorkspaceDraftView | null }
  | { status: "error"; message: string };
type ParticipantsState =
  | { status: "idle" | "loading" }
  | { status: "ready"; page: WorkspaceInvitationPage }
  | { status: "error"; message: string };

const SUGGESTIONS = [
  "What can you do?",
  "Summarise my shared list",
  "How do I move this list into a cart?",
];

const CHANNEL_KEY = "bazarbee.chat.channel.v1";

interface PendingShare {
  productId: string;
  variantId: string;
  offerId: string;
  sellerId?: string;
  sellerName?: string;
  quantity: number;
  productTitle: string;
  sku?: string;
  unitPriceMinor?: number;
  currency?: string;
}

interface CartBuildLine {
  line: WorkspaceDraftLine;
  offerId: string;
  unitAmountMinor: number;
  currencyCode: string;
  sellerName: string;
  sku: string;
  productTitle: string;
  thumbnail?: string | null;
  differences: string[];
  blocked: boolean;
}

const CART_BUILD_KEY = "bazarbee.cart-builds.v1";

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21">
      <path
        d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M18.5 3v3M17 4.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function isAssistantMessage(message: WorkspaceMessage): boolean {
  return (
    message.actor_id === "assistant_cart" ||
    /assistant/i.test(message.actor_name ?? "") ||
    message.message_type === "assistant_reply"
  );
}

function channelLabel(channel: WorkspaceChannel): string {
  if (channel.kind === "assistant") return "Assistant";
  if (channel.kind === "procurement") return "Procurement";
  if (channel.kind === "project") return "Project chat";
  return channel.name || "Team chat";
}

/**
 * "Ask BazarBee" is the web home of the app's workspace conversation. It uses the same
 * Experience API workspace proxy: a household project (or the signed-in trade workspace) exposes
 * an assistant channel, and every message is persisted server-side. The shared list and cart build
 * are explicit, user-triggered actions; building a cart never creates an order.
 */
export function ChatDrawer({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [channels, setChannels] = useState<WorkspaceChannel[]>([]);
  const [channel, setChannel] = useState<WorkspaceChannel | null>(null);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [view, setView] = useState<ChatView>("chat");
  const [shared, setShared] = useState<SharedState>({ status: "idle" });
  const [draftOptions, setDraftOptions] = useState<WorkspaceDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftError, setDraftError] = useState("");
  const [cartBuildOpen, setCartBuildOpen] = useState(false);
  const [cartBuildLines, setCartBuildLines] = useState<CartBuildLine[]>([]);
  const [cartBuildLoading, setCartBuildLoading] = useState(false);
  const [cartBuildAck, setCartBuildAck] = useState(false);
  const [cartBuildMessage, setCartBuildMessage] = useState("");
  const [cartBuildError, setCartBuildError] = useState("");
  const [participants, setParticipants] = useState<ParticipantsState>({ status: "idle" });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [createdInvite, setCreatedInvite] = useState<WorkspaceInvitationCreated | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const isTrade = pathname?.startsWith("/trade") ?? false;
  const canManageInvitations = workspace?.can_manage_invitations === true;

  const chooseWorkspace = useCallback(
    (workspaces: WorkspaceSummary[]) => {
      const preferred = isTrade ? "business_account" : "household";
      return (
        workspaces.find((candidate) => candidate.scope_type === preferred) ??
        workspaces.find((candidate) => candidate.scope_type === "household") ??
        workspaces[0] ??
        null
      );
    },
    [isTrade],
  );

  const markChannelRead = useCallback(async (channelId: string, sequence: number) => {
    if (sequence <= 0) return;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark-read", channelId, sequence }),
      });
      if (!response.ok) return;
      setChannels((current) =>
        current.map((candidate) =>
          candidate.id === channelId ? { ...candidate, unread_count: 0 } : candidate,
        ),
      );
    } catch {
      // Read state must never block the conversation.
    }
  }, []);

  const loadMessages = useCallback(async (nextChannel: WorkspaceChannel) => {
    let cursor: string | undefined;
    let all: WorkspaceMessage[] = [];
    for (let page = 0; page < 10; page += 1) {
      const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(
        `/api/chat?channel=${encodeURIComponent(nextChannel.id)}${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("The conversation could not be loaded.");
      const data = (await response.json()) as {
        messages?: WorkspaceMessage[];
        next_cursor?: string;
      };
      const batch = data.messages ?? [];
      all = [...all, ...batch];
      const next = data.next_cursor;
      if (batch.length < 50 || !next || next === cursor) break;
      cursor = next;
    }
    const latest = all.slice(-100);
    setMessages(latest);
    const last = latest[latest.length - 1];
    if (last) void markChannelRead(nextChannel.id, last.sequence);
  }, [markChannelRead]);

  const fetchDraftView = useCallback(async (draftId: string) => {
    const detailResponse = await fetch(
      `/api/chat?draft=${encodeURIComponent(draftId)}`,
      { cache: "no-store" },
    );
    if (!detailResponse.ok) throw new Error("The shared list could not be loaded.");
    const detail = (await detailResponse.json()) as { draft?: WorkspaceDraftView };
    if (!detail.draft) throw new Error("The shared list could not be loaded.");
    setSelectedDraftId(draftId);
    setShared({ status: "ready", view: detail.draft });
  }, []);

  const loadShared = useCallback(async () => {
    if (!workspace) return;
    setShared({ status: "loading" });
    setDraftMessage("");
    setDraftError("");
    setCartBuildOpen(false);
    try {
      const draftsResponse = await fetch(
        `/api/chat?drafts=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      );
      if (!draftsResponse.ok) throw new Error("The shared list could not be loaded.");
      const draftsPayload = (await draftsResponse.json()) as {
        drafts?: WorkspaceDraft[];
      };
      const drafts = draftsPayload.drafts ?? [];
      setDraftOptions(drafts);
      const next =
        drafts.find((candidate) => candidate.id === selectedDraftId) ?? drafts[0];
      if (!next) {
        setSelectedDraftId("");
        setShared({ status: "ready", view: null });
        return;
      }
      await fetchDraftView(next.id);
    } catch (cause) {
      setShared({ status: "error", message: (cause as Error).message });
    }
  }, [workspace, selectedDraftId, fetchDraftView]);

  const loadParticipants = useCallback(async () => {
    if (!workspace) return;
    setParticipants({ status: "loading" });
    try {
      const response = await fetch(
        `/api/chat?invitations=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Participants could not be loaded.");
      const payload = (await response.json()) as { page?: WorkspaceInvitationPage };
      if (!payload.page) throw new Error("Participants could not be loaded.");
      setParticipants({ status: "ready", page: payload.page });
    } catch (cause) {
      setParticipants({ status: "error", message: (cause as Error).message });
    }
  }, [workspace]);

  const load = useCallback(async () => {
    if (!signedIn) {
      setAuthRequired(true);
      setState("ready");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setState("loading");
    setError("");
    try {
      let response = await fetch("/api/chat", { cache: "no-store" });
      if (response.status === 401) {
        setAuthRequired(true);
        setState("ready");
        return;
      }
      if (!response.ok) throw new Error("The conversation service is unavailable.");
      let data = (await response.json()) as { workspaces?: WorkspaceSummary[] };
      let chosen: WorkspaceSummary | null = chooseWorkspace(data.workspaces ?? []);
      if (!chosen) {
        const created = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "create-project", name: "My BazarBee project" }),
        });
        if (!created.ok) {
          const failure = (await created.json().catch(() => ({}))) as { error?: string };
          throw new Error(failure.error ?? "A conversation workspace could not be created.");
        }
        const payload = (await created.json()) as { workspace?: WorkspaceSummary | null };
        chosen = payload.workspace ?? null;
      }
      if (!chosen) throw new Error("No conversation workspace is available for this account.");
      setWorkspace(chosen);
      setShared({ status: "idle" });
      setParticipants({ status: "idle" });
      setCreatedInvite(null);
      setInviteMessage("");

      response = await fetch(`/api/chat?workspace=${encodeURIComponent(chosen.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The workspace channels could not be loaded.");
      const channelsPayload = (await response.json()) as { channels?: WorkspaceChannel[] };
      const allChannels = channelsPayload.channels ?? [];
      const assistant =
        allChannels.find((candidate) => candidate.kind === "assistant") ??
        allChannels.find((candidate) => candidate.kind === "project") ??
        allChannels[0];
      if (!assistant) throw new Error("This workspace has no conversation channel yet.");
      const human =
        allChannels.find(
          (candidate) => candidate.kind === "project" || candidate.kind === "procurement",
        ) ?? allChannels.find((candidate) => candidate.id !== assistant.id);
      const visible = [assistant, human].filter(
        (candidate, index, list): candidate is WorkspaceChannel =>
          Boolean(candidate) && list.findIndex((item) => item?.id === candidate?.id) === index,
      );
      setChannels(visible);
      let savedChannel = "";
      try {
        savedChannel = window.localStorage.getItem(CHANNEL_KEY) ?? "";
      } catch {
        // Storage is optional; fall back to the assistant channel.
      }
      const initialChannel =
        visible.find((candidate) => candidate.id === savedChannel) ?? assistant;
      setChannel(initialChannel);
      await loadMessages(initialChannel);
      setState("ready");
      setAuthRequired(false);
    } catch (cause) {
      setError((cause as Error).message);
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }, [chooseWorkspace, loadMessages, signedIn]);

  useEffect(() => {
    if (open && state === "idle") void load();
  }, [load, open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const productContext = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          title?: string;
          sku?: string;
          productId?: string;
          variantId?: string;
          offerId?: string;
          sellerId?: string;
          sellerName?: string;
          quantity?: number;
          unitPriceMinor?: number;
          currency?: string;
        }>
      ).detail;
      if (!detail?.title) return;
      setOpen(true);
      if (
        detail.productId &&
        detail.variantId &&
        detail.offerId &&
        Number.isInteger(detail.quantity) &&
        (detail.quantity ?? 0) > 0
      ) {
        setDraft("");
        setPendingShare({
          productId: detail.productId,
          variantId: detail.variantId,
          offerId: detail.offerId,
          sellerId: detail.sellerId,
          sellerName: detail.sellerName,
          quantity: detail.quantity as number,
          productTitle: detail.title,
          sku: detail.sku,
          unitPriceMinor: detail.unitPriceMinor,
          currency: detail.currency,
        });
        return;
      }
      setDraft(
        `Tell me about ${detail.title}${detail.sku ? ` (SKU ${detail.sku})` : ""}. Is it suitable for my project?`,
      );
    };
    window.addEventListener("bazarbee:chat-product", productContext);
    return () => window.removeEventListener("bazarbee:chat-product", productContext);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, state]);

  useEffect(() => {
    if (open && state === "ready" && channel) void loadMessages(channel);
  }, [open, state, channel, loadMessages]);

  useEffect(() => {
    if (!open || !channel || state !== "ready" || sending) return;
    const timer = window.setInterval(() => {
      void loadMessages(channel);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [open, channel, state, sending, loadMessages]);

  useEffect(() => {
    if (open && view === "shared" && workspace && shared.status === "idle") {
      void loadShared();
    }
  }, [open, view, workspace, shared.status, loadShared]);

  useEffect(() => {
    if (
      open &&
      view === "participants" &&
      workspace &&
      canManageInvitations &&
      participants.status === "idle"
    ) {
      void loadParticipants();
    }
  }, [open, view, workspace, canManageInvitations, participants.status, loadParticipants]);

  const selectChannel = async (next: WorkspaceChannel) => {
    if (sending || next.id === channel?.id) return;
    try {
      window.localStorage.setItem(CHANNEL_KEY, next.id);
    } catch {
      // Selection still works for this open drawer.
    }
    setChannel(next);
    setMessages([]);
    setState("loading");
    setError("");
    try {
      await loadMessages(next);
      setState("ready");
    } catch (cause) {
      setError((cause as Error).message);
      setState("error");
    }
  };

  // "Discuss" on a product writes a product reference into the human channel. Sharing is
  // set-like in the workspace service, so a repeated Discuss returns the first message.
  useEffect(() => {
    if (!pendingShare || !signedIn || state !== "ready") return;
    const target = channels.find(
      (candidate) => candidate.kind === "project" || candidate.kind === "procurement",
    );
    const share = pendingShare;
    setPendingShare(null);
    setDraft("");
    setError("");
    if (!target) {
      setDraft(
        `Tell me about ${share.productTitle}${share.sku ? ` (SKU ${share.sku})` : ""}. Is it suitable for my project?`,
      );
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "share-product",
            channelId: target.id,
            productId: share.productId,
            variantId: share.variantId,
            offerId: share.offerId,
            sellerId: share.sellerId,
            sellerName: share.sellerName,
            quantity: share.quantity,
            productTitle: share.productTitle,
            sku: share.sku,
            unitPriceMinor: share.unitPriceMinor,
            currency: share.currency,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "The product could not be shared.");
        }
        if (target.id === channel?.id) await loadMessages(target);
        else await selectChannel(target);
      } catch (cause) {
        setError((cause as Error).message);
        setDraft(
          `Tell me about ${share.productTitle}${share.sku ? ` (SKU ${share.sku})` : ""}. Is it suitable for my project?`,
        );
      }
    })();
  }, [pendingShare, signedIn, state, channels, channel, selectChannel, loadMessages]);

  const send = async (text: string) => {
    if (!channel || sending) return;
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setError("");
    const optimistic: WorkspaceMessage = {
      id: `pending_${Date.now()}`,
      workspace_id: channel.workspace_id,
      channel_id: channel.id,
      actor_id: "you",
      actor_name: "You",
      body: value,
      message_type: "text",
      sequence: Number.MAX_SAFE_INTEGER,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    const existingIds = new Set(messages.map((message) => message.id));
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", channelId: channel.id, body: value }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The message could not be sent.");
      }
      // The assistant reply is written by the workspace service before the POST resolves. One
      // short read is usually enough; retry briefly so a slower write still appears.
      let latest: WorkspaceMessage[] = [];
      const attempts = channel.kind === "assistant" ? 6 : 2;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 220 : 550));
        const refresh = await fetch(`/api/chat?channel=${encodeURIComponent(channel.id)}`, {
          cache: "no-store",
        });
        if (!refresh.ok) continue;
        const payload = (await refresh.json()) as { messages?: WorkspaceMessage[] };
        latest = payload.messages ?? [];
        if (
          latest.some(
            (message) => isAssistantMessage(message) && !existingIds.has(message.id),
          )
        ) {
          break;
        }
      }
      if (latest.length > 0) {
        setMessages(latest);
        const last = latest[latest.length - 1];
        if (last) void markChannelRead(channel.id, last.sequence);
      }
    } catch (cause) {
      setError((cause as Error).message);
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const unreadTotal = channels.reduce(
    (total, candidate) => total + (candidate.unread_count ?? 0),
    0,
  );
  const sharedView = shared.status === "ready" ? shared.view : null;
  const sharedLines = sharedView?.revision?.lines ?? [];
  const sharedPending =
    sharedView?.proposals.filter((proposal) => proposal.status === "pending") ?? [];
  const isBusinessWorkspace = workspace?.scope_type === "business_account";
  const draftRole = sharedView?.draft.role ?? "";
  const canDecideProposal = isBusinessWorkspace
    ? draftRole === "buyer" || draftRole === "admin"
    : draftRole === "owner";
  const sharedRevision = sharedView?.revision ?? null;
  const sharedApproval = sharedView?.approval ?? null;
  const approvalReady =
    !isBusinessWorkspace ||
    (sharedApproval?.decision === "approved" &&
      sharedApproval?.revision_id === sharedRevision?.id &&
      sharedApproval?.commercial_hash === sharedRevision?.commercial_hash);
  const canBuildCart = isBusinessWorkspace
    ? draftRole === "buyer" || draftRole === "admin"
    : draftRole === "owner";
  const cartBuildHasDifferences = cartBuildLines.some((line) => line.differences.length > 0);
  const cartBuildHasBlocked = cartBuildLines.some((line) => line.blocked);
  const cartBuildReady =
    cartBuildOpen &&
    !cartBuildLoading &&
    Boolean(sharedRevision) &&
    cartBuildLines.length > 0 &&
    !cartBuildHasBlocked &&
    (!cartBuildHasDifferences || cartBuildAck) &&
    approvalReady;
  const participantsPage = participants.status === "ready" ? participants.page : null;
  const atCapacity = participantsPage
    ? participantsPage.participants >= participantsPage.capacity
    : false;

  async function inviteParticipant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || inviteBusy) return;
    const email = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    setInviteMessage("");
    setCreatedInvite(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          workspaceId: workspace.id,
          email,
        }),
      });
      const payload = (await response.json()) as {
        invitation?: WorkspaceInvitationCreated["invitation"];
        invite_token?: string;
        error?: string;
      };
      if (!response.ok || !payload.invitation || !payload.invite_token) {
        throw new Error(payload.error ?? "The invitation could not be created.");
      }
      setCreatedInvite({
        invitation: payload.invitation,
        invite_token: payload.invite_token,
      });
      setInviteMessage(`Invitation created for ${payload.invitation.invitee_email}.`);
      setInviteEmail("");
      await loadParticipants();
    } catch (cause) {
      setInviteError((cause as Error).message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!workspace || inviteBusy) return;
    setInviteBusy(true);
    setInviteError("");
    setInviteMessage("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "revoke-invite",
          workspaceId: workspace.id,
          invitationId,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The invitation could not be revoked.");
      }
      setInviteMessage("Invitation revoked.");
      if (createdInvite?.invitation.id === invitationId) setCreatedInvite(null);
      await loadParticipants();
    } catch (cause) {
      setInviteError((cause as Error).message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function postProposal(kind: string, payload: Record<string, unknown>) {
    if (!sharedView || draftBusy) return;
    const draftId = sharedView.draft.id;
    const expectedVersion =
      sharedRevision?.version ?? sharedView.draft.current_version;
    setDraftBusy(true);
    setDraftError("");
    setDraftMessage("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "draft-proposal",
          draftId,
          expectedVersion,
          kind,
          payload,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        proposal_id?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "The shared list could not be updated.");
      }
      if (canDecideProposal && result.proposal_id) {
        const decision = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "proposal-decision",
            proposalId: result.proposal_id,
            decision: "accept",
          }),
        });
        if (!decision.ok) {
          const failure = (await decision.json().catch(() => ({}))) as { error?: string };
          throw new Error(failure.error ?? "The proposal could not be accepted.");
        }
      }
      setDraftMessage(
        canDecideProposal
          ? "Shared list updated."
          : "Proposal sent to the workspace owner.",
      );
      await fetchDraftView(draftId);
    } catch (cause) {
      setDraftError((cause as Error).message);
    } finally {
      setDraftBusy(false);
    }
  }

  async function proposeQuantity(line: WorkspaceDraftLine, next: number) {
    if (next < 1) return;
    await postProposal("update_quantity", {
      line_key: line.line_key,
      quantity: next,
    });
  }

  async function removeSharedLine(line: WorkspaceDraftLine) {
    const title = line.commercial_snapshot?.product_title ?? line.line_key;
    if (!window.confirm(`Remove ${title} from the shared list?`)) return;
    await postProposal("remove_line", { line_key: line.line_key });
  }

  async function decideProposal(proposalId: string, accept: boolean) {
    if (!sharedView || draftBusy) return;
    setDraftBusy(true);
    setDraftError("");
    setDraftMessage("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "proposal-decision",
          proposalId,
          decision: accept ? "accept" : "reject",
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(failure.error ?? "The proposal could not be updated.");
      }
      setDraftMessage(accept ? "Proposal accepted." : "Proposal rejected.");
      await fetchDraftView(sharedView.draft.id);
    } catch (cause) {
      setDraftError((cause as Error).message);
    } finally {
      setDraftBusy(false);
    }
  }

  function proposalLabel(proposal: WorkspaceDraftProposal): string {
    if (proposal.kind === "update_quantity") {
      return `Change quantity to ${String(proposal.payload.quantity ?? "?")}`;
    }
    if (proposal.kind === "add_line") {
      const line = proposal.payload.line as Record<string, unknown> | undefined;
      const snapshot = line?.commercial_snapshot as Record<string, unknown> | undefined;
      return `Add ${String(snapshot?.product_title ?? line?.product_id ?? "product")}`;
    }
    if (proposal.kind === "remove_line") {
      const lineKey = String(proposal.payload.line_key ?? "");
      const line = sharedLines.find((candidate) => candidate.line_key === lineKey);
      return `Remove ${
        line?.commercial_snapshot?.product_title ?? lineKey ?? "line"
      }`;
    }
    return proposal.kind.replaceAll("_", " ");
  }

  async function openCartBuild() {
    if (!sharedView || !sharedRevision || !canBuildCart || cartBuildLoading) return;
    setCartBuildOpen(true);
    setCartBuildLoading(true);
    setCartBuildAck(false);
    setCartBuildMessage("");
    setCartBuildError("");
    setCartBuildLines([]);
    try {
      const channel = isBusinessWorkspace ? "b2b" : "b2c";
      const rows: CartBuildLine[] = [];
      for (const line of sharedRevision.lines) {
        const response = await fetch(
          `/api/chat?product=${encodeURIComponent(line.product_id)}&channel=${channel}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error("Current prices and stock could not be checked.");
        }
        const payload = (await response.json()) as { product?: ProductDetail };
        const product = payload.product;
        const offers = product?.offers ?? [];
        const snapshot = line.commercial_snapshot ?? {};
        const exact = offers.find((offer) => offer.id === line.offer_id);
        const offer = exact ?? offers[0] ?? null;
        const differences: string[] = [];
        let blocked = false;
        if (!offer) {
          differences.push("No current seller offer");
          blocked = true;
        } else {
          if (!exact) {
            differences.push(
              `Original offer unavailable — using ${offer.seller_name ?? "the current seller"}`,
            );
          }
          const previousUnit = snapshot.unit_amount_minor ?? 0;
          if (offer.unit_amount_minor !== previousUnit) {
            differences.push(
              `Price ${formatMoney(previousUnit, snapshot.currency_code ?? "INR")} → ${formatMoney(
                offer.unit_amount_minor,
                offer.currency_code,
              )}`,
            );
          }
          const previousSeller = snapshot.seller_name ?? "";
          const currentSeller = offer.seller_name ?? "";
          if (previousSeller && currentSeller && previousSeller !== currentSeller) {
            differences.push(`Seller ${previousSeller} → ${currentSeller}`);
          }
          if (
            (snapshot.currency_code ?? "").toUpperCase() !==
            (offer.currency_code ?? "").toUpperCase()
          ) {
            differences.push(
              `Currency ${snapshot.currency_code ?? ""} → ${offer.currency_code}`,
            );
          }
          if (offer.in_stock === false) {
            differences.push("Out of stock");
            blocked = true;
          } else if (
            typeof offer.inventory_quantity === "number" &&
            offer.inventory_quantity < line.quantity
          ) {
            differences.push(
              `Only ${offer.inventory_quantity} left (list needs ${line.quantity})`,
            );
            blocked = true;
          }
          const moq = product?.commercial?.moq ?? offer.b2b_moq ?? null;
          if (isBusinessWorkspace && moq && line.quantity < moq) {
            differences.push(`MOQ ${moq} (list has ${line.quantity})`);
            blocked = true;
          }
        }
        rows.push({
          line,
          offerId: offer?.id ?? line.offer_id,
          unitAmountMinor: offer?.unit_amount_minor ?? snapshot.unit_amount_minor ?? 0,
          currencyCode: (
            offer?.currency_code ??
            snapshot.currency_code ??
            "INR"
          ).toUpperCase(),
          sellerName: offer?.seller_name ?? snapshot.seller_name ?? "",
          sku: offer?.sku ?? snapshot.sku ?? "",
          productTitle: snapshot.product_title ?? product?.title ?? "Catalogue product",
          thumbnail: snapshot.thumbnail ?? product?.thumbnail ?? null,
          differences,
          blocked,
        });
      }
      setCartBuildLines(rows);
    } catch (cause) {
      setCartBuildError((cause as Error).message);
    } finally {
      setCartBuildLoading(false);
    }
  }

  function buildCart() {
    if (!cartBuildReady || !sharedView || !sharedRevision) return;
    const channel = isBusinessWorkspace ? "b2b" : "b2c";
    setCartBuildError("");
    setCartBuildMessage("");
    for (const row of cartBuildLines) {
      const result = addToCart(
        {
          offerId: row.offerId,
          productId: row.line.product_id,
          sku: row.sku,
          title: row.productTitle,
          seller: row.sellerName,
          priceMinor: row.unitAmountMinor,
          currency: row.currencyCode,
          image: row.thumbnail,
          channel,
        },
        row.line.quantity,
      );
      if (!result.ok) {
        announceCartConflict(result);
        setCartBuildError(
          result.currentChannel === "b2c"
            ? "Your cart already has retail items. Empty it before building this trade list."
            : "Your cart already has trade items. Empty it before building this retail list.",
        );
        return;
      }
    }
    try {
      const key = `${sharedView.draft.id}:${sharedRevision.id}`;
      const raw = window.localStorage.getItem(CART_BUILD_KEY);
      const previous = raw ? (JSON.parse(raw) as unknown) : [];
      const keys = Array.isArray(previous)
        ? previous.filter((value): value is string => typeof value === "string")
        : [];
      if (!keys.includes(key)) {
        window.localStorage.setItem(CART_BUILD_KEY, JSON.stringify([...keys, key]));
      }
    } catch {
      // Cart build history is only a convenience; the cart itself is already updated.
    }
    setCartBuildMessage(
      `${cartBuildLines.length} line${
        cartBuildLines.length === 1 ? "" : "s"
      } added to the cart. No order was created.`,
    );
  }

  return (
    <>
      <button
        type="button"
        className={open ? "chat-launcher open" : "chat-launcher"}
        aria-expanded={open}
        aria-controls="bazarbee-chat-panel"
        aria-label={
          unreadTotal > 0
            ? `Ask BazarBee, ${unreadTotal} unread ${unreadTotal === 1 ? "message" : "messages"}`
            : "Ask BazarBee"
        }
        onClick={() => setOpen((current) => !current)}
      >
        <SparkIcon />
        <span>Ask BazarBee</span>
        {unreadTotal > 0 ? (
          <span className="chat-launcher-badge" aria-hidden="true">
            {unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="chat-scrim"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
          />
          <aside
            id="bazarbee-chat-panel"
            className="chat-panel"
            aria-label="Ask BazarBee"
          >
            <header className="chat-head">
              <div className="chat-avatar" aria-hidden="true">
                <SparkIcon />
              </div>
              <div>
                <strong>Ask BazarBee</strong>
                <span>
                  {workspace?.name ?? "Workspace assistant"} ·{" "}
                  {workspace?.scope_type === "business_account"
                    ? "trade workspace"
                    : "household project"}
                </span>
              </div>
              <button
                type="button"
                className="chat-close"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>

            <div className="chat-view-tabs" role="tablist" aria-label="Chat view">
              <button
                type="button"
                role="tab"
                id="chat-view-chat"
                aria-controls="chat-view-panel"
                aria-selected={view === "chat"}
                tabIndex={view === "chat" ? 0 : -1}
                className={view === "chat" ? "chat-view-tab active" : "chat-view-tab"}
                onClick={() => setView("chat")}
              >
                Conversation
              </button>
              <button
                type="button"
                role="tab"
                id="chat-view-shared"
                aria-controls="chat-view-panel"
                aria-selected={view === "shared"}
                tabIndex={view === "shared" ? 0 : -1}
                className={view === "shared" ? "chat-view-tab active" : "chat-view-tab"}
                onClick={() => setView("shared")}
              >
                Shared list
              </button>
              <button
                type="button"
                role="tab"
                id="chat-view-participants"
                aria-controls="chat-view-panel"
                aria-selected={view === "participants"}
                tabIndex={view === "participants" ? 0 : -1}
                className={
                  view === "participants" ? "chat-view-tab active" : "chat-view-tab"
                }
                onClick={() => setView("participants")}
              >
                Participants
              </button>
            </div>

            {view === "chat" && channels.length > 1 ? (
              <div className="chat-tabs" role="tablist" aria-label="Conversation channel">
                {channels.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="tab"
                    id={`chat-channel-${candidate.id}`}
                    aria-controls="chat-channel-panel"
                    aria-selected={candidate.id === channel?.id}
                    tabIndex={candidate.id === channel?.id ? 0 : -1}
                    className={
                      candidate.id === channel?.id ? "chat-tab active" : "chat-tab"
                    }
                    onClick={() => void selectChannel(candidate)}
                    disabled={sending}
                  >
                    {channelLabel(candidate)}
                    {candidate.unread_count ? (
                      <span className="chat-tab-badge">{candidate.unread_count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              className="chat-body"
              ref={scrollRef}
              id="chat-view-panel"
              role="tabpanel"
              aria-labelledby={
                view === "chat"
                  ? "chat-view-chat"
                  : view === "shared"
                    ? "chat-view-shared"
                    : "chat-view-participants"
              }
            >
              {view === "shared" ? (
                <div className="chat-shared">
                  {authRequired ? (
                    <div className="chat-empty">
                      <h3>Sign in to view the shared list</h3>
                      <p>
                        Shared lists are private to the members of this workspace. Sign in to
                        continue.
                      </p>
                      <Link
                        className="button"
                        href={`/sign-in?next=${encodeURIComponent(pathname || "/")}`}
                      >
                        Sign in
                      </Link>
                    </div>
                  ) : shared.status === "loading" ? (
                    <div className="chat-empty">
                      <p>Loading the shared list…</p>
                    </div>
                  ) : shared.status === "error" ? (
                    <div className="chat-empty">
                      <h3>Shared list unavailable</h3>
                      <p>{shared.message}</p>
                      <button className="button" type="button" onClick={() => void loadShared()}>
                        Try again
                      </button>
                    </div>
                  ) : !sharedView ? (
                    <div className="chat-empty">
                      <h3>No shared list yet</h3>
                      <p>
                        Open a product and use Discuss to add it to the conversation. The owner
                        can turn shared products into a purchase list.
                      </p>
                      <button className="button" type="button" onClick={() => void loadShared()}>
                        Refresh
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="chat-shared-head">
                        <span className="eyebrow">Shared list</span>
                        <strong>{sharedView.draft.name}</strong>
                        <small>
                          {sharedView.draft.lifecycle_status} · v
                          {sharedView.draft.current_version} ·{" "}
                          {sharedView.draft.validation_status}
                        </small>
                      </div>
                      {draftOptions.length > 1 ? (
                        <label className="chat-draft-select">
                          <span>List</span>
                          <select
                            value={sharedView.draft.id}
                            disabled={draftBusy}
                            onChange={(event) => {
                              void fetchDraftView(event.target.value).catch((cause) => {
                                setDraftError((cause as Error).message);
                              });
                            }}
                          >
                            {draftOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {draftMessage ? (
                        <p className="admin-ok" role="status">
                          {draftMessage}
                        </p>
                      ) : null}
                      {draftError ? (
                        <p className="admin-error" role="alert">
                          {draftError}
                        </p>
                      ) : null}
                      {sharedLines.length === 0 ? (
                        <p className="muted">
                          No accepted lines yet. Pending proposals appear below.
                        </p>
                      ) : (
                        <div className="chat-shared-lines">
                          {sharedLines.map((line) => {
                            const snapshot = line.commercial_snapshot ?? {};
                            const unit = snapshot.unit_amount_minor ?? 0;
                            const title = snapshot.product_title ?? "Catalogue product";
                            return (
                              <div className="chat-shared-line" key={line.line_key}>
                                <div>
                                  <strong>{title}</strong>
                                  <small>
                                    {snapshot.sku ? `SKU ${snapshot.sku}` : line.line_key}
                                    {snapshot.seller_name ? ` · ${snapshot.seller_name}` : ""}
                                  </small>
                                </div>
                                <div className="chat-shared-line-side">
                                  <span>
                                    {line.quantity} ×{" "}
                                    {formatMoney(unit, snapshot.currency_code ?? "INR")}
                                  </span>
                                  <div className="chat-shared-line-controls">
                                    <button
                                      className="qty-button"
                                      type="button"
                                      aria-label={`Decrease ${title} quantity`}
                                      disabled={draftBusy || line.quantity <= 1}
                                      onClick={() => void proposeQuantity(line, line.quantity - 1)}
                                    >
                                      −
                                    </button>
                                    <button
                                      className="qty-button"
                                      type="button"
                                      aria-label={`Increase ${title} quantity`}
                                      disabled={draftBusy}
                                      onClick={() => void proposeQuantity(line, line.quantity + 1)}
                                    >
                                      +
                                    </button>
                                    <button
                                      className="text-button"
                                      type="button"
                                      disabled={draftBusy}
                                      aria-label={`Remove ${title} from the shared list`}
                                      onClick={() => void removeSharedLine(line)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="muted chat-draft-hint">
                        {canDecideProposal
                          ? "Changes to this list apply immediately."
                          : "Your changes become proposals for the owner."}
                      </p>
                      {sharedPending.length > 0 ? (
                        <div className="chat-shared-proposals">
                          <h3>Pending proposals</h3>
                          {sharedPending.map((proposal) => (
                            <div className="chat-shared-proposal" key={proposal.id}>
                              <div>
                                <span>{proposalLabel(proposal)}</span>
                                <small>
                                  Proposed by {proposal.proposed_by} · based on v
                                  {proposal.expected_version}
                                </small>
                              </div>
                              {canDecideProposal ? (
                                <div className="chat-shared-proposal-actions">
                                  <button
                                    className="text-button"
                                    type="button"
                                    disabled={draftBusy}
                                    onClick={() => void decideProposal(proposal.id, true)}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    className="text-button"
                                    type="button"
                                    disabled={draftBusy}
                                    onClick={() => void decideProposal(proposal.id, false)}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <small>Waiting for the owner</small>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {canBuildCart ? (
                        <div className="chat-cart-build">
                          {!approvalReady ? (
                            <p className="muted">
                              This trade list needs an approved revision before it can become a
                              cart.
                            </p>
                          ) : null}
                          <button
                            className="button"
                            type="button"
                            disabled={!sharedRevision || !approvalReady || draftBusy}
                            onClick={() => void openCartBuild()}
                          >
                            Review and build cart
                          </button>
                          {cartBuildOpen ? (
                            <div className="chat-cart-build-panel">
                              <div className="chat-cart-build-head">
                                <strong>Review before cart build</strong>
                                <small>
                                  Current price, stock, seller and MOQ are checked. This creates
                                  a cart only.
                                </small>
                              </div>
                              {cartBuildLoading ? (
                                <p className="muted">Checking current offers…</p>
                              ) : null}
                              {cartBuildLines.map((row) => (
                                <div
                                  className={
                                    row.blocked
                                      ? "chat-cart-build-line blocked"
                                      : "chat-cart-build-line"
                                  }
                                  key={row.line.line_key}
                                >
                                  <div>
                                    <strong>{row.productTitle}</strong>
                                    <small>
                                      {row.sku ? `SKU ${row.sku}` : row.line.line_key} ·{" "}
                                      {row.line.quantity} ×{" "}
                                      {formatMoney(row.unitAmountMinor, row.currencyCode)}
                                    </small>
                                  </div>
                                  {row.differences.length > 0 ? (
                                    <ul className="chat-cart-build-diff">
                                      {row.differences.map((difference) => (
                                        <li key={difference}>{difference}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <small className="chat-cart-build-ok">
                                      Matches the list
                                    </small>
                                  )}
                                </div>
                              ))}
                              {cartBuildHasBlocked ? (
                                <p className="admin-error" role="alert">
                                  A line is out of stock, short on stock or below MOQ. Update the
                                  list before building.
                                </p>
                              ) : null}
                              {cartBuildHasDifferences ? (
                                <label className="chat-cart-build-ack">
                                  <input
                                    type="checkbox"
                                    checked={cartBuildAck}
                                    onChange={(event) => setCartBuildAck(event.target.checked)}
                                  />
                                  <span>
                                    I understand the price, stock, seller or MOQ differences.
                                  </span>
                                </label>
                              ) : null}
                              {cartBuildError ? (
                                <p className="admin-error" role="alert">
                                  {cartBuildError}
                                </p>
                              ) : null}
                              {cartBuildMessage ? (
                                <p className="admin-ok" role="status">
                                  {cartBuildMessage}{" "}
                                  <Link href="/cart">View cart</Link>
                                </p>
                              ) : null}
                              <div className="chat-cart-build-actions">
                                <button
                                  className="button"
                                  type="button"
                                  disabled={!cartBuildReady || Boolean(cartBuildMessage)}
                                  onClick={buildCart}
                                >
                                  Add to cart
                                </button>
                                <button
                                  className="text-button"
                                  type="button"
                                  onClick={() => setCartBuildOpen(false)}
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <button className="text-button" type="button" onClick={() => void loadShared()}>
                        Refresh shared list
                      </button>
                    </>
                  )}
                </div>
              ) : view === "participants" ? (
                <div className="chat-participants">
                  {authRequired ? (
                    <div className="chat-empty">
                      <h3>Sign in to manage participants</h3>
                      <p>Workspace membership is private to the signed-in account.</p>
                      <Link
                        className="button"
                        href={`/sign-in?next=${encodeURIComponent(pathname || "/")}`}
                      >
                        Sign in
                      </Link>
                    </div>
                  ) : !canManageInvitations ? (
                    <div className="chat-empty">
                      <h3>Participants</h3>
                      <p>
                        Only the workspace owner, admin or buyer can view and manage
                        participants.
                      </p>
                    </div>
                  ) : participants.status === "loading" ? (
                    <div className="chat-empty">
                      <p>Loading participants…</p>
                    </div>
                  ) : participants.status === "error" ? (
                    <div className="chat-empty">
                      <h3>Participants unavailable</h3>
                      <p>{participants.message}</p>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void loadParticipants()}
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="chat-participants-head">
                        <span className="eyebrow">Participants</span>
                        <strong>
                          {participantsPage &&
                          participantsPage.participants > participantsPage.capacity
                            ? `${participantsPage.participants} participants · pilot workspace`
                            : `${participantsPage?.participants ?? 0} of ${
                                participantsPage?.capacity ?? 0
                              } seats used`}
                        </strong>
                      </div>
                      {canManageInvitations && !atCapacity ? (
                        <form className="chat-invite-form" onSubmit={inviteParticipant}>
                          <label className="sr-only" htmlFor="chat-invite-email">
                            Invite email
                          </label>
                          <input
                            id="chat-invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            placeholder="teammate@example.com"
                            autoComplete="email"
                            disabled={inviteBusy}
                          />
                          <button
                            className="button"
                            type="submit"
                            disabled={inviteBusy || inviteEmail.trim().length === 0}
                          >
                            {inviteBusy ? "Inviting…" : "Invite"}
                          </button>
                        </form>
                      ) : (
                        <p className="muted">
                          {atCapacity
                            ? "This workspace is at capacity. Revoke a pending invitation or ask the owner to add seats."
                            : "Only the workspace owner, admin or buyer can invite participants."}
                        </p>
                      )}
                      {inviteMessage ? (
                        <p className="admin-ok" role="status">
                          {inviteMessage}
                        </p>
                      ) : null}
                      {inviteError ? (
                        <p className="admin-error" role="alert">
                          {inviteError}
                        </p>
                      ) : null}
                      {createdInvite ? (
                        <div
                          className="chat-invite-token"
                          role="group"
                          aria-label="Invite code"
                        >
                          <span>Share this invite code</span>
                          <code>{createdInvite.invite_token}</code>
                        </div>
                      ) : null}
                      <div className="chat-invitation-list">
                        {participantsPage?.invitations.length ? (
                          participantsPage.invitations.map((invitation) => (
                            <div className="chat-invitation" key={invitation.id}>
                              <div>
                                <strong>{invitation.invitee_email}</strong>
                                <small>
                                  {invitation.status}
                                  {invitation.expires_at
                                    ? ` · expires ${new Date(invitation.expires_at).toLocaleDateString()}`
                                    : ""}
                                </small>
                              </div>
                              {canManageInvitations && invitation.status === "pending" ? (
                                <button
                                  className="text-button"
                                  type="button"
                                  disabled={inviteBusy}
                                  aria-label={`Revoke invitation for ${invitation.invitee_email}`}
                                  onClick={() => void revokeInvitation(invitation.id)}
                                >
                                  Revoke
                                </button>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="muted">No invitations yet.</p>
                        )}
                      </div>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => void loadParticipants()}
                      >
                        Refresh participants
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div
                    id="chat-channel-panel"
                    role="tabpanel"
                    aria-label={channel ? channelLabel(channel) : "Conversation"}
                  >
                  {authRequired ? (
                <div className="chat-empty">
                  <h3>Sign in to chat</h3>
                  <p>
                    BazarBee conversations are tied to your account, so your list and trade
                    workspace stay private.
                  </p>
                  <Link
                    className="button"
                    href={`/sign-in?next=${encodeURIComponent(pathname || "/")}`}
                  >
                    Sign in
                  </Link>
                </div>
              ) : state === "loading" || state === "idle" ? (
                <div className="chat-empty">
                  <p>Opening your conversation…</p>
                </div>
              ) : state === "error" ? (
                <div className="chat-empty">
                  <h3>Conversation unavailable</h3>
                  <p>{error}</p>
                  <button className="button" type="button" onClick={() => void load()}>
                    Try again
                  </button>
                </div>
              ) : messages.length === 0 ? (
                <div className="chat-empty">
                  <h3>
                    {channel?.kind === "assistant"
                      ? "How can I help?"
                      : `Start the ${channel ? channelLabel(channel).toLowerCase() : "conversation"}`}
                  </h3>
                  <p>
                    {channel?.kind === "assistant"
                      ? "I can summarise your shared list, explain the cart handoff and point a blocked question to a human. I cannot change the list, cart or an order."
                      : "Messages here are visible to the members of this workspace and persist server-side. The assistant stays in its own tab."}
                  </p>
                  {channel?.kind === "assistant" ? (
                    <div className="chat-suggestions">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="chat-suggestion"
                          onClick={() => void send(suggestion)}
                          disabled={sending}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                messages.map((message) => {
                  const assistant = isAssistantMessage(message);
                  const productReferences = (message.references ?? []).filter(
                    (reference) =>
                      reference.reference_type === "product" && reference.display_snapshot,
                  );
                  return (
                    <article
                      key={message.id}
                      className={assistant ? "chat-message assistant" : "chat-message user"}
                    >
                      <span className="chat-author">
                        {assistant ? "BazarBee assistant" : message.actor_name || "You"}
                      </span>
                      <p>{message.body}</p>
                      {productReferences.map((reference) => {
                        const snapshot = reference.display_snapshot!;
                        const meta = [
                          snapshot.sku ? `SKU ${snapshot.sku}` : null,
                          snapshot.seller_name ?? null,
                          typeof snapshot.quantity === "number" && snapshot.quantity > 0
                            ? `Qty ${snapshot.quantity}`
                            : null,
                          typeof snapshot.unit_price_minor === "number"
                            ? formatMoney(
                                snapshot.unit_price_minor,
                                snapshot.currency_code ?? "INR",
                              )
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        const href = snapshot.product_id
                          ? workspace?.scope_type === "business_account"
                            ? `/trade/pdp/${encodeURIComponent(snapshot.product_id)}`
                            : `/products/${encodeURIComponent(snapshot.product_id)}`
                          : null;
                        return (
                          <div
                            className="chat-product-reference"
                            key={`${reference.reference_type}:${reference.reference_id}`}
                          >
                            <strong>{snapshot.product_title ?? "Shared product"}</strong>
                            {meta ? <small>{meta}</small> : null}
                            {href ? <Link href={href}>View product</Link> : null}
                          </div>
                        );
                      })}
                    </article>
                  );
                })
              )}
              {sending ? (
                <div className="chat-typing" role="status">
                  <span />
                  <span />
                  <span />
                  BazarBee is reading your list…
                </div>
              ) : null}
              {error && state === "ready" ? (
                <p className="chat-error" role="alert">
                  {error}
                </p>
              ) : null}
                  </div>
                </>
              )}
            </div>

            {view === "chat" ? (
              <footer className="chat-composer">
              <p className="chat-disclaimer">
                Read-only in staging · your cart and orders are never changed from here.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Message BazarBee
                </label>
                <textarea
                  id="chat-message"
                  rows={2}
                  maxLength={4000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    authRequired ? "Sign in to send a message" : "Ask about your list or an order…"
                  }
                  disabled={authRequired || Boolean(channel === null)}
                />
                <button
                  className="button"
                  type="submit"
                  disabled={sending || authRequired || !channel || draft.trim().length === 0}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
              </footer>
            ) : null}
          </aside>
        </>
      ) : null}
    </>
  );
}
