import type { ReactNode } from "react";

/**
 * Inline category icon set for the storefront. The CMS `icon_key` can lag a category relabel, so
 * the customer-visible label is checked first and the key is the fallback. Icons are stroked in
 * `currentColor`, which lets the same component sit on a light tile, a dark rail or a photo.
 */
type IconName =
  | "electrical"
  | "plumbing"
  | "paints"
  | "agriculture"
  | "pumps"
  | "construction"
  | "tiles"
  | "tools"
  | "automotive"
  | "misc";

const ICONS: Record<IconName, ReactNode> = {
  electrical: (
    <>
      <path d="M13 2 5.5 13H11l-1 9 8-12h-5.5Z" />
    </>
  ),
  plumbing: (
    <>
      <path d="M12 3c3.2 4.1 5.2 6.9 5.2 9.4A5.2 5.2 0 0 1 12 17.6a5.2 5.2 0 0 1-5.2-5.2C6.8 9.9 8.8 7.1 12 3Z" />
      <path d="M4 19h16" />
    </>
  ),
  paints: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5V9a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3Z" />
      <path d="M17 7h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2" />
      <path d="M11 11v4a2 2 0 0 1-2 2H8a2 2 0 0 0-2 2v1" />
    </>
  ),
  agriculture: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-4 2.8-7 7-7 0 4.3-2.8 7-7 7Z" />
      <path d="M12 17c0-3.3-2.3-5.8-6-5.8 0 3.6 2.3 5.8 6 5.8Z" />
    </>
  ),
  pumps: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
  construction: (
    <>
      <path d="M3 10h8v5H3zM13 10h8v5h-8zM7 16h8v5H7z" />
      <path d="M11 10V6h8v4" />
    </>
  ),
  tiles: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  tools: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.5-2.5Z" />
    </>
  ),
  automotive: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.8v3M12 17.2v3M3.8 12h3M17.2 12h3" />
    </>
  ),
  misc: (
    <>
      <path d="m4 8 8-4 8 4-8 4Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </>
  ),
};

const LABEL_MATCHERS: Array<{ test: RegExp; icon: IconName }> = [
  { test: /electric|lighting|wire|cable/, icon: "electrical" },
  { test: /bath|plumb|pipe|sanitary/, icon: "plumbing" },
  { test: /paint|finish|coating/, icon: "paints" },
  { test: /agric|seed|farm/, icon: "agriculture" },
  { test: /pump|machine|motor/, icon: "pumps" },
  { test: /construction|cement|building material/, icon: "construction" },
  { test: /tile|plywood|board|laminate/, icon: "tiles" },
  { test: /tool|hardware|fastener/, icon: "tools" },
  { test: /auto|tyre|tire|vehicle/, icon: "automotive" },
];

function resolveIcon(iconKey: string | undefined, label: string): IconName {
  const text = `${label} ${iconKey ?? ""}`.toLowerCase();
  for (const matcher of LABEL_MATCHERS) {
    if (matcher.test.test(text)) return matcher.icon;
  }
  const key = (iconKey ?? "").toLowerCase().replace(/_/g, "-");
  if (key.includes("electric")) return "electrical";
  if (key.includes("plumb")) return "plumbing";
  if (key.includes("paint")) return "paints";
  if (key.includes("agric")) return "agriculture";
  if (key.includes("pump")) return "pumps";
  if (key.includes("construct")) return "construction";
  if (key.includes("tile") || key.includes("plywood")) return "tiles";
  if (key.includes("tool")) return "tools";
  if (key.includes("auto")) return "automotive";
  return "misc";
}

export function CategoryIcon({
  iconKey,
  label,
  size = 22,
  className = "category-icon-svg",
}: {
  iconKey?: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const icon = resolveIcon(iconKey, label);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[icon]}
    </svg>
  );
}
