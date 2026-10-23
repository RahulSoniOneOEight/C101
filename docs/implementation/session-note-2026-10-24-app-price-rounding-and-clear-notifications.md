# Customer app — whole-unit prices and clear notifications

Date: 2026-10-24
Lane: B — Flutter UI plus Experience API, no schema change
Release: `377e946`
Environment: staging only

## Outcome

- All customer-facing prices now display as whole currency units, rounded up.
- The notification inbox now has a **Clear notifications** action with confirmation.
- Clearing notifications removes the authenticated user's inbox records; it does not change
  orders, payments or other domains.

## Price rounding

`Money.formatted` is the shared formatter used across B2C and B2B. It now uses:

```dart
final major = amount / 100;
final text = major.ceil().toString();
```

Examples:

| Canonical amount | Display |
|---|---|
| ₹100.00 | ₹100 |
| ₹100.01 | ₹101 |
| ₹100.99 | ₹101 |
| ₹9.99 | ₹10 |

Canonical amounts, cart totals, checkout totals, taxes, refunds and stored minor units are
unchanged. Rounding is presentation-only.

## Clear notifications

### UI

- Added a trash action to the Notifications app bar when the inbox has items.
- The action opens a confirmation dialog:
  - title: `Clear notifications?`
  - body: `This removes all notifications from this inbox.`
  - actions: `Cancel`, `Clear`
- After success, the inbox shows its empty state and a `Notifications cleared` snackbar.
- Local removal is optimistic and rolls back if persistence fails.

### API

- Added `DELETE /v1/me/notifications`.
- `NotificationStore.clearAll(userId)` deletes only that authenticated user's inbox rows.
- Delivery-attempt rows cascade from the existing foreign key.
- The legacy `/v1/notifications` alias accepts the same authenticated delete request.

## Files

- `apps/prototype_app/lib/domain/models.dart`
- `apps/prototype_app/lib/data/experience_api.dart`
- `apps/prototype_app/lib/providers/notifications_providers.dart`
- `apps/prototype_app/lib/screens/notifications_screen.dart`
- `apps/prototype_app/test/money_format_test.dart`
- `apps/prototype_app/test/notifications_test.dart`
- `apps/prototype_app/test/goldens/notifications_b2b.png`
- `apps/prototype_app/test/goldens/product_detail.png`
- `apps/prototype_app/test/goldens/b2b_checkout.png`
- `services/experience-api/src/index.ts`
- `services/experience-api/src/store/notification-store.ts`
- `services/experience-api/src/scripts/notification-test.ts`

## Verification

Checks:

- `flutter analyze`: no issues.
- `flutter test`: all 273 tests pass.
- `flutter build web --release` with staging dart-defines: pass.
- Experience API `bun run typecheck`: pass.
- No schema or dependency change.

Live staging API:

- Authenticated as an allowlisted pilot customer.
- `GET /v1/me/notifications` returned 50 items (the page limit).
- `DELETE /v1/me/notifications` returned `cleared: 115`.
- Follow-up `GET` returned zero notifications.

Live web app (`https://buildkart-staging.web.app`):

- B2C catalogue prices render as whole integers:
  - `₹3990`, `₹6669`, `₹7065`, `₹136`, `₹2867`.
- B2B quick-order prices render as whole integers:
  - `₹6077`, `₹1063`, `₹369`, `₹3015`.
- B2B notification inbox shows the clear action in the app bar.
- Clear action opens the confirmation dialog.
- No console errors were observed.

Screenshots:

- `client-projects/client101/evidence/CHG-018/app-prices-rounded-up.png`
- `client-projects/client101/evidence/CHG-018/app-notifications-clear-action.png`
- `client-projects/client101/evidence/CHG-018/app-notifications-clear-dialog.png`

## Residual limitations

- Clear is an inbox-wide action, not per-notification swipe/dismiss.
- Clearing the inbox does not remove already-delivered OS-level push notifications from the device
  tray.
- Rounding up can make displayed prices differ from the exact canonical amount by less than one
  currency unit; checkout and payment continue to use canonical amounts.
- Production remains unauthorized.

## Staging

- Experience API release: `/opt/buildkart-releases/release-377e946`
- Customer web: `https://buildkart-staging.web.app`
