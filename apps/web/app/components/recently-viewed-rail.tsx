"use client";

import { useEffect, useState } from "react";
import type { ComposedProduct } from "@/lib/experience-api";
import { readRecentlyViewed, recentlyViewedEventName } from "@/lib/recently-viewed";
import { ProductCard } from "./product-card";

/**
 * Customer-local "Recently viewed" merchandising rail. It renders nothing until the browser has
 * history, so an empty history never becomes a fake recommended section.
 */
export function RecentlyViewedRail({
  locale = "en-IN",
  excludeId,
  limit = 4,
  title,
}: {
  locale?: "en-IN" | "hi-IN";
  excludeId?: string;
  limit?: number;
  title?: string;
}) {
  const [products, setProducts] = useState<ComposedProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = readRecentlyViewed()
        .filter((id) => id !== excludeId)
        .slice(0, Math.max(limit, 1) * 3);
      if (ids.length === 0) {
        if (!cancelled) setProducts([]);
        return;
      }
      try {
        const response = await fetch(`/api/products?ids=${encodeURIComponent(ids.join(","))}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { products?: ComposedProduct[] };
        if (!cancelled) setProducts((data.products ?? []).slice(0, limit));
      } catch {
        // The rail is progressive enhancement; a failed fetch leaves it hidden.
      }
    };
    void load();
    const event = recentlyViewedEventName();
    window.addEventListener(event, load);
    window.addEventListener("storage", load);
    return () => {
      cancelled = true;
      window.removeEventListener(event, load);
      window.removeEventListener("storage", load);
    };
  }, [excludeId, limit]);

  if (products.length === 0) return null;
  const hindi = locale === "hi-IN";

  return (
    <section className="section recently-viewed" aria-labelledby="recently-viewed-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{hindi ? "आपकी गतिविधि" : "Pick up where you left off"}</span>
          <h2 id="recently-viewed-title">{title ?? (hindi ? "हाल में देखे गए" : "Recently viewed")}</h2>
        </div>
        <span className="section-note">
          {hindi ? "आपके ब्राउज़र में सहेजा गया" : "Saved in this browser"}
        </span>
      </div>
      <div className="recently-rail">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
