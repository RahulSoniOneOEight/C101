"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="text-button"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.assign("/sign-in");
        }
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
