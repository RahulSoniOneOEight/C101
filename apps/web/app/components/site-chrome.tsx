import Image from "next/image";
import Link from "next/link";
import { CartLink } from "./cart-link";
import { CategoryRail, type RailCategory } from "./category-rail";
import { ChannelSwitch } from "./channel-switch";
import { NotificationLink } from "./notification-link";
import { WishlistLink } from "./wishlist-link";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Storefront chrome shared by every page. The brand mark is deliberately larger than the earlier
 * pilot header (30% up: 56px → 74px) so BazarBee reads first on desktop and mobile.
 */
export function SiteHeader({
  signedIn,
  hasTrade,
  categories,
}: {
  signedIn: boolean;
  hasTrade: boolean;
  categories: RailCategory[];
}) {
  return (
    <>
      <div className="announcement-bar">
        <span>Delivery to your doorstep</span>
        <span aria-hidden="true">·</span>
        <span>GST invoices for business buyers</span>
        <span aria-hidden="true">·</span>
        <span className="staging-label">Staging preview</span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="BazarBee home">
            <Image
              src="/branding/bazarbee-logo-light.png"
              alt="BazarBee"
              width={204}
              height={74}
              priority
              className="brand-logo"
            />
          </Link>

          <form className="header-search" action="/search" role="search">
            <label className="sr-only" htmlFor="site-search">
              Search products
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              placeholder="Search cement, tools, paint…"
              autoComplete="off"
            />
            <button type="submit" aria-label="Search">
              <SearchIcon />
            </button>
          </form>

          <div className="header-actions">
            <ChannelSwitch signedIn={signedIn} hasTrade={hasTrade} />
            <NotificationLink signedIn={signedIn} />
            <WishlistLink />
            <Link
              className="header-action account-link"
              href={signedIn ? "/account" : "/sign-in"}
            >
              <UserIcon />
              <span>{signedIn ? "Account" : "Sign in"}</span>
            </Link>
            <CartLink />
          </div>
        </div>
      </header>
      <CategoryRail categories={categories} />
      <form className="mobile-search" action="/search" role="search">
        <label className="sr-only" htmlFor="site-search-mobile">
          Search products
        </label>
        <input
          id="site-search-mobile"
          name="q"
          type="search"
          placeholder="Search the catalogue…"
          autoComplete="off"
        />
        <button type="submit" aria-label="Search">
          <SearchIcon />
        </button>
      </form>
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        <Link className="tab-item" href="/">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
            <path
              d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>Shop</span>
        </Link>
        <Link className="tab-item" href="/search">
          <SearchIcon />
          <span>Search</span>
        </Link>
        <CartLink compact />
        <Link className="tab-item" href={signedIn ? "/account" : "/sign-in"}>
          <UserIcon />
          <span>Account</span>
        </Link>
      </nav>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Image
            src="/branding/bazarbee-logo-light.png"
            alt="BazarBee"
            width={150}
            height={54}
          />
          <p>Everything you need, delivered to your site.</p>
        </div>
        <div className="footer-col">
          <h4>Shop</h4>
          <Link href="/">All products</Link>
          <Link href="/search?cat=building">Building materials</Link>
          <Link href="/search?cat=tools">Tools &amp; hardware</Link>
          <Link href="/search?cat=paint">Paint &amp; finishes</Link>
        </div>
        <div className="footer-col">
          <h4>Account</h4>
          <Link href="/account">Account</Link>
          <Link href="/orders">Orders &amp; tracking</Link>
          <Link href="/returns">Returns</Link>
          <Link href="/wishlist">Wishlist</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/sign-in">Sign in</Link>
        </div>
        <div className="footer-col">
          <h4>BazarBee</h4>
          <Link href="/trade">BazarBee Trade</Link>
          <Link href="/search">Search</Link>
          <span>Staging preview</span>
          <span>Synthetic data</span>
          <span>No production effect</span>
        </div>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} BazarBee</span>
        <span>Prices include GST where shown · Simulated payments</span>
      </div>
    </footer>
  );
}
