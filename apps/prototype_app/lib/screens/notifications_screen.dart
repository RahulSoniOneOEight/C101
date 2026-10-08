import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/app_notification.dart';
import '../providers/notifications_providers.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({
    this.audience = NotificationAudience.b2c,
    this.loadOnOpen = true,
    super.key,
  });

  final NotificationAudience audience;
  final bool loadOnOpen;

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.loadOnOpen) Future<void>.microtask(_refresh);
  }

  Future<void> _refresh() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      await ref.read(notificationsProvider.notifier).refresh();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load notifications. Pull to retry.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final items = ref.watch(notificationsForAudienceProvider(widget.audience));
    final unread = items.where((notification) => !notification.read).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: <Widget>[
          if (unread > 0)
            TextButton(
              onPressed: () async {
                try {
                  await ref
                      .read(notificationsProvider.notifier)
                      .markAllRead(widget.audience);
                } catch (_) {
                  if (context.mounted) _showFailure(context);
                }
              },
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _body(context, items, colors),
      ),
    );
  }

  Widget _body(
      BuildContext context, List<AppNotification> items, AgencyColors colors) {
    if (_loading && items.isEmpty) {
      return ListView(children: const <Widget>[
        SizedBox(height: 240),
        Center(child: CircularProgressIndicator()),
      ]);
    }
    if (_error != null && items.isEmpty) {
      return ListView(children: <Widget>[
        const SizedBox(height: 180),
        Icon(Icons.cloud_off_outlined, color: colors.contentSecondary),
        const SizedBox(height: AgencySpacing.sm),
        Center(
            child: Text(_error!,
                style: TextStyle(color: colors.contentSecondary))),
      ]);
    }
    if (items.isEmpty) {
      return ListView(children: <Widget>[
        const SizedBox(height: 220),
        Center(
            child: Text('No notifications yet',
                style: TextStyle(color: colors.contentSecondary))),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.all(AgencySpacing.md),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: AgencySpacing.sm),
      itemBuilder: (context, index) => _tile(context, items[index], colors),
    );
  }

  Widget _tile(
      BuildContext context, AppNotification notification, AgencyColors colors) {
    return InkWell(
      onTap: () async {
        try {
          await ref
              .read(notificationsProvider.notifier)
              .markRead(notification.id);
          if (context.mounted && notification.deepLink != null) {
            context.push(notification.deepLink!);
          }
        } catch (_) {
          if (context.mounted) _showFailure(context);
        }
      },
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: notification.read
              ? colors.surfaceRaised
              : colors.surfaceInteractive,
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
                    borderRadius: BorderRadius.circular(AgencyRadius.md)),
                child: Icon(notification.icon,
                    size: 20, color: colors.actionPrimary),
              ),
              const SizedBox(width: AgencySpacing.md),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                    Row(children: <Widget>[
                      Expanded(
                          child: Text(notification.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: colors.contentPrimary))),
                      const SizedBox(width: AgencySpacing.xs),
                      Text(notification.timeLabel,
                          style: TextStyle(
                              fontSize: 11, color: colors.contentSecondary)),
                      if (!notification.read) ...<Widget>[
                        const SizedBox(width: AgencySpacing.xs),
                        Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                                color: colors.actionPrimary,
                                shape: BoxShape.circle)),
                      ],
                    ]),
                    const SizedBox(height: 2),
                    Text(notification.body,
                        style: TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            color: colors.contentSecondary)),
                  ])),
            ]),
      ),
    );
  }

  void _showFailure(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
          content: Text('Could not update notification. Try again.')),
    );
  }
}
