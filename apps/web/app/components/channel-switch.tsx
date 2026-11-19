"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ChannelSwitch({
  signedIn,
  hasTrade,
}: {
  signedIn: boolean;
  hasTrade: boolean;
}) {
  const pathname = usePathname();
  if (!signedIn || !hasTrade) return null;
  const inTrade = pathname?.startsWith("/trade") ?? false;

  return (
    <nav className="channel-switch" aria-label="Shopping channel">
      <Link
        href="/"
        className={inTrade ? "channel-option" : "channel-option active"}
        aria-current={inTrade ? undefined : "page"}
      >
        Shop
      </Link>
      <Link
        href="/trade"
        className={inTrade ? "channel-option active" : "channel-option"}
        aria-current={inTrade ? "page" : undefined}
      >
        Trade
      </Link>
    </nav>
  );
}
