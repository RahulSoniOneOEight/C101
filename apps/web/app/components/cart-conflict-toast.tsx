"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface ConflictDetail {
  currentChannel: "b2c" | "b2b";
  nextChannel: "b2c" | "b2b";
}

function channelLabel(channel: "b2c" | "b2b"): string {
  return channel === "b2b" ? "Trade" : "Shop";
}

/**
 * A cart belongs to one sales channel. When a Shop add is attempted on a Trade basket (or the
 * reverse), the add is rejected and this toast explains how to recover without clearing silently.
 */
export function CartConflictToast() {
  const [conflict, setConflict] = useState<ConflictDetail | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent<ConflictDetail>).detail;
      if (!detail) return;
      setConflict(detail);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setConflict(null), 9000);
    };
    window.addEventListener("bazarbee:cart-conflict", onConflict);
    return () => {
      window.removeEventListener("bazarbee:cart-conflict", onConflict);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!conflict) return null;

  return (
    <div className="cart-conflict-toast" role="alert">
      <div>
        <strong>Your cart is in {channelLabel(conflict.currentChannel)}.</strong>
        <p>
          Remove those items before adding a {channelLabel(conflict.nextChannel)} item. Your cart
          was not changed.
        </p>
      </div>
      <div className="cart-conflict-actions">
        <Link className="button" href="/cart">
          Review cart
        </Link>
        <button className="text-button" type="button" onClick={() => setConflict(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
