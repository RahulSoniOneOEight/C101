"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StorefrontLocale } from "@/lib/locale-shared";
import { STOREFRONT_LOCALE_COOKIE } from "@/lib/locale-shared";

export function LocaleSwitch({ locale }: { locale: StorefrontLocale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next: StorefrontLocale = locale === "hi-IN" ? "en-IN" : "hi-IN";

  const change = () => {
    document.cookie = `${STOREFRONT_LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setBusy(true);
    router.refresh();
    window.setTimeout(() => setBusy(false), 900);
  };

  return (
    <button
      type="button"
      className="locale-switch"
      onClick={change}
      disabled={busy}
      aria-label={next === "hi-IN" ? "हिंदी में देखें" : "View in English"}
      title={next === "hi-IN" ? "हिंदी में देखें" : "View in English"}
    >
      {next === "hi-IN" ? "हिं" : "EN"}
    </button>
  );
}
