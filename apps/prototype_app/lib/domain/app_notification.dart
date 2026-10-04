import 'package:flutter/material.dart';

/// Audience a notification belongs to — mirrors the two app modes so the same
/// centre can serve both the consumer (B2C) and trade (B2B) experiences.
enum NotificationAudience { b2c, b2b }

/// Category of a notification — drives the leading icon.
enum NotificationKind { order, offer, credit, account, system }

/// A single in-app notification.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.audience,
    required this.title,
    required this.body,
    required this.timeLabel,
    this.kind = NotificationKind.system,
    this.read = false,
  });

  final String id;
  final NotificationAudience audience;
  final String title;
  final String body;
  final String timeLabel;
  final NotificationKind kind;
  final bool read;

  IconData get icon => switch (kind) {
        NotificationKind.order => Icons.local_shipping_outlined,
        NotificationKind.offer => Icons.percent,
        NotificationKind.credit => Icons.account_balance_wallet_outlined,
        NotificationKind.account => Icons.badge_outlined,
        NotificationKind.system => Icons.notifications_outlined,
      };

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        audience: audience,
        title: title,
        body: body,
        timeLabel: timeLabel,
        kind: kind,
        read: read ?? this.read,
      );
}
