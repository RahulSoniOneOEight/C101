"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "bazarbee.appBanner.dismissedAt.v1";
const DISMISS_DAYS = 7;

export function AppDownloadBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const dismissedAt = raw ? Number(raw) : 0;
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
        return;
      }
    } catch {
      // Private browsing: still show the banner.
    }

    const onScroll = () => {
      if (window.scrollY > 420) setVisible(true);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <aside className="app-download-banner" aria-label="Get the BazarBee app" data-testid="app-download-banner">
      <img src="/branding/bazarbee-app-icon.png" alt="" width={46} height={46} />
      <div className="app-download-copy">
        <strong>Take BazarBee with you</strong>
        <span>Track orders, chat and reorder faster in the app.</span>
      </div>
      <a
        className="button button-honey app-download-cta"
        href="https://app-staging.pinakaplay.cloud"
        target="_blank"
        rel="noreferrer"
      >
        Open app
      </a>
      <button
        type="button"
        className="app-download-close"
        aria-label="Dismiss app banner"
        onClick={() => {
          setVisible(false);
          try {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            // Dismissal is best-effort; the banner is already hidden for this session.
          }
        }}
      >
        ✕
      </button>
    </aside>
  );
}
