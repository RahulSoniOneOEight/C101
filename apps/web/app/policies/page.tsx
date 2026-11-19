import Link from "next/link";
import { POLICIES, POLICY_DRAFT } from "@/lib/policies";

export const dynamic = "force-static";

export const metadata = {
  title: "Policies",
  description: "BazarBee terms, refunds, shipping, privacy, contact and company information.",
  robots: POLICY_DRAFT ? { index: false, follow: false } : undefined,
};

export default function PoliciesPage() {
  return (
    <article className="policy-page policy-index">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Policies</span>
      </nav>

      <header className="policy-head">
        <span className="eyebrow">BazarBee policy pack</span>
        <h1>Policies &amp; company information</h1>
        <p className="policy-description">
          The rules that apply when you shop on BazarBee, plus how to reach us and how the
          marketplace works.
        </p>
        <p className="policy-updated">
          {POLICY_DRAFT ? "Status: draft — pending legal review" : "Effective 19 November 2026"}
        </p>
      </header>

      {POLICY_DRAFT ? (
        <div className="notice policy-draft" role="note">
          <strong>Draft for review — not yet effective.</strong> These pages preview the policy pack.
          Legal review, the effective date and GSTIN verification are pending; the GSTIN is withheld
          and refund timelines are marked proposed.
        </div>
      ) : null}

      <div className="policy-index-grid">
        {POLICIES.map((policy) => (
          <Link className="policy-index-card" href={policy.href} key={policy.slug}>
            <span className="eyebrow">Policy</span>
            <strong>{policy.title}</strong>
            <p>{policy.description}</p>
            <span className="card-link">Read policy →</span>
          </Link>
        ))}
      </div>

      <section className="policy-contact-strip">
        <div>
          <span className="eyebrow">Need help?</span>
          <h2>Contact &amp; grievance</h2>
          <p>
            Email <a href="mailto:support@gobazarbee.com">support@gobazarbee.com</a> or call
            094141 03677, Monday to Saturday, 10:00–18:00 IST.
          </p>
        </div>
        <Link className="button" href="/contact">
          Contact us
        </Link>
      </section>
    </article>
  );
}
