import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
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
  title: "BazarBee",
  description: "BazarBee storefront · staging preview",
  icons: {
    icon: "/branding/bazarbee-icon-32.png",
    apple: "/branding/bazarbee-icon-192.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="BazarBee home">
            <Image
              src="/branding/bazarbee-logo-light.png"
              alt="BazarBee"
              width={132}
              height={48}
              priority
              className="brand-logo"
            />
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link href="/">Catalogue</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/returns">Returns</Link>
          </nav>
          <span className="env-badge">staging · simulated</span>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          BazarBee staging preview · synthetic data · no production effect
        </footer>
      </body>
    </html>
  );
}
