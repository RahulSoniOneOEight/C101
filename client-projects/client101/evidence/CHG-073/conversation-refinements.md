# CHG-073 — conversation refinements and cart assistant

**Environment:** staging only

**Production:** unauthorized

**Status:** Phases A, B and C complete and deployed to staging. The assistant is a deterministic,
read-only participant. The explicit shared-list → cart handoff is delivered under CHG-072 Phase E;
the assistant has no write path. Production remains unauthorized.

## Implemented in Phase A

### Capture placement (revision 3)

- Card-level `Discuss` is removed from catalogue tiles, compact cards, quick-order
  cards and search result rows so the product image and purchase action stay primary.
- PDP and cart-line actions remain labelled `Discuss`.
- The conversation header bell remains the entry point on every page.
- The in-chat Add product picker includes a horizontal **Recently viewed** swimlane.
  Selecting a recent product uses the same capture path as search and never changes
  the cart.

### Header entry

- A compact conversation icon immediately beside the notification bell.
- Unread badge driven by the existing workspace unread projection.
- The bottom floating launcher is removed.
- Search, PDP, Cart and the B2B catalogue/offers/cart/PDP app bars carry the same action.
- The B2B header entry now opens the dock; the full workspace remains available inside the dock.

### Revision 3 UI refinement

- Removed the card-level `Discuss` control from the shared `ProductCard`,
  `CompactProductItem`, `TradeProductCardCompact`, B2B quick-order cards and both search
  result rows.
- Kept labelled `Discuss` on PDPs and cart lines.
- Added the **Recently viewed** horizontal swimlane to the in-chat product picker. It uses
  the existing local viewing history and maps to the current catalogue; selecting a tile
  enters the normal capture path.
- Refreshed the affected goldens (`b2b_home`, `b2b_catalogue`, `browse`); no other golden
  changed.
- Verified at 360×800 in the dock picker test and at 390×844 in Chrome after deployment.
- Direct PDP loads also record the product once after the first frame, so the recents rail
  works on a hard reload.
- A recently viewed product outside the current `CHG-049` import is resolved by id when the
  picker opens; the live check showed WoodWise Plywood in Recently viewed even though it is
  not in the imported 233-product picker list.

### In-chat add product

- The composer has an `Add product` action; the shared list has the same action.
- It opens a catalogue picker with title, brand and SKU search.
- Selecting a product uses the existing capture path:
  - owner / buyer / admin: accepted line and new revision;
  - participant: pending add-line proposal;
  - approver: chat share only.
- Duplicate variants are not added twice.
- No cart or order write.

### Assistant design and implementation (Phases B–C)

`ADR-client101-013` records the accepted design and the Phase C implementation: a deterministic,
on-platform **automated assistant with human escalation**.

- Distinct, labelled participant — every reply says `Automated Â· BuildKart Cart Assistant`.
- One assistant channel per workspace, visible to active members.
- Mentionable with `@assistant` in the human thread; also messageable in its own thread.
- The assistant replies to:
  - list summaries with line count, units, snapshot total and top lines;
  - pending-proposal count;
  - cart-build explanations and blocked-quantity/MOQ/stock guidance;
  - human-escalation requests.
- It reads only the latest purchase draft, its current revision totals and pending proposals. It does
  not read unrelated human messages or owner-only fields.
- It cannot accept/decide proposals, approve revisions, invite members, build a cart or create an
  order. It has no commerce client and no external model provider.
- Each reply writes a normal workspace message from actor `assistant_cart` plus an
  `activity_event` audit record.

### Shared-list → cart handoff (CHG-072 Phase E)

- `Review before cart build` re-reads the current Commerce offer for each accepted line.
- Differences detected: price, seller, currency, stock, original offer availability and MOQ.
- Blocked lines (out of stock, below MOQ, no current offer) cannot be added; the user is asked to
  update the shared list.
- A price/seller change requires an explicit acknowledgement checkbox.
- B2C adds to the canonical Medusa cart; B2B adds to the existing quotation draft only when the
  approval is current for that revision. Approvers never get the action.
- The build records a device-local `draft:revision` key and sets existing lines to the list quantity,
  so a retry does not duplicate lines.
- The UI says GST/tax is resolved by the cart at checkout; it never writes an order or payment.
- `View cart` closes the conversation dock and opens the cart.

### Home merchandising repair

Staging’s Flash Deals and Recommended collections resolve empty while Best Sellers has one product.
The published sections were therefore being dropped. `homeModulesProvider` now keeps the operator’s
section title, order and placement and fills the rail from the governed deterministic catalogue,
without duplicating server products. Flash Deals, Best Sellers and Recommended for You all render.

## Verification

| Check | Result |
|---|---|
| `flutter analyze` | **pass** |
| `flutter test` (app) | **pass**, 266 tests |
| `flutter test` (`agency_flutter_ui`) | **pass** (unchanged), 54 tests, 27 skipped golden captures |
| Golden snapshots | refreshed; reviewed the icon/header changes |
| `flutter build web --release` (staging defines) | **pass** |
| Chrome 390×844 and 360×800 | **pass** for home, dock, assistant and cart review |
| Console errors | none |
| Header entry beside the bell | pass in both channels |
| In-chat product picker | pass; product added from Chat at both sizes |
| Assistant direct thread | pass in B2C and B2B; reply is visibly automated and read-only |
| Assistant mention in human chat | pass; reply appears in the same thread with a refusal boundary |
| Cart review | pass; current price/stock/seller/MOQ shown |
| Cart additions | B2C cart 3 lines; B2B quotation cart 4 lines after approval |
| Idempotent retry | repeated builds leave the same line count |
| B2B approval gate | pass; unapproved revision showed “Approval is not currentâ€ and a disabled action |
| Home merchandising | Flash Deals, Best Sellers and Recommended for You all render |
| Card-level chat | removed; B2C home exposes 0 `Discuss` buttons |
| Chat recently viewed | pass; resolves a viewed product outside the imported catalogue |
| Commerce write / order creation | none beyond the authorized cart handoff; no order |
| Workspace B2B smoke (backend) | **pass** on `release-24be9ca` (assistant-only change after that) |
| Household smoke (backend) | **pass** on `release-0d7d884`, includes assistant thread, mention and escalation path |

Screenshots: `evidence/CHG-073/screenshots/` — home rails, 360 dock, assistant thread/reply, cart review and cart page, plus B2B assistant/review/cart. The handoff screenshots are also linked from CHG-072 evidence.

## Deployment

| Item | Value |
|---|---|
| Frontend | `https://buildkart-staging.web.app`, commit/build `cb787c6` (revision 3 UI) |
| Workspace service | `/opt/buildkart-releases/release-0d7d884`; `current` points there |
| Workspace schema | assistant kind + lazily ensured assistant channel; re-applied on boot |
| User-created household project | `x` retained; not test data |
| Arjun fixture draft | v22, approval current after the final Chrome check |
| Production authorized | **No** |

## Open decisions

| Decision | State |
|---|---|
| Automated, human or both | **Decided:** automated with human escalation |
| Which model/provider? | **Resolved for Phase C:** none; deterministic on-platform rules |
| May conversation content leave the platform? | **No** in Phase C; a model-backed assistant needs a new review |
| Assistant thread model | One assistant channel per workspace plus `@assistant` mentions |
| Discuss label on PDP/cart | Keep labelled; decided and implemented |
| Human escalation owner | Still open; the assistant directs the user to the owner/buyer |

## Safety boundaries

- Phase A (UX polish and in-chat picker) has no assistant and no commerce write.
- Phase B (assistant design) is governance only.
- Phase C (assistant implementation) is deterministic, read-only and has no external provider.
- Phase D (assistant cart preparation) is not implemented. The human cart handoff is CHG-072 Phase E.
- The assistant never bypasses owner, buyer or approver rules.
- Assistant messages are auditable through `activity_event`; the assistant writes only its own message.

## Approval state

| Item | Value |
|---|---|
| Approval required | Yes |
| Approved scope | Phases A–C (deterministic assistant) |
| Approved by | human-requester |
| Approved at | 2026-10-21 |
| Phase C assistant implementation | **Authorized and staging-verified** |
| Production authorized | No |

