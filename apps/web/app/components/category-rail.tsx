"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface RailCategory {
  id: string;
  label: string;
  slug: string;
}

/**
 * CMS-driven desktop category rail. It mirrors the HomeRun pattern without replacing the
 * category tiles on the home page, and it is hidden on trade, auth, checkout and account pages
 * where a retail category strip would compete with the task at hand.
 */
export function CategoryRail({ categories }: { categories: RailCategory[] }) {
  const pathname = usePathname();
  if (categories.length === 0) return null;
  if (
    pathname.startsWith("/trade") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/returns") ||
    pathname.startsWith("/notifications")
  ) {
    return null;
  }

  return (
    <nav className="category-rail" aria-label="Shop categories">
      <div className="category-rail-inner">
        <Link className="category-rail-all" href="/search">
          All products
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            className="category-rail-link"
            href={`/search?cat=${encodeURIComponent(category.slug)}`}
          >
            {category.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
