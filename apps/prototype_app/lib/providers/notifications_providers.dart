import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/app_notification.dart';

/// The in-app notification centre. Holds both audiences; the UI filters by
/// [NotificationAudience]. Read state is in-memory for now (a backend feed
/// would replace the seed).
class NotificationsNotifier extends Notifier<List<AppNotification>> {
  @override
  List<AppNotification> build() => _seed;

  void markRead(String id) {
    state = <AppNotification>[
      for (final n in state) n.id == id ? n.copyWith(read: true) : n,
    ];
  }

  void markAllRead(NotificationAudience audience) {
    state = <AppNotification>[
      for (final n in state)
        n.audience == audience ? n.copyWith(read: true) : n,
    ];
  }
}

final notificationsProvider =
    NotifierProvider<NotificationsNotifier, List<AppNotification>>(
        NotificationsNotifier.new);

/// Unread count for a given audience (drives the header badge).
final unreadNotificationsProvider =
    Provider.family<int, NotificationAudience>((ref, audience) {
  return ref
      .watch(notificationsProvider)
      .where((n) => n.audience == audience && !n.read)
      .length;
});

final notificationsForAudienceProvider =
    Provider.family<List<AppNotification>, NotificationAudience>((ref, a) {
  return ref.watch(notificationsProvider).where((n) => n.audience == a).toList();
});

const List<AppNotification> _seed = <AppNotification>[
  // ---- Consumer (B2C) ----
  AppNotification(
    id: 'n_b2c_delivery',
    audience: NotificationAudience.b2c,
    title: 'Your order is out for delivery',
    body: 'Order #BK-10428 arrives today by 7 PM.',
    timeLabel: '2h',
    kind: NotificationKind.order,
  ),
  AppNotification(
    id: 'n_b2c_flash',
    audience: NotificationAudience.b2c,
    title: 'Flash Deals just dropped',
    body: 'Up to 60% off on tools and building materials.',
    timeLabel: '5h',
    kind: NotificationKind.offer,
  ),
  AppNotification(
    id: 'n_b2c_price',
    audience: NotificationAudience.b2c,
    title: 'Price drop on your wishlist',
    body: 'Ceramic Floor Tiles 600x600 Matt is now ₹1,150.',
    timeLabel: '1d',
    kind: NotificationKind.offer,
  ),
  AppNotification(
    id: 'n_b2c_welcome',
    audience: NotificationAudience.b2c,
    title: 'Welcome to BuildKart',
    body: 'Shop across 10 sellers with one cart and simple returns.',
    timeLabel: '2d',
    kind: NotificationKind.system,
    read: true,
  ),
  // ---- Trade (B2B) ----
  AppNotification(
    id: 'n_b2b_quote',
    audience: NotificationAudience.b2b,
    title: 'Quotation received',
    body: '3 sellers responded to RFQ-2841 (bathroom fittings, 5 items).',
    timeLabel: '1h',
    kind: NotificationKind.order,
  ),
  AppNotification(
    id: 'n_b2b_credit',
    audience: NotificationAudience.b2b,
    title: 'Credit limit updated',
    body: 'Your available trade credit is now ₹4.2L.',
    timeLabel: '6h',
    kind: NotificationKind.credit,
  ),
  AppNotification(
    id: 'n_b2b_scheme',
    audience: NotificationAudience.b2b,
    title: 'Monsoon scheme is live',
    body: 'Buy 100 Get 5 Free on select plumbing & paints.',
    timeLabel: '1d',
    kind: NotificationKind.offer,
  ),
  AppNotification(
    id: 'n_b2b_gst',
    audience: NotificationAudience.b2b,
    title: 'GST invoice ready',
    body: 'Invoice for Order #PO-3391 is available to download.',
    timeLabel: '3d',
    kind: NotificationKind.account,
    read: true,
  ),
];
