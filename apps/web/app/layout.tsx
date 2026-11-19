import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
  PILOT_SESSION_COOKIE,
  getMyContexts,
  getStorefrontPresentation,
  hasTradeRole,
} from "@/lib/experience-api";
import { getStorefrontLocale } from "@/lib/locale";
import { ChatDrawer } from "./components/chat-drawer";
import { SiteFooter, SiteHeader } from "./components/site-chrome";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-var.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const outfit = localFont({
  src: "./fonts/outfit-var.woff2",
  variable: "--font-outfit",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "BazarBee · Everything you need, delivered",
    template: "%s · BazarBee",
  },
  description:
    "BazarBee is the storefront for home and business buyers — building materials, paint, tools and more, delivered to your doorstep.",
  icons: {
    icon: "/branding/bazarbee-icon-32.png",
    apple: "/branding/bazarbee-icon-192.png",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  const locale = await getStorefrontLocale();
  const signedIn = Boolean(token);
  let hasTrade = false;
  if (token) {
    try {
      hasTrade = hasTradeRole(await getMyContexts(token));
    } catch {
      // The header stays usable if the role projection is temporarily unavailable.
    }
  }
  let categories: Array<{ id: string; label: string; slug: string }> = [];
  try {
    const presentation = await getStorefrontPresentation("b2c", locale);
    categories = presentation.categories.map((category) => ({
      id: category.category_id,
      label: category.label,
      slug: category.slug,
      iconKey: category.icon_key,
    }));
  } catch {
    // The rail is optional; the rest of the storefront still renders without it.
  }
  return (
    <html lang={locale} className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader signedIn={signedIn} hasTrade={hasTrade} categories={categories} locale={locale} />
        <main className="container" id="main">
          {children}
        </main>
        <ChatDrawer signedIn={signedIn} />
        <SiteFooter />
      </body>
    </html>
  );
}
