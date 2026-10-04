# Session note — 2026-10-04 (d) — B2C Account journeys completed

## Audit (before implementation)
The Account menu had 2 wired entries (My Orders, Wishlist — both static fixtures)
and 5 locked entries (Saved Addresses, Payment Methods, GST & Invoices,
Help & Support, Settings) shown with a lock icon + "not part of this prototype
yet" snackbar. Profile was a static header. My Orders/Wishlist had no detail,
mutation, persistence or states.

**Classification:** the 5 locked entries are **unfinished features on a consumer
account**, not role restrictions — a consumer owns all of them, so the lock
affordance was removed once each was implemented. Genuine restrictions (B2B
credit/approvals/team) are untouched.

**Integration contracts (no API wired):** addresses, payment methods, GST,
invoices and support tickets have no Medusa endpoint in this repo. Each is a
client-side repository over `LocalStore` (SharedPreferences) with dev fixtures
that seed once and persist; the contract is documented on each model.

| Journey | Existing screen | Before | Missing | Action |
|---|---|---|---|---|
| Profile | header only | static | view/edit name/email/mobile, validation, persistence | **Built** `ProfileScreen` |
| My Orders | `/orders` | 3 hardcoded cards | data-driven + tabs, **Order Detail**, cancel/return, states | **Rewrote** + `OrderDetailScreen` |
| Tracking | `/track` | hardcoded #12345 | per-order timeline | **Rewrote** param-driven |
| Wishlist | `/wishlist` | 4 hardcoded cards | persistence, remove, PDP, add-to-cart, empty | **Rewrote** |
| Saved Addresses | — | locked | CRUD + set default | **Built** |
| Payment Methods | — | locked | supported + saved, default/remove (no charges) | **Built** |
| GST & Invoices | — | locked | GST form + invoices + download | **Built** |
| Help & Support | — | locked | FAQ, contact, raise ticket, history/status | **Built** |
| Settings | — | locked | EN/HI, notifications, privacy, logout | **Built** |

## Implementation
- Domain: `domain/account_models.dart` (SavedAddress, PaymentMethod, GstDetails,
  Invoice, SupportTicket, AccountProfile, AppSettings), `domain/order_models.dart`
  (CustomerOrder/OrderLine/OrderEvent).
- Persistence: `LocalStore` extended (profile, addresses, wishlist, payments, GST,
  tickets, settings) with once-only seeding flags.
- Providers: `account_providers.dart`, `orders_providers.dart` (order cancel /
  return is a **backend business rule** surfaced as `cancelEligible`/
  `returnEligible` flags — the UI never guesses).
- Screens: `account_screens.dart` (Profile, Addresses, Payments, GST & Invoices,
  Help & Support, Settings); rewrote My Orders + Tracking + Wishlist in
  `b2c_flow_screens.dart`; rewrote `account_screen.dart`; routes added in
  `app_router.dart` (`/profile`, `/addresses`, `/payments`, `/gst-invoices`,
  `/help`, `/settings`, `/orders/:id`, `/track?order=`).
- Every journey has: back navigation, validated forms, persistence, loading/
  empty/success/error states, and destructive-action confirmations
  (`PinDialog.confirm` for delete/remove/cancel/return/logout).
- Payment Methods shows supported methods + saved cards. **No financial
  transaction is simulated**; the add-card form is display-only and states that
  tokenisation happens in the payment provider.
- Invoice download is **DEV-ONLY**: with no invoices endpoint it generates a
  local PDF of the invoice summary to the device temp dir and reports the path;
  it is clearly marked to be replaced by the signed `download_url`.

## Verification
- `flutter analyze` clean; `flutter test` — app **57** pass (new
  `account_journeys_test.dart`: address default/CRUD, wishlist toggle, order
  cancel, payment methods, GST+invoices, tickets, settings, profile, and a
  widget test that **every Account entry navigates**).
- Emulator QA (medium_phone/API 36): Account hub (all entries, no locks, bell
  badge, profile header), Saved Addresses (default/edit/delete/add),
  Settings (language/notifications/privacy/logout), My Orders (tabs + cards),
  Order Detail (items/totals/address/Cancel), GST & Invoices (form + list).

## Assumptions / open
- Fixture data is clearly development-only; each model documents its intended
  API contract.
- Hindi selection is persisted but full app localisation is out of scope here.
- Flutter-first per request (Penpot not updated).
