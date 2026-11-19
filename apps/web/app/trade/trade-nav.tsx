import Link from "next/link";
import { TradeQuoteLink } from "./quote-link";

export function TradeNav({ active }: { active: "overview" | "catalogue" | "credit" | "quote" | "quick-order" }) {
  const links = [
    { key: "overview", href: "/trade", label: "Overview" },
    { key: "catalogue", href: "/trade/catalogue", label: "Catalogue" },
    { key: "quick-order", href: "/trade/quick-order", label: "Quick order" },
    { key: "credit", href: "/trade/credit", label: "Credit" },
    { key: "quote", href: "/trade/quote", label: "Quote / RFQ" },
  ] as const;

  return (
    <div className="trade-nav">
      <span className="trade-brand">BazarBee Trade</span>
      <nav aria-label="Trade workspace">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={active === link.key ? "trade-nav-link active" : "trade-nav-link"}
            aria-current={active === link.key ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <TradeQuoteLink />
      <Link className="trade-switch" href="/">
        Switch to consumer
      </Link>
    </div>
  );
}
