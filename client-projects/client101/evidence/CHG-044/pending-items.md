# CHG-044 Pending Items — Closed and Remaining

**Commit:** `53796f4`
**Status:** Two further gaps closed; the rest are enumerated with reasons rather than left vague.

## Closed in this pass

| Item | Result |
|---|---|
| Per-section banner | A section's `banner_reference` now resolves against the banner presentation and renders **above the rail it introduces**, reusing the existing banner widget. Previously configured in the editor but never drawn. |
| See All destination | `MerchandisingModule` carries `seeAllUri`/`seeAllLabel` from the layout, and the home navigates to it instead of guessing from the title. |

Verified: `flutter analyze` clean, **140 tests pass**, including a new test asserting the associated
banner renders first with its title and alt text, and that See All carries the layout destination. App
rebuilt and redeployed to `https://buildkart-staging.web.app`.

## Remaining, and why each is not closed

1. **B2B layout wiring.** `layoutSectionsProvider` requests the `b2c` channel; the B2B home still builds
   Buy Again and Trade Offers locally, and **no B2B sections exist in the CMS**. Closing this means
   authoring the B2B layout and restructuring the B2B home to render sections — a bounded but real
   chunk, and the natural next step.
2. **Collection-scoped manual product ordering (phase 4).** Not started. A Medusa collection↔product
   link carries **no rank field**, so this needs new persistence plus drag-and-drop. It cannot be done by
   reusing anything that exists.
3. **Drag-and-drop section ordering.** Implemented as accessible move up/down. No drag-and-drop library
   is among the app's dependencies, so adding it is a dependency decision, not just code.
4. **Buy Again and Schemes as real sources (phase 5).** Deliberately held: you approved keeping these as
   **labelled fixtures** rather than exposing them as working. Making them real is commerce work
   (customer-scoped order history with reorder revalidation; scheme qualification and benefit) that the
   architecture mapping lists as an open gap.
5. **Merchandising reduced to exactly Banners and Storefront layouts (phase 6).** **Not done, on
   purpose.** `RouteConfig` in the dashboard SDK has **no `hidden` flag**, so the only ways to meet
   "exactly two menu items" are to delete or relocate **eight** working pages. Four of them (Overview,
   Review queue, Delivery status, Content activity) are approved for retirement, but Category details,
   Product editorial and Help and articles hold live CMS content and would lose their editor. Relocating
   all eight changes their URLs and requires auditing every cross-link (the banner editor links to
   Category details; the overview links to property pages). I judged that too wide to do safely at the
   end of this pass, and deleting working features is not something to do silently.
6. **Client-side validation on the raw JSON property page.** Only the new section editor validates. An
   operator using the advanced JSON view can still store sections that delivery will reject.
7. **Campaign strip ordering.** With layout sections present, the strip now renders **after** them rather
   than between the two rails. It is banner presentation, not a section, so it has no position in the
   section order. Making it a real placement (`campaign_strip`) would let it be ordered like everything
   else — a small registry addition, if you want it.
8. **Human visual acceptance.** Nobody has opened the home and looked at it. All evidence remains
   analyzer, tests, API payloads and bundle contents.
9. **The CMS bootstrap seed is still unexercised.** It now creates category banner records and needs a
   fresh database to prove.

## Recommendation for the remaining work

In value order: **(1) B2B wiring**, then **(8) your visual acceptance** — because the storefront is now
layout-driven and that is the first point at which looking at it is worth your time. Then **(6)** raw
JSON validation and **(7)** campaign strip as a placement, both small. **(5)** the navigation change
needs a deliberate session with a link audit, and **(2)**/**3** are real features rather than polish.
