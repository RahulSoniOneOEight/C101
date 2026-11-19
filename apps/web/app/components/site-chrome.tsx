import Image from "next/image";
import Link from "next/link";
import type { StorefrontLocale } from "@/lib/locale-shared";
import { AddressSelector } from "./address-selector";
import { CartLink } from "./cart-link";
import { CategoryRail, type RailCategory } from "./category-rail";
import { ChannelSwitch } from "./channel-switch";
import { LocaleSwitch } from "./locale-switch";
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
  locale,
}: {
  signedIn: boolean;
  hasTrade: boolean;
  categories: RailCategory[];
  locale: StorefrontLocale;
}) {
  const hindi = locale === "hi-IN";
  const searchPlaceholder = hindi
    ? "सीमेंट, औज़ार, पेंट खोजें…"
    : "Search cement, tools, paint…";
  const accountLabel = signedIn ? (hindi ? "अकाउंट" : "Account") : (hindi ? "साइन इन" : "Sign in");
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
              placeholder={searchPlaceholder}
              autoComplete="off"
            />
            <button type="submit" aria-label={hindi ? "खोजें" : "Search"}>
              <SearchIcon />
            </button>
          </form>

          <div className="header-actions">
            <LocaleSwitch locale={locale} />
            <ChannelSwitch signedIn={signedIn} hasTrade={hasTrade} locale={locale} />
            <NotificationLink signedIn={signedIn} locale={locale} />
            <WishlistLink locale={locale} />
            <Link
              className="header-action account-link"
              href={signedIn ? "/account" : "/sign-in"}
            >
              <UserIcon />
              <span>{accountLabel}</span>
            </Link>
            <AddressSelector locale={locale} />
            <CartLink locale={locale} />
          </div>
        </div>
      </header>
      <CategoryRail categories={categories} locale={locale} />
      <form className="mobile-search" action="/search" role="search">
        <label className="sr-only" htmlFor="site-search-mobile">
          Search products
        </label>
        <input
          id="site-search-mobile"
          name="q"
          type="search"
          placeholder={hindi ? "कैटलॉग में खोजें…" : "Search the catalogue…"}
          autoComplete="off"
        />
        <button type="submit" aria-label={hindi ? "खोजें" : "Search"}>
          <SearchIcon />
        </button>
      </form>
      <nav className="mobile-tabbar" aria-label={hindi ? "मोबाइल नेविगेशन" : "Mobile navigation"}>
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
          <span>{hindi ? "शॉप" : "Shop"}</span>
        </Link>
        <Link className="tab-item" href="/search">
          <SearchIcon />
          <span>{hindi ? "खोजें" : "Search"}</span>
        </Link>
        <CartLink compact locale={locale} />
        <Link className="tab-item" href={signedIn ? "/account" : "/sign-in"}>
          <UserIcon />
          <span>{hindi ? "अकाउंट" : "Account"}</span>
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
          <Link href="/discover">Discover aisles</Link>
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
        <div className="footer-col footer-policies">
          <h4>Policies</h4>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/refunds">Refunds &amp; cancellations</Link>
          <Link href="/shipping">Shipping &amp; delivery</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact &amp; grievance</Link>
          <Link href="/about">About us</Link>
          <Link className="footer-all-policies" href="/policies">
            All policies
          </Link>
        </div>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} BazarBee</span>
        <span>Prices include GST where shown · Simulated payments</span>
      </div>
    </footer>
  );
}
