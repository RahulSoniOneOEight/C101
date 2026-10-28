import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildKart",
  description: "BuildKart web storefront (bounded staging pilot)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            BuildKart
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <Link href="/">Catalogue</Link>
            <Link href="/orders">Orders</Link>
          </nav>
          <span className="env-badge">staging · simulated</span>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Bounded staging pilot · synthetic data · no production effect
        </footer>
      </body>
    </html>
  );
}
