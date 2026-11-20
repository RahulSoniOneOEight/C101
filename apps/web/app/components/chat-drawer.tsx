"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkspaceChannel,
  WorkspaceDraftView,
  WorkspaceMessage,
  WorkspaceSummary,
} from "@/lib/experience-api";
import { formatMoney } from "@/lib/money";

type LoadState = "idle" | "loading" | "ready" | "error";
type ChatView = "chat" | "shared";
type SharedState =
  | { status: "idle" | "loading" }
  | { status: "ready"; view: WorkspaceDraftView | null }
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
 * an assistant channel, and every message is persisted server-side. The assistant is read-only;
 * this drawer never changes the cart, list or an order.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const isTrade = pathname?.startsWith("/trade") ?? false;

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
      await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark-read", channelId, sequence }),
      });
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
    const response = await fetch(`/api/chat?channel=${encodeURIComponent(nextChannel.id)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("The conversation could not be loaded.");
    const data = (await response.json()) as { messages?: WorkspaceMessage[] };
    const latest = data.messages ?? [];
    setMessages(latest);
    const last = latest[latest.length - 1];
    if (last) void markChannelRead(nextChannel.id, last.sequence);
  }, [markChannelRead]);

  const loadShared = useCallback(async () => {
    if (!workspace) return;
    setShared({ status: "loading" });
    try {
      const draftsResponse = await fetch(
        `/api/chat?drafts=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      );
      if (!draftsResponse.ok) throw new Error("The shared list could not be loaded.");
      const draftsPayload = (await draftsResponse.json()) as {
        drafts?: { id: string }[];
      };
      const first = draftsPayload.drafts?.[0];
      if (!first) {
        setShared({ status: "ready", view: null });
        return;
      }
      const detailResponse = await fetch(
        `/api/chat?draft=${encodeURIComponent(first.id)}`,
        { cache: "no-store" },
      );
      if (!detailResponse.ok) throw new Error("The shared list could not be loaded.");
      const detail = (await detailResponse.json()) as { draft?: WorkspaceDraftView };
      setShared({ status: "ready", view: detail.draft ?? null });
    } catch (cause) {
      setShared({ status: "error", message: (cause as Error).message });
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

  return (
    <>
      <button
        type="button"
        className={open ? "chat-launcher open" : "chat-launcher"}
        aria-expanded={open}
        aria-controls="bazarbee-chat-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <SparkIcon />
        <span>Ask BazarBee</span>
        {unreadTotal > 0 ? (
          <span className="chat-launcher-badge" aria-label={`${unreadTotal} unread messages`}>
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
            aria-live="polite"
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
                aria-selected={view === "chat"}
                className={view === "chat" ? "chat-view-tab active" : "chat-view-tab"}
                onClick={() => setView("chat")}
              >
                Conversation
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "shared"}
                className={view === "shared" ? "chat-view-tab active" : "chat-view-tab"}
                onClick={() => setView("shared")}
              >
                Shared list
              </button>
            </div>

            {view === "chat" && channels.length > 1 ? (
              <div className="chat-tabs" role="tablist" aria-label="Conversation channel">
                {channels.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="tab"
                    aria-selected={candidate.id === channel?.id}
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

            <div className="chat-body" ref={scrollRef}>
              {view === "shared" ? (
                <div className="chat-shared">
                  {shared.status === "loading" ? (
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
                      {sharedLines.length === 0 ? (
                        <p className="muted">
                          No accepted lines yet. Pending proposals appear below.
                        </p>
                      ) : (
                        <div className="chat-shared-lines">
                          {sharedLines.map((line) => {
                            const snapshot = line.commercial_snapshot ?? {};
                            const unit = snapshot.unit_amount_minor ?? 0;
                            return (
                              <div className="chat-shared-line" key={line.line_key}>
                                <div>
                                  <strong>{snapshot.product_title ?? "Catalogue product"}</strong>
                                  <small>
                                    {snapshot.sku ? `SKU ${snapshot.sku}` : line.line_key}
                                    {snapshot.seller_name ? ` · ${snapshot.seller_name}` : ""}
                                  </small>
                                </div>
                                <span>
                                  {line.quantity} ×{" "}
                                  {formatMoney(unit, snapshot.currency_code ?? "INR")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {sharedPending.length > 0 ? (
                        <div className="chat-shared-proposals">
                          <h3>Pending proposals</h3>
                          {sharedPending.map((proposal) => (
                            <div className="chat-shared-proposal" key={proposal.id}>
                              <span>{proposal.kind.replaceAll("_", " ")}</span>
                              <small>{proposal.proposed_by}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <button className="text-button" type="button" onClick={() => void loadShared()}>
                        Refresh shared list
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
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
