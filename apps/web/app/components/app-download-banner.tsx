/**
 * Static, non-clickable app preview shown at the end of the B2C home page.
 *
 * The banner is intentionally link-free until the store listings exist. The phone screens are real
 * captures of the Flutter app so the preview matches the product rather than a generic mockup.
 */
export function AppDownloadBanner() {
  return (
    <section className="app-promo" aria-labelledby="app-promo-title">
      <div className="app-promo-copy">
        <span className="app-promo-eyebrow">BazarBee app</span>
        <h2 id="app-promo-title">Everything you need, in your pocket.</h2>
        <p>
          Track orders, chat with the team and reorder faster — from home or the site.
        </p>
        <div className="app-store-badges" aria-label="Android and iOS apps coming soon">
          <span className="app-store-badge">
            <small>Coming soon on</small>
            <strong>Google Play</strong>
          </span>
          <span className="app-store-badge">
            <small>Coming soon on</small>
            <strong>App Store</strong>
          </span>
        </div>
        <p className="app-promo-note">Launching soon on Android and iOS.</p>
      </div>

      <div className="app-promo-art" aria-hidden="true">
        <span className="app-promo-chip app-promo-chip-one">
          <span className="app-promo-dot" />
          Order packed
        </span>
        <span className="app-promo-chip app-promo-chip-two">
          <span className="app-promo-dot app-promo-dot-aqua" />
          Chat with the team
        </span>
        <div className="app-phone app-phone-back">
          <img
            src="/branding/app/bazarbee-app-browse.webp"
            alt=""
            width={390}
            height={815}
            loading="lazy"
          />
        </div>
        <div className="app-phone app-phone-front">
          <img
            src="/branding/app/bazarbee-app-home.webp"
            alt=""
            width={390}
            height={815}
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
