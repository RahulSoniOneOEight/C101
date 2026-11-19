"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkspaceChannel,
  WorkspaceMessage,
  WorkspaceSummary,
} from "@/lib/experience-api";

type LoadState = "idle" | "loading" | "ready" | "error";

const SUGGESTIONS = [
  "What can you do?",
  "Summarise my shared list",
  "How do I move this list into a cart?",
];

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

  const loadMessages = useCallback(async (nextChannel: WorkspaceChannel) => {
    const response = await fetch(`/api/chat?channel=${encodeURIComponent(nextChannel.id)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("The conversation could not be loaded.");
    const data = (await response.json()) as { messages?: WorkspaceMessage[] };
    setMessages(data.messages ?? []);
  }, []);

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
      setChannel(assistant);
      await loadMessages(assistant);
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
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, state]);

  const selectChannel = async (next: WorkspaceChannel) => {
    if (sending || next.id === channel?.id) return;
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

  const send = async (text: string) => {
    if (!channel || sending) return;    const value = text.trim();
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
      if (latest.length > 0) setMessages(latest);
    } catch (cause) {
      setError((cause as Error).message);
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

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
                  {isTrade ? "trade workspace" : "household project"}
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

            {channels.length > 1 ? (
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
                  </button>
                ))}
              </div>
            ) : null}

            <div className="chat-body" ref={scrollRef}>
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
                  return (
                    <article
                      key={message.id}
                      className={assistant ? "chat-message assistant" : "chat-message user"}
                    >
                      <span className="chat-author">
                        {assistant ? "BazarBee assistant" : message.actor_name || "You"}
                      </span>
                      <p>{message.body}</p>
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
          </aside>
        </>
      ) : null}
    </>
  );
}
