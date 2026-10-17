# Seed copy integrity — removing unevidenced commercial claims

**Status:** code fixed and the app redeployed; **staging data not yet corrected** and the delivery change
**not yet released** — the VPS became unreachable mid-change (see the outage note at the end).
**Date:** 2026-10-17

## What was wrong

The governed fallback presentation — the banners the storefront shows before an operator authors
anything — asserted commercial facts nobody had evidenced:

| Banner | Claim |
|---|---|
| `hero-monsoon-ready` | "Up to 40% off waterproofing" |
| `hero-bulk-savings` | "Dealer pricing on 10,000+ SKUs" |
| `hero-free-delivery` | "On orders above ₹2,000" |
| `secondary-clearance-sale` | "Up to 70% off select items" |

The brief forbids fabricating discounts, ranks, recommendations and purchase history. A percentage that
no offer backs is exactly that, and it was shipping as the storefront's **default state** — before any
editorial decision existed to review.

The copy was duplicated in **four** places, which is why fixing one string was not enough:

| File | Role |
|---|---|
| `services/cms/src/presentation-seed.ts` | Bootstrap seed — writes these records into Strapi |
| `services/experience-api/src/content/presentation.ts` | Delivery fallback when the CMS is empty |
| `apps/prototype_app/lib/domain/presentation.dart` | App fallback presentation |
| `apps/prototype_app/lib/widgets/home_header.dart` | The header's own hardcoded fallback |

## What changed

- Every seed body was removed rather than reworded. Rewriting "Up to 40% off" into different marketing
  copy would have replaced one unevidenced claim with another; an absent claim is the only honest seed.
- Titles, themes, CTAs and links are unchanged, so the storefront still has structure before content is
  authored.
- The clearance banner's alt text changed from "Discounted tools and hardware on display" to "Tools and
  hardware on display" — alt text describing a discount is still a claim.
- An operator's own banner still carries whatever subtitle they write; this only governs seeds.

## Verification

- `flutter analyze` clean; **147 tests pass**, including a new guard that every fallback banner has no
  body and no `%`/SKU/`₹` text.
- The home golden changed by **0.69% (one text line)**; I viewed the isolated diff and it is exactly the
  removed copy, then regenerated and re-read the golden.
- Experience API typecheck clean; `test:presentation` passes.
- App rebuilt and redeployed to `https://buildkart-staging.web.app` (`200`).

## Not done, and why

1. **The staging CMS still holds the claims.** The seed only runs on bootstrap, and these banner records
   already exist in Strapi, so the live presentation keeps serving the old subtitles until each record is
   edited. That edit needs the operator content API on the VPS.
2. **The experience-api fallback change is unreleased.** It takes effect on the next release.
3. **Titles were left alone.** "Bulk Savings" and "Free Delivery" still imply a benefit even with no
   body. I removed the quantified claims and stopped there rather than rewriting names that appear in
   tests, docs and stored records; renaming them is a content decision worth taking deliberately.

## Staging outage

While preparing the CMS correction, `89.116.20.164` stopped answering: **SSH (22) and HTTPS (443) both
time out, and ICMP fails**, while Firebase Hosting continues to return `200`. Staging was healthy minutes
earlier — the console release and health checks passed. The cause is not visible from here (host, network
path or provider). Nothing in this change explains it: the last action before the loss of connectivity was
a successful deploy and a successful health check.

Until the host is back, the CMS correction and the experience-api release cannot be performed, and the
staging storefront keeps showing the old claim copy.
