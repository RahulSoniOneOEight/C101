import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

/**
 * The policy pack is authored outside the storefront and mirrored into `content/policies`.
 * Pages read it at build time, so the published HTML is self-contained in the standalone image.
 */
export type PolicySlug = "terms" | "refunds" | "shipping" | "privacy" | "contact" | "about";

export interface PolicyDefinition {
  slug: PolicySlug;
  href: string;
  file: string;
  title: string;
  description: string;
}

export const POLICIES: PolicyDefinition[] = [
  {
    slug: "terms",
    href: "/terms",
    file: "terms-of-service.md",
    title: "Terms of Service",
    description: "The contract for buying and selling on BazarBee, including orders, payment and liability.",
  },
  {
    slug: "refunds",
    href: "/refunds",
    file: "refund-and-cancellation-policy.md",
    title: "Refund & Cancellation Policy",
    description: "Cancellation windows, return eligibility, refund routes and timelines.",
  },
  {
    slug: "shipping",
    href: "/shipping",
    file: "shipping-and-delivery-policy.md",
    title: "Shipping & Delivery Policy",
    description: "Seller-fulfilled delivery, serviceable pincodes, charges and inspection.",
  },
  {
    slug: "privacy",
    href: "/privacy",
    file: "privacy-policy.md",
    title: "Privacy Policy",
    description: "How BazarBee collects, uses, shares and retains personal data.",
  },
  {
    slug: "contact",
    href: "/contact",
    file: "contact-and-grievance.md",
    title: "Contact & Grievance",
    description: "Operator details, support channels and the grievance escalation path.",
  },
  {
    slug: "about",
    href: "/about",
    file: "about.md",
    title: "About Us",
    description: "Who operates BazarBee and how the marketplace works.",
  },
];

/**
 * Draft status is explicit. Set POLICIES_APPROVED=true only after legal review, placeholder
 * replacement and GSTIN verification. Until then pages carry a visible draft notice and are
 * excluded from search indexing.
 */
export const POLICY_DRAFT = process.env.POLICIES_APPROVED !== "true";

export function getPolicy(slug: PolicySlug): PolicyDefinition & { markdown: string } {
  const definition = POLICIES.find((policy) => policy.slug === slug);
  if (!definition) throw new Error(`Unknown policy: ${slug}`);
  const markdown = readFileSync(
    path.join(process.cwd(), "content", "policies", definition.file),
    "utf8",
  );
  return { ...definition, markdown };
}

export function policyMetadata(slug: PolicySlug): Metadata {
  const definition = POLICIES.find((policy) => policy.slug === slug);
  if (!definition) throw new Error(`Unknown policy: ${slug}`);
  return {
    title: definition.title,
    description: definition.description,
    robots: POLICY_DRAFT ? { index: false, follow: false } : undefined,
  };
}

/** Content substitutions that keep unreviewed legal tokens out of the rendered HTML. */
export function normalizePolicyMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/^\*\*DRAFT[^\n]*\n?/im, "")
    .replace(/^\*\*Last updated:\*\*[^\n]*\n?/gim, "")
    .replace(/^\*\*Effective from:\*\*[^\n]*\n?/gim, "")
    .replace(/\[EFFECTIVE_DATE\]/g, "Pending legal review")
    .replace(/\[BANK_REFUND_DAYS\]/g, "5–7 (proposed)")
    .replace(/GSTIN:\s*\*\*08BFNPJ8379G1Z5\*\*/g, "GSTIN: pending verification")
    .replace(/GSTIN:\s*08BFNPJ8379G1Z5/g, "GSTIN: pending verification")
    .replace(/08BFNPJ8379G1Z5/g, "pending verification")
    .replace(/^# .*\n/, "")
    .replace(/^\s*---+\s*\n+/, "");
}
