# Visual review follow-up — blank composition row and unrecognisable campaign banner

**Date:** 2026-10-18
**Trigger:** human screenshot of a large blank area immediately before the “Buy More Sale” banner.

## Blank area

The layout-driven Recommended module has no `splitSlot`. `MerchandisingModuleView` converted that
absence into `SizedBox.shrink()`, while `ProductCompositionSection` always appended the widget to its
grid. A shrunken child still occupied one full grid cell (`mainAxisExtent: 312`), producing an empty
fourth row on a two-column phone layout.

`ProductCompositionSection.specialSlot` is now nullable and is appended only when present. A widget
test asserts that a composition with two products and no split slot has exactly two grid children.

## “Buy More Sale” versus the console

At investigation time, the public presentation endpoint delivered:

- content key: `secondary-clearance-sale`
- customer heading: `Buy More Sale`
- placement: `b2c.home.campaign-strip`

The Banner studio list did not show that customer heading. It preferred the CMS-only internal `name`
(`Clearance Sale`) for the row and search index, so an operator looking for the words visible to a
customer could not find the record.

The list now shows the exact customer heading first, followed by `Internal name: Clearance Sale` and
the technical key. Search covers both headings and the key.

The app also no longer contains a campaign-strip fallback. If published CMS delivery contains no
campaign banner, no campaign banner is rendered; a local seed cannot bring it back. The same rule now
applies to missing creative on section-associated banners.

## Verification actually run

- `packages/agency_flutter_ui`: merchandising widget tests — **10 passed**.
- `apps/prototype_app`: `flutter analyze` — clean.
- `apps/prototype_app`: full suite — **154 passed**.
- Admin: `bun run build` — TypeScript and Vite build passed.
- Admin: ESLint passed for the two changed Banner studio files. The full admin lint remains red on the
  pre-existing `react-refresh/only-export-components` error in
  `src/widgets/collection-customer-link.tsx:64`; this follow-up did not modify that file.
- Flutter web release build passed and Firebase Hosting deployment completed.
- Hosted site returned `BuildKart`.
- Hosted `main.dart.js` did **not** contain `secondary-clearance-sale`, proving there is no compiled
  campaign seed.
- After deployment, the live presentation response contained four home heroes and **no**
  `b2c.home.campaign-strip`; therefore a hard refresh cannot render “Buy More Sale”.
- A 390×2400 headless-Chrome capture of the hosted home was inspected: Recommended rendered six
  products in three complete rows, Browse Categories followed immediately, and no campaign strip or
  blank fourth row appeared.

## Deployment boundary

- **Storefront fix:** released to `https://buildkart-staging.web.app`.
- **Banner-studio row/search fix:** built locally but not yet released to the VPS. SSH rejected the
  configured staging key (`Permission denied (publickey,password)`), so no console deployment is
  claimed.
- Production remains unauthorized.

## Human check still required

Hard-refresh the storefront and confirm the blank fourth grid row and “Buy More Sale” strip are gone.
After console deployment access is restored, confirm a banner row is identifiable by the same heading
customers see.
