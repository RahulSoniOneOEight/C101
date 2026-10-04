import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/app_notification.dart';
import '../providers/notifications_providers.dart';

/// Bell action with an unread badge; opens the notification centre for the
/// given [audience]. Shared by the B2C and B2B headers.
class NotificationBell extends ConsumerWidget {
  const NotificationBell(
      {this.audience = NotificationAudience.b2c, super.key});

  final NotificationAudience audience;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(unreadNotificationsProvider(audience));
    return IconButton(
      tooltip: 'Notifications',
      onPressed: () => context.push('/notifications?audience=${audience.name}'),
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: const Icon(Icons.notifications_none),
      ),
    );
  }
}
