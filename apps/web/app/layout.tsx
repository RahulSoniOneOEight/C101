import type { Metadata } from "next";
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
          <a href="/" className="brand">
            BuildKart
          </a>
          <span className="env-badge">staging · simulated payment</span>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Bounded staging pilot · synthetic data · no production effect
        </footer>
      </body>
    </html>
  );
}
