"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StorefrontLocale } from "@/lib/locale-shared";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21">
      <path
        d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NotificationLink({
  signedIn,
  locale = "en-IN",
}: {
  signedIn: boolean;
  locale?: StorefrontLocale;
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/notifications?limit=50", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { unread?: number };
        if (!cancelled) setUnread(data.unread ?? 0);
      } catch {
        // The bell is progressive enhancement; a failed count must not break the header.
      }
    };
    void load();
    const onChange = () => void load();
    window.addEventListener("bazarbee-notifications-change", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("bazarbee-notifications-change", onChange);
    };
  }, [signedIn]);

  if (!signedIn) return null;

  return (
    <Link className="header-action notification-link" href="/notifications">
      <span className="cart-icon-wrap">
        <BellIcon />
        {unread > 0 ? (
          <span className="cart-count" aria-label={`${unread} unread notifications`}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </span>
      <span>{locale === "hi-IN" ? "अलर्ट" : "Alerts"}</span>
    </Link>
  );
}
