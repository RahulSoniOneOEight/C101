import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PILOT_SESSION_COOKIE } from "@/lib/experience-api";
import { SiteFooter, SiteHeader } from "./components/site-chrome";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
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
  const signedIn = Boolean((await cookies()).get(PILOT_SESSION_COOKIE)?.value);
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader signedIn={signedIn} />
        <main className="container" id="main">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
