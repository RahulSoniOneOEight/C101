"use client";

import { useState } from "react";

/**
 * Remote catalogue images come from the staging object store. A missing or blocked image falls
 * back to the BazarBee mark instead of leaving a broken slot in the grid.
 */
export function ProductImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={className ? `${className} product-image-fallback` : "product-image-fallback"}>
        <img src="/branding/bazarbee-app-icon.png" alt="" aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
