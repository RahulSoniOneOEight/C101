"use client";

import { useState } from "react";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  if (disabled) return null;

  return (
    <button
      className="button button-ghost"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/notifications", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          });
          // Reload so the server layout and the header badge both re-read the inbox.
          window.location.reload();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Marking…" : "Mark all read"}
    </button>
  );
}
