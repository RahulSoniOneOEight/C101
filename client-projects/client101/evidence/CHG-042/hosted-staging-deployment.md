# CHG-042 Banner Studio — Hosted Staging Deployment

**Date:** 16 October 2026
**Change contract:** CHG-042 revision 2
**Environment:** Staging
**Status:** Deployed for human review; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `13941b2`
- Active worktree: `/opt/buildkart-releases/13941b2`
- Previous release retained for rollback: `/opt/buildkart-releases/e4a1f32`
- Active symlink: `/opt/buildkart-releases/current`

The combined hosted and FCM Compose configuration validated before deployment. The CMS, Medusa API and
Experience API images were rebuilt and only those three services were recreated; PostgreSQL, Redis,
NATS, Tryton, workers and the proxy were left running. The proxy was reloaded so its upstreams resolve
the recreated containers.

## New private secret

The draft preview projection needed its own credential. A dedicated `EXPERIENCE_OPERATOR_SECRET` was
generated on the host and written to both `/etc/buildkart/secrets/medusa.env` and
`/etc/buildkart/secrets/experience-api.env` (same value, fingerprint verified as identical, files still
`600 root:root`). It is deliberately not the CMS operator secret or the CMS webhook secret, so no
secret is reused across trust boundaries. The value is never printed, committed, or returned to a
browser.

## Verified behaviour

Served admin bundle: `assets/index-yZk987kb.js`.

- Banner studio routes return HTTP `200`, including the new `Scheduled` tab (`?view=scheduled`).
- The served bundle contains `Banner studio`, `Create banner`, `Scheduled`, `Internal name`,
  `Duplicate`, `Review & publish`, `Live preview` and `Illustrative preview`.
- The served bundle does **not** contain `Media library`, `Campaign landing page`, or the demo's
  fabricated catalogue (`Bulk essentials`, `Festive favourites`).
- The operator content endpoint returns `401` without authentication.
- The customer host returns `404` for `/v1/internal/content/preview`, so the preview route stays
  private; nginx blocks `/v1/internal` at both public hostnames.
- `GET /v1/content/presentation` is unchanged: `source=cms-strapi+category:cms-strapi`, `stale=false`,
  the same five banner keys and six categories.

### Preview projection

Called server-to-server inside the private network with the new secret:

- authorised request → `200`, `illustrative: true`, mapped `presentation` with `title`, `action_uri`
  `/browse?tag=Flash%20Deals`, and `eligibility: scheduled` for a banner starting tomorrow;
- identical request with a wrong bearer token → `401`.

### Draft isolation, duplicate and concurrency

Exercised against the private CMS operator API through the compiled runtime:

- `duplicate-draft` → `201`, created `secondary-clearance-sale-copy`, name `secondary-clearance-sale
  (copy)`, `publishedAt: null`. The source banner's publication state was untouched.
- stale save (`expectedUpdatedAt` from the year 2000) → `409` with `CmsEditConflictError`, and the
  write was not applied.
- save with the correct token → `200` and the field updated.
- audit rows recorded: `chg-042-dup duplicate-draft succeeded`, `chg-042-conflict update-draft failed`,
  `chg-042-ok update-draft succeeded`.
- the duplicate was test data and was deleted afterwards; the banner table is back to its original
  ten rows and no `-copy` keys remain.

### Schema

`banners.name` (nullable string) exists after the CMS migration, so the operator-facing internal name
is stored without affecting delivery. Only the five already-published banners remain fixed; nothing was
published by this deployment.

### Service health

`cms`, `medusa-api` and `experience-api` are healthy with zero restarts.

## Human review checklist

Open `https://ops-staging.pinakaplay.cloud/dashboard/merchandising/banners` with an authorised staging
operator:

1. Confirm the header, Staging badge, counts and `Create banner` action.
2. Confirm the All, Needs review, Draft only, Published and Scheduled tabs keep state in the URL.
3. Test search plus the placement, audience and language filters.
4. Confirm the table separates editorial status from display eligibility, and that no banner claims to
   be displaying.
5. Open a banner: confirm the grouped sections, the language switch, the conditional destination field
   and the schedule controls.
6. Confirm the preview pane updates while typing and that the App, Mobile web and Desktop modes and the
   illustrative note behave sensibly.
7. Save a draft and confirm the published banner is unchanged.
8. Use `Duplicate` and confirm the copy is a draft.
9. Publish or schedule from the review dialog and confirm the summary matches what you entered.
10. Open two tabs on the same banner, save in both, and confirm the second save is stopped with the
    reload message instead of overwriting.
11. Review at wide desktop and approximately 1024px.

No production deployment or authorization was performed.

## Operator-route verification (second round)

The first round verified the CMS and Experience API layers directly. This round verified the exact HTTP
chain the browser uses, through the Medusa operator routes with an authenticated operator session. The
credential was read on the host; neither the password nor the session token was printed.

| Step | Result |
|---|---|
| Operator login | `ok` |
| `GET /admin/buildkart/content?kind=banner&locale=en-IN` | `200`, 5 documents, `name` present in the definition |
| `POST /admin/buildkart/content/preview` | `200`, `complete: true`, `eligibility: scheduled`, `illustrative: true`, `title: Probe heading`, `action_uri: /products`, `priority: 7` |
| `POST /admin/buildkart/content/preview` with `kind: faq-article` | `400` (banner-only in this increment) |
| `POST /admin/buildkart/content` `duplicate-draft` | `201`, key `secondary-clearance-sale-copy`, `publishedAt: null` |
| `POST /admin/buildkart/content` `update-draft` with a stale token | `409` and the write was not applied |
| `POST /admin/buildkart/content` `update-draft` with the correct token | `200`, field updated |
| Source banner publication state after every step | unchanged |

The test duplicate was removed afterwards: the banner table is back to 10 rows (5 draft, 5 published)
with no `-copy` keys.

### Defect found and fixed during this round

Medusa's error handler rewrites a `CONFLICT` message to a generic string. The real `409` body is:

```json
{"code":"invalid_state_error","type":"conflict","message":"The request conflicted with another request. You may retry the request with the provided Idempotency-Key."}
```

The editor originally detected a concurrent edit by matching the message text, which would never have
matched this body — the save would still have been blocked, but the operator would have seen a
misleading "retry with an Idempotency-Key" message instead of the reload-and-reconcile guidance. The
editor now branches on the HTTP status (`409`) from `ClientError`, with the message pattern kept only as
a secondary guard. Fix released as `5482e56`.

The status-based branch is verified by type-level inspection (`ClientError.status`), the lint and build
gates, and the confirmed `409` response shape above. It is not covered by browser automation, which
remains a verification limit.

## Revision 3 — lifecycle tabs and compact toolbar

Requested change: the banner tabs should read Live, Draft, Scheduled and Historical; the create action
should sit on the right; filters should be compact with a cleaner layout.

### Shipped

- Tabs are now **Live, Draft, Scheduled, Historical**, each carrying its own count. Live is the default
  view, so `/merchandising/banners` opens on what customers see.
- Tab membership is derived only from publication and the stored schedule: expired → Historical,
  unpublished → Draft, published with a future start → Scheduled, otherwise → Live.
- The **Needs review** tab was replaced by the in-row editorial badge (`Changes not published`). A
  published banner with unpublished edits therefore stays under Live and remains clearly marked; the
  state is not lost.
- **Create banner** is pinned to the right of the header, with the total banner count beside it.
- Filters are compact and single-row: small search field plus placement, audience and language selects,
  each self-describing ("All placements", "All audiences", "English (India)") with screen-reader labels,
  and a `Clear` action that appears only when a filter is active.
- The four duplicated count cards were removed; counts now live in the tabs and the total in the header,
  removing the previous double-reporting.
- The eligibility column heading is now `Eligibility` and says so explicitly.
- The table's duplicated "Unpublished changes" text under the name was removed because the editorial
  badge already carries it.

### Robustness fix found while reworking the page

The editor previously treated any unresolved `?editor=<id>` as "create new", so opening a stale or
another-language link could have created an unintended duplicate. The page now opens the editor only for
`editor=new` or a resolved document, and shows an explicit "That banner could not be opened" panel
otherwise.

### Verified on staging

- Active release `faecaa2`; served bundle `assets/index-D6KjqAHE.js` (new hash).
- Bundle contains the exact tab definition `{label:"Draft"},{value:"scheduled",...},{value:"historical",label:"Historical"}`,
  plus `Eligibility`, `Search banners`, `Clear`, `tab-count-` and the new not-found panel text.
- `200` for `/dashboard/merchandising/banners` and for `?view=draft`, `?view=scheduled`, `?view=historical`.
- `medusa-api` healthy after recreate and the proxy was reloaded.

### Not verified

Tab counts, filter combinations and the responsive behaviour at wide desktop and ~1024px still need a
human eye; they are client-side derivations and are not covered by browser automation.

## Revision 4 — one status model, two toolbar rows

Requested change: clear the redundancy between the Editorial and Eligibility columns, use a smarter
representation, put search and filters in one row with the tabs in another, and keep best practice in
mind.

### Redundancy removed

The two columns were not equally justified. Every draft row rendered `Draft` / `Not published` — the
same fact twice — and once the lifecycle tabs existed, a published row's Eligibility badge simply
repeated the tab. The problem was presentation, not the underlying distinction.

There is now **one** lifecycle model, and the tab and the row status are two projections of it:

```
draft (never published) · scheduled (opens later) · live (open now) · expired (window closed)
```

- The **Editorial** and **Eligibility** columns collapsed into a single **Status** column.
- The only fact the lifecycle does not carry is whether a published banner has newer unpublished edits,
  which is shown inline beside the badge as "Changes not published". That state survives the earlier
  removal of the "Needs review" tab.
- The `Schedule · IST` column remains and is the evidence for the derived status rather than a
  restatement of it.
- The tab is labelled **Historical** (a bucket) while the row badge reads **Expired** (the precise
  reason), which is a deliberate distinction rather than an inconsistency.
- Dead code was removed: `publicationTabFor`, `BannerItem`, `DisplayEligibility`, `DISPLAY_LABELS` and
  `DISPLAY_COLORS`. The last two were replaced by `ELIGIBILITY_LABELS` / `ELIGIBILITY_COLORS`, typed to
  the three values the delivery service actually returns and used only by the preview pane, which shows
  server-computed eligibility for the draft being edited — a different question from the list row.

### Layout

- Row 1: lifecycle tabs, each with its count, horizontally scrollable on narrow screens.
- Row 2: compact search plus placement, audience and language, with `Clear` appearing only when a
  filter is active.
- Row 3 (header): title left, `Create banner` and the total right.

### Best-practice notes applied

- One horizontal tab level is preserved, matching the governed navigation decision.
- The tablist keeps `role="tablist"`/`role="tab"`/`aria-selected` and a group label, consistent with the
  shared `PageTabs` used by the other five properties.
- Every filter control keeps an associated label (screen-reader only, because the row is compact) and
  self-describing values (`All placements`, `All audiences`, `English (India)`), so the control is
  meaningful without a visible label.
- Status colour is not the only signal: each state also carries a text label.
- Filter, tab, search, page and editor state remain in the URL, so any view is linkable and
  refresh-safe.
- Empty, loading, error and permission states are unchanged.

### Verified on staging

- Bundle contains the single lifecycle map and no `Not published` state, and the preview still uses the
  eligibility labels.
- `200` on the studio route and the three non-default tab URLs.

### Not verified

Counts, colour perception and the two-row toolbar at wide desktop and ~1024px still need a human eye.

## Known limitations and deviations (deliberate)

Recorded so nothing is mistaken for finished work:

1. **Media upload, crop and focal point are not implemented.** The creative is an https reference and
   crop is fixed by the customer app. DAM authority is still unresolved under CHG-026.
2. **Per-banner channel does not exist.** The field is shown read-only with an explanation; channel and
   ordering come from the storefront layout.
3. **Commerce entity pickers are not implemented.** Destinations are entered directly and validated for
   shape only. `Campaign landing page` is not an approved target type, so it is not offered.
4. **The preview is an approximation.** It is generated from the real delivery mapping rules but the
   storefront is Flutter, so typography, crop and theme treatment are not pixel-accurate. App/Mobile
   web/Desktop change the frame only.
5. **Placement conflicts are not yet validated** beyond what the operator can see; a rules engine is
   deferred.
6. **Publish/unpublish still use the existing placeholder permission resource (`promotion`).** Real
   content roles are a separate governed item and remain unimplemented.
7. **Scheduling is publish plus a server-enforced window.** Strapi scheduled publishing is not enabled
   and was not simulated.
8. **Disabled/unassigned eligibility states are not shown**, because determining layout membership
   reliably is not available yet. The four honest states are not-published, expired, scheduled and
   eligible.
9. **Language handling** creates a localised draft when one does not exist, and the preview follows the
   language being edited.
