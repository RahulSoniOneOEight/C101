# CHG-073 — conversation refinements and cart assistant

**Environment:** staging only

**Production:** unauthorized

**Status:** Phase A complete and deployed. Phase B assistant design complete in
`ADR-client101-013`. Phase C assistant implementation is **not authorized**. Cart handoff remains
Phase E.

## Implemented in Phase A

### Discuss icon

- Icon-only on catalogue tiles, compact cards and search results.
- 44dp hit target with a 26–28dp visual circle aligned to the wishlist control.
- Accessible `Discuss` label and a long-press hint.
- PDP and cart-line actions remain labelled `Discuss`.

### Header entry

- A compact conversation icon immediately beside the notification bell.
- Unread badge driven by the existing workspace unread projection.
- The bottom floating launcher is removed.
- Search, PDP, Cart and the B2B catalogue/offers/cart/PDP app bars carry the same action.
- The B2B header entry now opens the dock; the full workspace remains available inside the dock.

### In-chat add product

- The composer has an `Add product` action; the shared list has the same action.
- It opens a catalogue picker with title, brand and SKU search.
- Selecting a product uses the existing capture path:
  - owner / buyer / admin: accepted line and new revision;
  - participant: pending add-line proposal;
  - approver: chat share only.
- Duplicate variants are not added twice.
- No cart or order write.

### Assistant design (Phase B)

`ADR-client101-013` records the accepted design: an **automated assistant with human escalation**.

- Distinct, clearly labelled participant — never presented as a human.
- Mentionable with `@assistant` and available in a separate assistant thread.
- Read-only capabilities for the first implementation:
  - summarise the shared list;
  - flag missing quantities, MOQ or seller information;
  - suggest alternatives or next actions;
  - request human escalation.
- Explicitly prohibited:
  - accepting proposals or approvals;
  - inviting or changing membership;
  - seeing owner-only address, phone, GST, payment or checkout data;
  - writing a cart or creating an order.
- Any future cart preparation remains read-only until Phase E is authorized. The owner or buyer must
  still perform the explicit cart build after revalidation and acknowledgement.
- Provider, residency and retention decisions remain open and block Phase C implementation.

## Verification

| Check | Result |
|---|---|
| `flutter analyze` | **pass** |
| `flutter test` (app) | **pass**, 262 tests |
| `flutter test` (`agency_flutter_ui`) | **pass**, 54 tests, 27 skipped golden captures |
| Golden snapshots | refreshed; reviewed the icon/header changes |
| `flutter build web --release` (staging defines) | **pass** |
| Chrome 390×844 and 360×800 | **pass 95/95** |
| Console errors | none |
| Header entry beside the bell | pass in both channels |
| In-chat product picker | pass; product added from Chat at both sizes |
| Cart CTA obstruction | none; bottom launcher removed |
| Commerce write / order creation | none |

Screenshots: `evidence/CHG-073/screenshots/`.

## Deployment

| Item | Value |
|---|---|
| Frontend | `https://buildkart-staging.web.app`, Phase A commit `fe3e947` |
| Workspace / Experience API | `/opt/buildkart-releases/release-68ee397` (unchanged backend) |
| User-created household project | `x` retained; not test data |
| Arjun fixture draft | advanced by the picker capture during Chrome review |
| Production authorized | **No** |

## Open decisions

| Decision | State |
|---|---|
| Automated, human or both | **Decided:** automated with human escalation |
| Which model/provider? | Open — blocks Phase C |
| May conversation content leave the platform? | Open — privacy review required |
| Assistant thread model | Mention plus a separate assistant thread |
| Discuss label on PDP/cart | Keep labelled; decided and implemented |

## Safety boundaries

- Phase A (UX polish and in-chat picker) has no assistant and no commerce write.
- Phase B (assistant design) is governance only.
- Phase C (assistant implementation) is read-only.
- Phase D (assistant cart preparation) depends on explicit Phase E authorization.
- The assistant never bypasses owner, buyer or approver rules.
- All assistant messages and tool calls must be auditable.

## Approval state

| Item | Value |
|---|---|
| Approval required | Yes |
| Approved scope | Phase A and Phase B design only |
| Approved by | human-requester |
| Phase C assistant implementation | **Not authorized** |
| Production authorized | No |
