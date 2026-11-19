import Link from "next/link";
import {
  POLICIES,
  POLICY_DRAFT,
  normalizePolicyMarkdown,
  type PolicyDefinition,
} from "@/lib/policies";
import { renderPolicyMarkdown } from "@/lib/policy-markdown";

export function PolicyPage({
  policy,
}: {
  policy: PolicyDefinition & { markdown: string };
}) {
  const html = renderPolicyMarkdown(normalizePolicyMarkdown(policy.markdown));
  const related = POLICIES.filter((candidate) => candidate.slug !== policy.slug);

  return (
    <article className="policy-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/policies">Policies</Link>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">{policy.title}</span>
      </nav>

      <header className="policy-head">
        <span className="eyebrow">BazarBee policy pack</span>
        <h1>{policy.title}</h1>
        <p className="policy-description">{policy.description}</p>
        <p className="policy-updated">
          {POLICY_DRAFT
            ? "Last updated: Pending legal review · Effective from: Pending legal review"
            : "Last updated: 19 November 2026 · Effective from: 19 November 2026"}
        </p>
      </header>

      {POLICY_DRAFT ? (
        <div className="notice policy-draft" role="note">
          <strong>Draft for review — not yet effective.</strong> This page is a preview of the policy
          pack. Legal review, the effective date and GSTIN verification are pending. The GSTIN is
          withheld and refund timelines are marked proposed. Do not rely on this page as the final
          terms.
        </div>
      ) : null}

      <div
        className="policy-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="policy-footer">
        <div>
          <span className="eyebrow">Policy pack</span>
          <h2>Other policies</h2>
        </div>
        <nav className="policy-links" aria-label="Other policies">
          {related.map((candidate) => (
            <Link key={candidate.slug} href={candidate.href}>
              {candidate.title}
            </Link>
          ))}
          <Link className="policy-all-link" href="/policies">
            All policies →
          </Link>
        </nav>
      </footer>
    </article>
  );
}
