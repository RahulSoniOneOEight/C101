# Session note — 2026-10-04 (c) — Welcome content + notifications (B2C & B2B)

## Inputs
1. **Welcome content**: headline, subtitle and three key benefits.
   - Headline: *"Everything you need, delivered to your site."*
   - Subtitle: *"Shop for your home or business—from everyday essentials to
     bulk building supplies."*
   - Benefits: Truck → *Delivery to your doorstep* / *Convenient delivery for
     home and project needs.*; % → *Better prices for every buyer* / *Retail
     deals and exclusive B2B trade pricing.*; Invoice → *Business buying made
     easy* / *GST invoices, eligible credit and flexible payments.*
2. **Notifications for both B2B and B2C.**

## Reuse / Modify / New
| Input | Component | R/M/N |
|---|---|---|
| Welcome content | `OnboardingScreen` | Modify |
| Notification model + feed | `AppNotification`, `notificationsProvider` | New |
| Notification centre | `NotificationsScreen` | New |
| Header bell + badge | `NotificationBell`; `B2BHeader` (+notifications) | New/Modify |

## Changes
- `lib/domain/app_notification.dart` — `NotificationAudience`, `NotificationKind`,
  `AppNotification` (icon per kind, `read`).
- `lib/providers/notifications_providers.dart` — `notificationsProvider`
  (audience-scoped seed for B2C and B2B), `unreadNotificationsProvider`,
  `notificationsForAudienceProvider`, `markRead` / `markAllRead`.
- `lib/screens/notifications_screen.dart` — shared centre: read/unread styling,
  unread dot, "Mark all read", per-audience feed.
- `lib/widgets/notification_bell.dart` — bell with unread badge → opens the
  centre for the audience.
- `lib/screens/b2c_flow_screens.dart` — onboarding rewritten with the headline,
  subtitle and three benefit rows (scroll-safe) + Get Started.
- `lib/screens/product_list_screen.dart` / `lib/screens/d2c_shell.dart` (Browse) —
  `NotificationBell` added to the B2C headers.
- `packages/agency_flutter_ui/lib/b2b_trade.dart` — `B2BHeader` gains
  `onNotificationsTap` + `notificationCount` (badged bell).
- `lib/screens/b2b_home_screen.dart` — wires the B2B bell + unread count.
- `lib/router/app_router.dart` — `/notifications?audience=b2b|b2c`.

## Verification
- `flutter analyze` clean (app + package); `flutter test` — app **48**,
  package **48** pass (new `notifications_test.dart`: audience scoping + unread
  tracking, B2B feed, welcome content; `d2c_cart_browse_test.dart` asserts the
  B2C bell).
- Emulator QA (medium_phone/API 36):
  - Onboarding shows the new headline/subtitle and the three benefits.
  - B2B header bell shows an unread badge (3) → the B2B centre lists
    Quotation received / Credit limit updated / Monsoon scheme / GST invoice.

## Assumptions / open
- Notification read state is in-memory (a backend feed would replace the seed).
- The B2C feed is covered by tests (emulator login automation kept landing in
  B2B); the bell/screen are the same shared components.
- Flutter-first per request (Penpot not updated).
