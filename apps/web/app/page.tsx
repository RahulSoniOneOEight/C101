import Image from "next/image";
import Link from "next/link";
import {
  formatMoney,
  getStorefrontAppShell,
  getStorefrontPresentation,
  listProducts,
  type ComposedProduct,
  type StorefrontBanner,
  type StorefrontPresentation,
} from "@/lib/experience-api";
import { CATEGORIES, productsInCategory } from "@/lib/catalogue";
import { GUIDED_PROMPTS, guidedSearchHref } from "@/lib/discovery";
import { getStorefrontLocale } from "@/lib/locale";
import {
  bannerBody,
  bannerCtaLabel,
  bannerHref,
  bannerTitle,
  categoryCount,
  categoryTone,
  firstBanner,
  imageObjectPosition,
  imageSources,
  sectionHref,
  sectionProducts,
  sortedBanners,
} from "@/lib/storefront";
import { CategoryIcon } from "./components/category-icon";
import { AddressSelector } from "./components/address-selector";
import { AppDownloadBanner } from "./components/app-download-banner";
import { DragScroll } from "./components/drag-scroll";
import { HeroCarousel } from "./components/hero-carousel";
import { ProductCard } from "./components/product-card";
import { RecentlyViewedRail } from "./components/recently-viewed-rail";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BazarBee · Everything you need, delivered",
};

function DefaultHero({ featured }: { featured: ComposedProduct | null }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-eyebrow">
          <span className="pulse-dot" aria-hidden="true" />
          For home and business buyers
        </span>
        <h1>
          Everything you need,
          <br />
          <span className="hero-accent">delivered to your site.</span>
        </h1>
        <p className="hero-lead">
          Shop building materials, paint, tools and everyday essentials at prices made for every
          buyer — with GST invoices and doorstep delivery.
        </p>
        <div className="hero-actions">
          <Link className="button button-lg" href="/search">
            Shop the catalogue
          </Link>
          <Link className="button button-ghost button-lg" href="/orders">
            Track an order
          </Link>
        </div>
        <ul className="hero-trust">
          <li>
            <strong>30+</strong> products in the staging catalogue
          </li>
          <li>
            <strong>GST</strong> invoices for business
          </li>
          <li>
            <strong>1–3 day</strong> delivery windows
          </li>
        </ul>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <Image
          src="/branding/bazarbee-logo-dark-transparent.png"
          alt=""
          width={300}
          height={281}
          priority
          className="hero-logo"
        />
        {featured?.best_price ? (
          <div className="hero-float hero-price">
            <span>Today&apos;s best price</span>
            <strong>
              {formatMoney(featured.best_price.unit_amount_minor, featured.best_price.currency_code)}
            </strong>
            <small>{featured.title}</small>
          </div>
        ) : null}
        <div className="hero-float hero-delivery">
          <span className="delivery-tick">✓</span>
          <div>
            <strong>Delivered to your doorstep</strong>
            <small>Home or project site</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function CampaignStrip({
  banner,
  locale,
}: {
  banner: StorefrontBanner;
  locale: "en-IN" | "hi-IN";
}) {
  const href = bannerHref(banner, "b2c");
  const title = bannerTitle(banner);
  const body = bannerBody(banner);
  const cta = bannerCtaLabel(banner);
  const image = imageSources(banner.image_mobile_uri ?? banner.image_uri, 1200);
  return (
    <section className="campaign-strip">
      {image.src ? <img src={image.src} srcSet={image.srcSet} sizes="240px" alt="" style={{ objectPosition: imageObjectPosition(banner) }} /> : null}
      <div>
        <span className="eyebrow">{locale === "hi-IN" ? "कैंपेन" : "Campaign"}</span>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
      </div>
      {href && cta ? (
        <Link className="button" href={href}>
          {cta}
        </Link>
      ) : null}
    </section>
  );
}

function DiscoveryEntry({
  categoryCountValue,
  brandCount,
  locale,
}: {
  categoryCountValue: number;
  brandCount: number;
  locale: "en-IN" | "hi-IN";
}) {
  const hindi = locale === "hi-IN";
  return (
    <section className="discovery-entry" aria-labelledby="discovery-entry-title">
      <div className="discovery-entry-head">
        <div>
          <span className="eyebrow">{hindi ? "खरीदारी शुरू करें" : "Start with the job"}</span>
          <h2 id="discovery-entry-title">
            {hindi ? "सही aisle खोजें" : "Find the right aisle"}
          </h2>
          <p className="muted">
            {hindi
              ? "काम, श्रेणी या ब्रांड से शुरू करें — हम आपको सही उत्पाद तक ले जाएंगे।"
              : "Start with a task, category or brand. We will point you at the right products."}
          </p>
        </div>
        <Link className="button button-ghost" href="/discover">
          {hindi ? "सब देखें" : "Explore all"} →
        </Link>
      </div>
      <div className="discovery-entry-actions">
        <Link className="discovery-chip" href="/search">
          <CategoryIcon label="All categories" iconKey="misc" size={18} />
          <span>
            <strong>{categoryCountValue}</strong> {hindi ? "श्रेणियाँ" : "categories"}
          </span>
        </Link>
        <Link className="discovery-chip" href="/discover#brands">
          <CategoryIcon label="Brands" iconKey="misc" size={18} />
          <span>
            <strong>{brandCount}</strong> {hindi ? "ब्रांड" : "brands"}
          </span>
        </Link>
      </div>
      <div className="discovery-prompts">
        {GUIDED_PROMPTS.map((prompt) => (
          <Link key={prompt.label} className="project-chip" href={guidedSearchHref(prompt)}>
            <span aria-hidden="true">✦</span>
            {prompt.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const locale = await getStorefrontLocale();
  let products: ComposedProduct[] = [];
  let presentation: StorefrontPresentation | null = null;
  let layoutSections: Awaited<ReturnType<typeof getStorefrontAppShell>>["layout"] | undefined;
  let loadError = "";

  const [productsResult, presentationResult, shellResult] = await Promise.allSettled([
    listProducts(60),
    getStorefrontPresentation("b2c", locale),
    getStorefrontAppShell("b2c", locale),
  ]);
  if (productsResult.status === "fulfilled") products = productsResult.value;
  if (presentationResult.status === "fulfilled") presentation = presentationResult.value;
  if (shellResult.status === "fulfilled") layoutSections = shellResult.value.layout;
  if (productsResult.status === "rejected") loadError = (productsResult.reason as Error).message;

  const featured = products.find((product) => product.best_price) ?? products[0] ?? null;
  const popular = products.filter((product) => product.best_price).slice(0, 12);
  const banners = presentation?.banners ?? [];
  const heroBanners = sortedBanners(banners, "b2c.home.hero");
  const campaign = firstBanner(banners, "b2c.home.campaign-strip");
  const cmsCategories = presentation?.categories ?? [];
  const counts = categoryCount(products, cmsCategories);
  const visibleCmsCategories = cmsCategories.filter(
    (category) => (counts.get(category.category_id) ?? 0) > 0,
  );
  const brandCount = new Set(
    products.map((product) => product.best_price?.seller_name).filter(Boolean),
  ).size;
  const productsById = new Map(products.map((product) => [product.id, product]));
  const sections = (layoutSections?.sections ?? [])
    .filter((section) => section.visible !== false)
    .map((section) => ({
      ...section,
      resolved: sectionProducts(section, productsById),
    }))
    .filter((section) => section.resolved.length > 0);
  const hasCmsSections = sections.length > 0;
  const hindi = locale === "hi-IN";
  const sectionCopy: Record<string, string> = {
    "Flash Deals": "फ्लैश डील्स",
    "FLASH DEALS": "फ्लैश डील्स",
    "Best Sellers": "बेस्ट सेलर्स",
    "Recommended for You": "आपके लिए सुझाए गए",
    "RECOMMENDED FOR YOU": "आपके लिए सुझाए गए",
    "Buy Again": "फिर से खरीदें",
    "Up to 60% OFF": "60% तक छूट",
    "See all deals": "सभी डील्स देखें",
  };
  const localizeSection = (value: string | undefined) =>
    hindi && value ? sectionCopy[value] ?? value : value;

  return (
    <>
      <div className="home-delivery-bar">
        <AddressSelector locale={locale} />
        <span className="home-delivery-promise">
          {hindi ? "घर या साइट तक डिलीवरी · GST इनवॉइस" : "Doorstep or site delivery · GST invoices"}
        </span>
      </div>

      {heroBanners.length > 0 ? (
        <HeroCarousel banners={heroBanners} channel="b2c" locale={locale} />
      ) : (
        <DefaultHero featured={featured} />
      )}

      {campaign ? <CampaignStrip banner={campaign} locale={locale} /> : null}

      {loadError ? (
        <div className="notice err" role="alert">
          The catalogue could not be loaded right now. {loadError}
        </div>
      ) : null}

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{hindi ? "रेंज देखें" : "Browse the range"}</span>
            <h2>{hindi ? "श्रेणी से खरीदें" : "Shop by category"}</h2>
          </div>
          <Link className="section-link" href="/search">
            {hindi ? "सब देखें" : "View everything"} →
          </Link>
        </div>
        {visibleCmsCategories.length > 0 ? (
          <DragScroll className="category-lane" ariaLabel="Shop by category">
            {visibleCmsCategories.map((category, index) => {
              const count = counts.get(category.category_id) ?? 0;
              const banner = imageSources(category.banner_image_uri, 800);
              return (
                <Link
                  className={`category-tile ${banner.src ? "has-media" : ""} ${categoryTone(index)}`}
                  key={category.category_id}
                  href={`/search?cat=${encodeURIComponent(category.slug)}`}
                >
                  {banner.src ? (
                    <span className="category-media">
                      <img
                        src={banner.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="category-icon">
                        <CategoryIcon
                          iconKey={category.icon_key}
                          label={category.label}
                        />
                      </span>
                    </span>
                  ) : (
                    <span className="category-icon">
                      <CategoryIcon
                        iconKey={category.icon_key}
                        label={category.label}
                      />
                    </span>
                  )}
                  <span className="category-name">{category.label}</span>
                  <span className="category-blurb">
                    {category.short_text ?? category.name}
                  </span>
                  <span className="category-count">
                    {count} {hindi ? "उत्पाद" : count === 1 ? "product" : "products"} →
                  </span>
                </Link>
              );
            })}
          </DragScroll>
        ) : (
          <DragScroll className="category-lane" ariaLabel="Shop by category">
            {CATEGORIES.map((category, index) => {
              const count = productsInCategory(products, category).length;
              return (
                <Link
                  className={`category-tile ${categoryTone(index)}`}
                  key={category.slug}
                  href={`/search?cat=${category.slug}`}
                >
                  <span className="category-icon">
                    <CategoryIcon label={category.name} iconKey={category.slug} />
                  </span>
                  <span className="category-name">{category.name}</span>
                  <span className="category-blurb">{category.blurb}</span>
                  <span className="category-count">
                    {count} {hindi ? "उत्पाद" : count === 1 ? "product" : "products"} →
                  </span>
                </Link>
              );
            })}
          </DragScroll>
        )}
      </section>

      <DiscoveryEntry
        categoryCountValue={visibleCmsCategories.length || CATEGORIES.length}
        brandCount={brandCount}
        locale={locale}
      />

      {hasCmsSections
        ? sections.map((section) => {
            const href = sectionHref(section, "b2c");
            return (
              <section className="section" key={section.placement}>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{localizeSection(section.label) ?? (hindi ? "मर्चेंडाइज़िंग" : "Merchandising")}</span>
                    <h2>
                      {localizeSection(section.title) ?? section.label ?? section.placement}{" "}
                      {section.badge ? <span className="section-badge">{localizeSection(section.badge)}</span> : null}
                    </h2>
                  </div>
                  {href && (section.see_all_label ?? "See all") ? (
                    <Link className="section-link" href={href}>
                      {localizeSection(section.see_all_label) ?? (hindi ? "सभी देखें" : "See all")} →
                    </Link>
                  ) : null}
                </div>
                <div className="product-grid">
                  {section.resolved.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            );
          })
        : (
          <section className="section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{hindi ? "अभी लोकप्रिय" : "Popular right now"}</span>
                <h2>{hindi ? "खरीदारों की पसंद" : "Buyer favourites"}</h2>
              </div>
              <Link className="section-link" href="/search">
                {hindi ? "सभी उत्पाद देखें" : "See all products"} →
              </Link>
            </div>
            {popular.length > 0 ? (
              <div className="product-grid">
                {popular.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="empty-panel">
                <h2>The catalogue is warming up</h2>
                <p className="muted">No products are available in this staging snapshot yet.</p>
              </div>
            )}
          </section>
        )}

      <RecentlyViewedRail locale={locale} />

      <section className="b2b-band">
        <div className="b2b-copy">
          <span className="eyebrow eyebrow-light">BazarBee Business</span>
          <h2>Business buying made easy</h2>
          <p>
            GST invoices, eligible credit and flexible payments — the same catalogue and the same
            prices, built for project sites and trade counters.
          </p>
          <div className="b2b-actions">
            <Link className="button button-honey" href="/sign-in?next=%2Forders">
              Sign in to your account
            </Link>
            <Link className="button button-ghost-light" href="/search">
              Browse the catalogue
            </Link>
          </div>
        </div>
        <div className="b2b-points">
          <div className="b2b-point">
            <span aria-hidden="true">▤</span>
            <strong>GST-ready invoices</strong>
            <p>Every order comes with a business-ready record.</p>
          </div>
          <div className="b2b-point">
            <span aria-hidden="true">◔</span>
            <strong>Eligible credit</strong>
            <p>Apply your terms at checkout when approved.</p>
          </div>
          <div className="b2b-point">
            <span aria-hidden="true">◈</span>
            <strong>Flexible payments</strong>
            <p>Prepaid today, more options as your account grows.</p>
          </div>
        </div>
      </section>

      <section className="service-strip" aria-label="Why shop with BazarBee">
        <div>
          <span aria-hidden="true">🚚</span>
          <strong>Doorstep delivery</strong>
          <p>Convenient delivery for home and project needs.</p>
        </div>
        <div>
          <span aria-hidden="true">₹</span>
          <strong>Better prices for every buyer</strong>
          <p>Retail deals and exclusive B2B trade pricing.</p>
        </div>
        <div>
          <span aria-hidden="true">↺</span>
          <strong>Simple returns</strong>
          <p>Owner-scoped tracking and returns in one place.</p>
        </div>
      </section>

      <AppDownloadBanner />
    </>
  );
}
