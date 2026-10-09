import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../domain/app_notification.dart';

/// Authenticated persistent notification inbox. The backend is authoritative;
/// optimistic read-state updates roll back if persistence fails.
class NotificationsNotifier extends Notifier<List<AppNotification>> {
  @override
  List<AppNotification> build() => const <AppNotification>[];

  Future<void> refresh() async {
    state = await ref.read(experienceApiProvider).getNotifications();
  }

  Future<void> markRead(String id) async {
    final before = state;
    state = <AppNotification>[
      for (final notification in state)
        notification.id == id
            ? notification.copyWith(read: true)
            : notification,
    ];
    try {
      await ref.read(experienceApiProvider).markNotificationRead(id);
    } catch (_) {
      state = before;
      rethrow;
    }
  }

  Future<void> markAllRead(NotificationAudience audience) async {
    final before = state;
    state = <AppNotification>[
      for (final notification in state)
        notification.audience == audience
            ? notification.copyWith(read: true)
            : notification,
    ];
    try {
      await ref.read(experienceApiProvider).markAllNotificationsRead();
    } catch (_) {
      state = before;
      rethrow;
    }
  }
}

final notificationsProvider =
    NotifierProvider<NotificationsNotifier, List<AppNotification>>(
  NotificationsNotifier.new,
);

final unreadNotificationsProvider =
    Provider.family<int, NotificationAudience>((ref, audience) {
  return ref
      .watch(notificationsProvider)
      .where((notification) =>
          notification.audience == audience && !notification.read)
      .length;
});

final notificationsForAudienceProvider =
    Provider.family<List<AppNotification>, NotificationAudience>(
        (ref, audience) {
  final list = ref
      .watch(notificationsProvider)
      .where((notification) => notification.audience == audience)
      .toList();
  // Surface the recent commercial nudges (price drop / new arrival) first, then
  // newest-first.
  int rank(AppNotification n) => switch (n.kind) {
        NotificationKind.deal || NotificationKind.launch => 0,
        _ => 1,
      };
  list.sort((a, b) {
    final byRank = rank(a).compareTo(rank(b));
    if (byRank != 0) return byRank;
    final at = a.createdAt;
    final bt = b.createdAt;
    if (at == null && bt == null) return 0;
    if (at == null) return 1;
    if (bt == null) return -1;
    return bt.compareTo(at);
  });
  return list;
});
