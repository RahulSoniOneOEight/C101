import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/app_notification.dart';
import '../providers/notifications_providers.dart';

/// The in-app notification centre, shared by the consumer (B2C) and trade (B2B)
/// modes. Shows the audience's notifications, read/unread state, and lets the
/// buyer mark all as read.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen(
      {this.audience = NotificationAudience.b2c, super.key});

  final NotificationAudience audience;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final items = ref.watch(notificationsForAudienceProvider(audience));
    final unread = items.where((n) => !n.read).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: <Widget>[
          if (unread > 0)
            TextButton(
              onPressed: () => ref
                  .read(notificationsProvider.notifier)
                  .markAllRead(audience),
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: items.isEmpty
          ? Center(
              child: Text('No notifications yet',
                  style: TextStyle(color: colors.contentSecondary)),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(AgencySpacing.md),
              itemCount: items.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: AgencySpacing.sm),
              itemBuilder: (context, i) => _tile(context, ref, items[i], colors),
            ),
    );
  }

  Widget _tile(BuildContext context, WidgetRef ref, AppNotification n,
      AgencyColors colors) {
    return InkWell(
      onTap: () => ref.read(notificationsProvider.notifier).markRead(n.id),
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: n.read ? colors.surfaceRaised : colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(AgencyRadius.md),
              ),
              child: Icon(n.icon, size: 20, color: colors.actionPrimary),
            ),
            const SizedBox(width: AgencySpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(n.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: colors.contentPrimary)),
                      ),
                      const SizedBox(width: AgencySpacing.xs),
                      Text(n.timeLabel,
                          style: TextStyle(
                              fontSize: 11, color: colors.contentSecondary)),
                      if (!n.read) ...<Widget>[
                        const SizedBox(width: AgencySpacing.xs),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: colors.actionPrimary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(n.body,
                      style: TextStyle(
                          fontSize: 12,
                          height: 1.35,
                          color: colors.contentSecondary)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
