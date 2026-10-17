# Merchandising Navigation and Operational Views — Local Verification

**Date:** 15 October 2026
**Change contract:** CHG-039 revision 2
**Status:** Deployed to staging; awaiting human visual review; production unauthorized

## Implemented

### Primary left-sidebar navigation

- Registered `Merchandising` as the primary sidebar group with children.
- Added sidebar children: Overview, Editorial content, Review queue, Delivery status and Content activity.
- The merchandising parent route redirects to the overview child so the old entry stays safe.

### One page-local horizontal tab level

- Overview: Needs attention, Scheduled and Recently changed.
- Editorial content: content-type tabs (pre-existing, retained).
- Review queue: All pending, Changes not published and Draft only.
- Delivery status: Content-type coverage, Published eligibility and Coverage gaps.
- Content activity: Recently updated and Recently published.
- Every tab preserves its selection in the URL query string.

### Truthful operational reporting

- Overview uses real CMS document state, distinguishes changes-not-published from draft-only, and
  derives Scheduled from recorded `startsAt`/`effectiveAt` timestamps only.
- Review queue lists real modified and draft records and links to the publication controls; it does
  not claim diff or reviewer assignment.
- Delivery status reports editor availability and declared consumer coverage; it states that
  published means eligible for delivery, not a projection or webhook receipt.
- Content activity reports current CMS timestamps and explicitly states it is not an actor-level
  audit trail.

### Guards retained

- No preset review navigation, preset metrics or preset-derived counts return.
- Commerce membership, pricing, promotions and taxonomy remain in native Medusa controls.

## Checks

- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- CHG-039 revision 2 parsed as valid YAML.
- `git diff --check` passed.
- Release `e8c9240` is deployed to staging; see `hosted-staging-deployment.md`.

## Deferred checkpoint scope

Live-versus-draft diff, reviewer assignment, storefront preview, schedule mutation, projection
refresh, webhook receipts, actor-level audit API and live promotion/campaign summaries remain
deferred. No production release was authorized or performed.
