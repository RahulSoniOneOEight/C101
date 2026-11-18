"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type State =
  | { status: "working" }
  | { status: "error"; message: string };

export function MagicLinkHandler({ token, next }: { token: string; next?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "working" });
  const started = useRef(false);

  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";

  useEffect(() => {
    // A magic token is single-use: never fire the exchange twice in React strict mode.
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ status: "error", message: "This sign-in link is missing its token." });
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/auth/email/magic/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "This sign-in link is invalid or expired.");
        router.replace(destination);
        router.refresh();
      } catch (cause) {
        setState({ status: "error", message: (cause as Error).message });
      }
    })();
  }, [destination, router, token]);

  if (state.status === "error") {
    return (
      <div className="auth-card">
        <span className="auth-icon" aria-hidden="true">!</span>
        <h2>Link couldn&apos;t be used</h2>
        <p className="muted">{state.message}</p>
        <p className="notice err" role="alert">
          Magic links are single-use and expire after 15 minutes.
        </p>
        <Link className="button" href="/sign-in">
          Request a new sign-in link
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card auth-link-sent" aria-live="polite">
      <span className="auth-icon spinning" aria-hidden="true">✉</span>
      <h2>Signing you in…</h2>
      <p className="muted">Verifying your single-use link. This takes a moment.</p>
    </div>
  );
}
