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

## Staging correction (completed after the host came back)

The host was down for roughly an hour — **it rebooted** (`uptime` 1:10 on return), so SSH, HTTPS and ICMP
all vanished at once. Containers recovered on their own restart policies. Nothing in this change caused
it.

Once reachable, the stored records were corrected through the operator content route, which is the same
path the console uses:

| Record | Change |
|---|---|
| `hero-monsoon-ready` | subtitle cleared |
| `hero-bulk-savings` | subtitle cleared |
| `hero-free-delivery` | subtitle cleared |
| `secondary-clearance-sale` | subtitle cleared; alt text changed to "Tools and hardware on display" |

The clearance banner's stored **title** was "Buy More Sale", an operator edit, and was left alone — the
seed rule is that an operator edit is never overwritten. All four were then published (`200`).

Delivered result:

```
GET /v1/content/presentation?locale=en-IN&channel=b2c
hero-monsoon-ready       body: null
hero-bulk-savings        body: null
hero-free-delivery       body: null
secondary-clearance-sale body: null      (title "Buy More Sale" preserved)
banner-welcome-en-in     body: "Tools, hardware and building supplies from verified sellers."
```

A grep of the delivered payload for `40% off`, `70% off`, `10,000+ SKUs` and `On orders above` returns
**nothing**. The one surviving subtitle is a neutral description, not a claim.

The experience-api was then released from `/opt/buildkart-releases/3446922` so the delivery-side fallback
carries the corrected seed too, and `current` points there.

## Operational note (worth adding to the runbook)

Recreating the upstream containers left the edge returning **502** even though every service reported
healthy: the `proxy` nginx had resolved the old container IPs at start-up. `docker restart
buildkart-hosted-pilot-proxy-1` restored service immediately. Any release that recreates `medusa-api` or
`experience-api` must restart the proxy afterwards, or the site will 502 while monitoring says healthy.

## Not done

1. **Titles were left alone.** "Bulk Savings", "Free Delivery" and the operator's "Buy More Sale" still
   imply a benefit even with no body. I removed the quantified claims and stopped there rather than
   rewriting names that appear in tests, docs and stored records; renaming them is a content decision
   worth taking deliberately.
2. **No browser has looked at the result.** The evidence is the delivered payload and a regenerated
   golden, not a screenshot of the home screen.

