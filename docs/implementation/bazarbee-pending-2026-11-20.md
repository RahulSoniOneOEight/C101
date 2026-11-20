# BazarBee pending work — points 1–4

**Date:** 20 November 2026  
**Scope:** the four pending areas from the staging review: brand rename, C101/Tryton, commerce/product, chat.  
**Out of scope:** production authorization and cutover (tracked separately as point 5).  
**Status:** staging only; production untouched.

**Implementation update (20 Nov 2026):** branding strings, stale Flutter tests, the mixed-channel
cart guard, the Flutter chat channel-switch race, B2B Bought Together, the web chat shared-list,
read-cursor and invitation flows, the web draft-edit/proposal/cart-build flows, and web guest
checkout are implemented. The Flutter chat flows were audited and verified (17/17 tests); the
remaining chat gaps are web member removal/role changes, revision approval requests, unread refresh
and tab-strip keyboard navigation. See `bazarbee-brand-cart-chat-2026-11-20.md`,
`bazarbee-b2b-bought-together-2026-11-20.md`, `bazarbee-web-chat-shared-list-2026-11-20.md`,
`bazarbee-web-chat-invitations-2026-11-20.md`,
`bazarbee-web-chat-draft-cart-2026-11-20.md` and
`bazarbee-web-guest-checkout-2026-11-20.md`. The remaining items below are still pending.

Already completed and excluded from this list: dual-channel access for all 21 testers, the super-admin access editor, B2C/B2B cart tagging, B2C Tryton reservation/reconciliation, and the DeepSeek Pro QC follow-ups.

---

## 1. Brand rename: BuildKart → BazarBee

### 1.1 User-visible strings

| Where | Pending change |
|---|---|
| `apps/web/app/orders/page.tsx:73` | fallback `"BuildKart order"` → `"BazarBee order"` |
| `apps/web/app/orders/[id]/page.tsx:49` | fallback `"BuildKart order"` → `"BazarBee order"` |
| `apps/web/app/orders/[id]/returns/new/page.tsx:56` | fallback `"BuildKart order"` → `"BazarBee order"` |
| `services/experience-api/src/content/app-content.ts:38` | `"Welcome to BuildKart"` → `"Welcome to BazarBee"` |
| `services/experience-api/src/content/app-content.ts:50` | Hindi welcome title still uses BuildKart |
| `services/experience-api/src/content/app-content.ts:171` | `"Join the BuildKart trade program"` → `"Join the BazarBee trade program"` |
| `services/experience-api/src/content/storefront-layout.ts:131` | `"Why BuildKart"` → `"Why BazarBee"` |
| `services/backend/packages/api/src/staging-merchandising/presets.ts:318` | `"Join the BuildKart trade program"` → BazarBee |
| `services/workspace/src/index.ts:291,362,708,718` | assistant name `"BuildKart Cart Assistant"` → `"BazarBee Cart Assistant"`; existing channel rows need a data update |
| `apps/prototype_app/lib/screens/account_screens.dart:1043` | `support@buildkart.example` → BazarBee support address |
| `apps/prototype_app/lib/screens/account_screens.dart:1326` | `"Offers from BuildKart and sellers"` → BazarBee |
| `apps/prototype_app/lib/screens/account_screens.dart:916` | invoice filename `buildkart_<number>.pdf` → `bazarbee_<number>.pdf` |
| `apps/prototype_app/web/refresh.html:7,11,15,40` | “Refresh BuildKart staging” and BuildKart Firebase links |
| CMS `admin_users` row | display name `"BuildKart CMS"` |

Published CMS content is clean: a staging CMS data dump found only the CMS admin user's display name containing “BuildKart”.

### 1.2 Tests and documentation

- Flutter tests still assert the old brand:
  - `apps/prototype_app/test/b2b_home_header_test.dart:18` — `BuildKart Trade`
  - `apps/prototype_app/test/b2c_benchmark_ux_test.dart:327` — `BuildKart staging collection desk`
  - `apps/prototype_app/test/conversation_dock_test.dart:49,63,477,478` — `BuildKart Cart Assistant`
  - `apps/prototype_app/test/widget_test.dart:67` — `BuildKart`
- The C101 plan on the Desktop is still titled BuildKart:
  - `C:\Users\LENOVO\Desktop\BuildKart-C101-Implementation-Plan-r2.2-2026-11-19.md`
  - matching `.docx`
- Current docs/spec should use BazarBee. Historical evidence docs may keep BuildKart as a historical record.

### 1.3 Do not rename blindly

These are technical identifiers. Renaming them is a migration, not a text edit:

- databases: `buildkart`, `buildkart_experience`, `buildkart_workspace`, `buildkart_tryton`, `buildkart_cms`
- cookies: `buildkart_pilot_session`, `buildkart_pilot_challenge`
- environment variables: `BUILDKART_*`
- containers/releases: `buildkart-hosted-pilot-*`, `/opt/buildkart-releases`
- Firebase project: `buildkart-staging`
- planned Tryton module: `buildkart_accounting`; because it is not built yet, this is the easiest one to rename to `bazarbee_accounting`

---

## 2. C101 / Tryton

| Priority | Pending item |
|---|---|
| P0 | Finance sign-off on **P-GATE-01/02/04**: principal vs agent, invoice authority, recognition/settlement policy |
| P0 | Install `account_payment` and `account_statement` on a restored copy; define clearing accounts (**P-GATE-07**) |
| P0 | Scaffold `bazarbee_accounting` (or `buildkart_accounting`) with the event inbox/source links; move logic out of the API adapter |
| P0 | A2: Tryton invoice/credit-note generation, immutable document links, order-level payment link, payment clearing |
| P0 | Per-user Tryton session and maker-checker (**P-GATE-06**) |
| P1 | A3: commission/settlement/payout, three-way reconciliation, duplicate-payout protection |
| P1 | A4: B2B receivables, credit exposure vs Tryton AR, project/site/cost-centre dimensions |
| P1 | A5: period close, statutory localization, backup/restore, production-readiness pack |
| P1 | Normalize Medusa's sub-paise internal order total (example: `514.055`) or quarantine it as a known control-total difference |
| P1 | Per-line reservation ledger for operator stock views; Tryton is authoritative, but the platform ledger only records the legacy single-line path |
| P1 | Link payment collections to the order (`order_payment_collection`); they are currently cart-scoped |
| P1 | Mixed-channel cart guard: a Shop line can currently be added to a Trade cart, and checkout treats the whole cart as B2B |
| P2 | B2B payment capture; current orders are authorized with `captured_amount = 0` |

---

## 3. Commerce and product

- **B2B Bought Together** - implemented: trade PDP renders the active B2B pair with trade pricing,
  MOQ and a link. Staging pair seeded by `services/hosted/scripts/seed-b2b-bought-together.sql`.
- **Web guest checkout** - implemented: Shop orders can be placed without sign-in, with email,
  Indian mobile, delivery address and an idempotent completion key; B2B still requires sign-in.
  Guest contact is stored on the order. Guest order tracking/email is still pending. See
  `bazarbee-web-guest-checkout-2026-11-20.md`.
- **Razorpay prepaid checkout** — staging B2C web flow is verified end to end with test cards,
  including signature verification, capture, status polling and order completion. The B2B prepaid
  server path is built but not browser-tested; Razorpay webhooks, refunds and Flutter SDK integration
  remain pending. See `bazarbee-razorpay-web-checkout-2026-11-20.md`.
- **Ratings/reviews** — the Experience API exposes no rating data. Decide whether to build a ratings source or explicitly drop the feature.
- **Market comparison** — Flutter uses a local staging fixture. Decide whether to port it as explicitly labelled fixture data or drop it.
- **Per-user business isolation** — all consumer testers currently share `business_bazarbee_pilot`. Fine for staging, not a production model.
- **All-21 login smoke** — roles are correct in the database, but only the super-admin and a B2B buyer were signed in during QC. The remaining testers still need an OTP/login smoke test.
- **B2C/B2B channel switch persistence** — path-based today; consider remembering the last channel per user/browser.

---

## 4. Chat

The Flutter dock already includes the shared-list tab, invitations/participant management, draft
proposals, the cart-build sheet and read cursors; `conversation_dock_test.dart`,
`cart_build_sheet_test.dart` and `workspace_screen_test.dart` pass 17/17.

The **web** drawer now has a shared-list view, read cursors/unread badges, invitation
creation/revocation with seat counts, multi-draft selection, quantity/remove edits with proposal
decisions, and a cart-build review that revalidates price, stock, seller and MOQ before adding to
the retail cart or trade quotation cart. The build result links to the appropriate cart/quote
page; it never submits an order. Remaining web gaps:

- participant removal and role changes (no member-list/remove API)
- revision approval request UI (cart build reads approval state but the web cannot request it)
- unread refresh while the drawer is open on another channel
- arrow-key navigation in the tab strips
- richer product-reference cards for app-originated shares

---

## Suggested order

1. Brand strings and stale tests (low risk, visible immediately).
2. Mixed-channel cart guard and order-level payment link.
3. Finance gates and `account_payment` rehearsal before any invoice/clearing work.
4. Chat dock parity and the remaining commerce decisions.
