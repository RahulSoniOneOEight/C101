"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StorefrontLocale } from "@/lib/locale-shared";

export function ChannelSwitch({
  signedIn,
  hasTrade,
  locale = "en-IN",
}: {
  signedIn: boolean;
  hasTrade: boolean;
  locale?: StorefrontLocale;
}) {
  const pathname = usePathname();
  if (!signedIn) return null;
  const inTrade = pathname?.startsWith("/trade") ?? false;

  return (
    <nav className="channel-switch" aria-label="Shopping channel">
      <Link
        href="/"
        className={inTrade ? "channel-option" : "channel-option active"}
        aria-current={inTrade ? undefined : "page"}
      >
        {locale === "hi-IN" ? "शॉप" : "Shop"}
      </Link>
      <Link
        href="/trade"
        className={inTrade ? "channel-option active" : "channel-option"}
        aria-current={inTrade ? "page" : undefined}
        title={hasTrade ? undefined : "Trade access requires a trade-enabled account"}
      >
        {locale === "hi-IN" ? "ट्रेड" : "Trade"}
      </Link>
    </nav>
  );
}
