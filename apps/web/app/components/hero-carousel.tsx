"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StorefrontBanner } from "@/lib/experience-api";
import {
  bannerBody,
  bannerCtaLabel,
  bannerHref,
  bannerTitle,
  imageObjectPosition,
  imageSources,
} from "@/lib/storefront";

export function HeroCarousel({
  banners,
  channel,
  locale = "en-IN",
}: {
  banners: StorefrontBanner[];
  channel: "b2c" | "b2b";
  locale?: "en-IN" | "hi-IN";
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % banners.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [banners.length, paused]);

  if (banners.length === 0) return null;
  const banner = banners[Math.min(index, banners.length - 1)];
  const desktop = imageSources(banner.image_desktop_uri ?? banner.image_uri, 1600);
  const tablet = imageSources(banner.image_tablet_uri ?? banner.image_desktop_uri ?? banner.image_uri, 1200);
  const mobile = imageSources(banner.image_mobile_uri ?? banner.image_desktop_uri ?? banner.image_uri, 900);
  const href = bannerHref(banner, channel);
  const title = bannerTitle(banner);
  const body = bannerBody(banner);
  const cta = bannerCtaLabel(banner);

  return (
    <section
      className="cms-hero"
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {desktop.src ? (
        <picture>
          <source media="(max-width: 720px)" srcSet={mobile.srcSet ?? mobile.src} />
          <source media="(max-width: 1024px)" srcSet={tablet.srcSet ?? tablet.src} />
          <img
            className="cms-hero-media"
            src={desktop.src}
            srcSet={desktop.srcSet}
            sizes="(max-width: 720px) 100vw, 1200px"
            alt={banner.image_alt ?? ""}
            style={{ objectPosition: imageObjectPosition(banner) }}
            fetchPriority="high"
          />
        </picture>
      ) : null}
      <div className="cms-hero-overlay" aria-hidden="true" />
      <div className="cms-hero-copy">
        <span className="hero-eyebrow">
          <span className="pulse-dot" aria-hidden="true" />
          {locale === "hi-IN" ? "बाज़ारबी कैंपेन" : "BazarBee campaign"}
        </span>
        <h1>{title}</h1>
        {body ? <p>{body}</p> : null}
        {href && cta ? (
          <Link className="button button-honey button-lg" href={href}>
            {cta}
          </Link>
        ) : null}
      </div>
      {banners.length > 1 ? (
        <div className="cms-hero-dots" role="tablist" aria-label="Choose campaign">
          {banners.map((candidate, candidateIndex) => (
            <button
              key={candidate.content_key}
              type="button"
              role="tab"
              aria-selected={candidateIndex === index}
              aria-label={`Show ${candidate.title}`}
              className={candidateIndex === index ? "cms-hero-dot active" : "cms-hero-dot"}
              onClick={() => setIndex(candidateIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
