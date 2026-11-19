# Store policy pages — 19 Nov 2026

The policy pack at `D:\C101\docs\policies` is now mirrored into the web storefront and served at
the public routes below. **The pack is still a draft.** The pages are deliberately published as
review previews, not as effective legal terms.

## Routes and source files

| Public route | Source file | Page |
|---|---|---|
| `/terms` | `terms-of-service.md` | Terms of Service |
| `/refunds` | `refund-and-cancellation-policy.md` | Refund & Cancellation Policy |
| `/shipping` | `shipping-and-delivery-policy.md` | Shipping & Delivery Policy |
| `/privacy` | `privacy-policy.md` | Privacy Policy |
| `/contact` | `contact-and-grievance.md` | Contact & Grievance |
| `/about` | `about.md` | About Us |
| `/policies` | `README.md` (internal index) | Policy pack index |

The Markdown files are copied to `apps/web/content/policies/`; the policy-pack `README.md` was used as
the source index but is **not copied or published**. The `/policies` index is a customer-facing card
index built from `apps/web/lib/policies.ts`. The unverified GSTIN is redacted from the stored copies
as well as from the rendered pages.

## Draft safeguards

- `POLICY_DRAFT` is `true` unless `POLICIES_APPROVED=true` is set at build time.
- Every page shows a visible “Draft for review — not yet effective” notice while in draft mode.
- The GSTIN is withheld (`GSTIN: pending verification`) instead of publishing the unverified
  registration number from the draft.
- `[EFFECTIVE_DATE]` renders as “Pending legal review”; `[BANK_REFUND_DAYS]` renders as
  “5–7 (proposed)”.
- Draft pages emit `robots: noindex, nofollow`; the staging edge already sends
  `X-Robots-Tag: noindex, nofollow` for every route.
- Footer links to all six policies and the index appear on every storefront page.

## Publish gate

Before removing the draft notice and setting `POLICIES_APPROVED=true`:

1. Legal review completed and recorded.
2. Effective date and refund timeline confirmed.
3. GSTIN verified against the GST portal.
4. Support mailbox created and tested from an external account.
5. Phone ownership/answering confirmed.
6. All placeholders removed from the source documents, not just the rendered HTML.
7. Policy numbers reconciled with checkout/returns behaviour.

The source README’s own publish checklist remains the authority for these gates.

## Verification

- Typecheck/build: clean; all six policy routes plus `/policies` are static (`○`) in the route table.
- Live: all six routes return `200`; each has one draft notice; tables render; no `[` token or
  unverified GSTIN appears in the rendered body.
- `/policies` shows 6 policy cards.
- Footer: 7 policy links (six policies + All policies) on every page.
- Mobile 390: no horizontal overflow on `/terms`.
