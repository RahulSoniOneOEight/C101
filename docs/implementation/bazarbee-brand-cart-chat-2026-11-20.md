# BazarBee brand, cart-channel guard and chat race — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-064202` · API
`release-api-20261120-064642` · Workspace `release-workspace-20261120-062701` · Flutter web
`app-staging` rebuilt 20 Nov 2026 (backup `web.bak-brand-20261120-064923`)
Production: untouched.

This is the implementation pass for points 1–4 of
`docs/implementation/bazarbee-pending-2026-11-20.md`.

## 1. BuildKart → BazarBee branding

### 1.1 User-visible source changes

| Surface | Change |
|---|---|
| Web order fallbacks | `apps/web/app/orders/{page.tsx,[id]/page.tsx,[id]/returns/new/page.tsx}` now use “BazarBee order” |
| Experience API seed copy | “Welcome to BazarBee” (EN + HI), “Join the BazarBee trade program” |
| Storefront layout seed | “Why BazarBee” |
| Merchandising presets | BazarBee trade-program preset |
| Workspace assistant | `BazarBee Cart Assistant` in creation code and seed schema |
| Workspace demo seller | `BazarBee Direct` |
| Flutter account | `support@gobazarbee.com`, “Offers from BazarBee and sellers”, `bazarbee_<invoice>.pdf` |
| Flutter refresh page | BazarBee title/copy; Firebase URL kept intact |
| Push notification copy | “BuildKart” replaced with “BazarBee” in all template bodies |
| Ops console | HTML title and heading now “BazarBee Ops” |
| Tryton company party | `BazarBee India` (existing party row updated) |
| Android app label | `BazarBee Staging` |
| CMS admin display name | `BazarBee CMS` |

### 1.2 Staging data update

- `channel.name`: 5 old assistant channels → `BazarBee Cart Assistant`; 6 total assistant channels now use the new name.
- `message.actor_name`: 17 historical assistant messages → `BazarBee Cart Assistant`.
- CMS `admin_users`: display name → `BazarBee CMS`.
- Experience API `PILOT_USERS_JSON`: `pilot_superadmin01` display name → `BazarBee Super Admin`;
  previous env backed up as `/etc/buildkart/secrets/experience-api.env.bak-brand-20261120`.
- Tryton `party_party` company party → `BazarBee India`.

### 1.3 Verification

- `GET /v1/content/app-shell?locale=en-IN` returns `Welcome to BazarBee` and
  `Join the BazarBee trade program`.
- Hindi app-shell returns `BazarBee में आपका स्वागत है`.
- Workspace DB: 0 old assistant channel names, 0 old assistant message authors.
- `app-staging.pinakaplay.cloud` serves the rebuilt bundle (HTTP 200); `main.dart.js` contains
  `support@gobazarbee.com`, `BazarBee Cart Assistant`, `bazarbee_` invoice prefix and no
  `BuildKart Cart Assistant`.
- Flutter app-staging web bundle rebuilt and deployed (`app-staging.pinakaplay.cloud`), with the
  previous bundle backed up at
  `/opt/buildkart-flutter/web.bak-brand-20261120-064923`.
- Flutter brand tests (six files) all pass:
  - `b2b_home_header_test.dart`
  - `b2c_benchmark_ux_test.dart`
  - `conversation_dock_test.dart`
  - `home_scroll_test.dart`
  - `home_banner_carousel_test.dart`
  - `widget_test.dart`

### 1.4 Deliberately kept

Database names, cookies, environment variables, container/release paths and the Firebase
project remain unchanged; renaming them is a migration, not a copy edit. The planned Tryton module
can adopt `bazarbee_accounting` when it is created.

## 2. Mixed Shop/Trade cart guard

### 2.1 Behaviour

- `addToCart` now returns a typed result and rejects a cross-channel add **before** merging.
- The existing basket is preserved; a fixed toast explains which channel owns the cart.
- Checkout computes a single homogeneous channel. A legacy mixed basket shows a blocking notice
  and disables `Place order`.
- The quote and checkout API routes validate line-level channels and the request channel; a
  mismatch returns `400`.
- The Experience API now rejects a B2B cart request from a session without a `b2b_*` role
  (`403 trade-access-required`), so channel selection cannot grant trade entitlement.
- `quoteCart` / `completeCheckout` repeat the homogeneous-channel check server-side in the web BFF.

### 2.2 Verification

- Shop add keeps `1` item, channel `b2c`.
- Subsequent Trade add leaves the cart at `1` item and shows:
  “Your cart is in Shop. Remove those items before adding a Trade item. Your cart was not changed.”
- Synthetic mixed basket at `/checkout`: blocking notice shown, `Place order` disabled.
- Valid B2B order `BK-261120-3KKQZZ` (₹514.05) succeeded; Tryton `tryton_move_62` committed,
  reconciliation `true`.
- Valid B2C orders `BK-261120-CC8W80` and the preceding B2C re-run succeeded; Tryton moves
  `63`/`64` committed, reconciliation `true`.

Screenshots: `brand-cart-01-conflict.png`, `brand-cart-02-mixed-checkout.png`,
`brand-cart-03-b2c-order.png`.

## 3. Flutter chat channel-switch race

- `_selectTab` discards a late response if the active channel changed.
- `_pollMessages` captures the initiating channel/cursor and discards the result if the active
  channel changed; read state is marked for the captured channel.
- `_send` clears the composer but does not append the sent message or advance the cursor when the
  user has switched tabs/workspaces.
- `_loadWorkspace` loads the channel matching the requested tab and refuses to commit if the tab
  changed while loading.
- `_markRead` receives the explicit channel rather than re-reading the active tab.

Regression test added: **“late chat response cannot overwrite the assistant tab”** uses a
`Completer` gate to hold a Chat response while switching to Assistant; the late response is
discarded. `conversation_dock_test.dart` passes 11/11.

## 4. Remaining / not claimed

- Direct Experience API callers can still build a mixed cart; the guard is enforced in the web BFF
  and web UI. A future service-level offer/channel check should close that path.
- The Flutter web bundle is live; the Android APK has not been rebuilt or redistributed in this
  pass.
- C101 finance gates and A2–A5 remain unchanged: no invoices, journals, clearing, payouts,
  `account_payment` or `bazarbee_accounting` module.
- B2B Bought Together still needs an active `b2b`/`both` pair.
- All-21 tester login smoke still needs each human tester’s OTP access.
- Ratings/reviews and the local market-comparison fixture remain product decisions.

## 5. Commits and rollback

- Source commits: `0527013` (Ops console + Tryton company rename), `ccd141a` (BazarBee logo
  assertion), `59c980b` (`fix(bazarbee): finish brand copy and enforce trade cart entitlement`),
  `86345bb` (`feat(bazarbee): brand rename, cart channel guard and chat race fix`).
- Rollback: redeploy web `release-web-20261120-054221`, API `release-api-20261120-055757`,
  workspace `release-workspace-20261120-062701` is the first branded workspace image; the
  workspace schema/data change is additive and can be reverted with the previous image plus the
  old channel/message names.
