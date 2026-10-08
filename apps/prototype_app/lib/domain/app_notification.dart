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
    this.deepLink,
    this.createdAt,
  });

  final String id;
  final NotificationAudience audience;
  final String title;
  final String body;
  final String timeLabel;
  final NotificationKind kind;
  final bool read;
  final String? deepLink;
  final DateTime? createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final template = json['template_key'] as String? ?? '';
    final createdAt = DateTime.tryParse(json['created_at']?.toString() ?? '');
    return AppNotification(
      id: json['id'] as String? ?? '',
      audience: json['audience'] == 'b2b'
          ? NotificationAudience.b2b
          : NotificationAudience.b2c,
      title: json['title'] as String? ?? 'BuildKart update',
      body: json['body'] as String? ?? '',
      timeLabel: _relativeTime(createdAt),
      kind: switch (template) {
        'order_confirmed_v1' || 'delivery_update_v1' => NotificationKind.order,
        'product_launch_v1' || 'price_drop_v1' => NotificationKind.offer,
        _ => NotificationKind.system,
      },
      read: json['read_at'] != null,
      deepLink: json['deep_link'] as String?,
      createdAt: createdAt,
    );
  }

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
        deepLink: deepLink,
        createdAt: createdAt,
      );

  static String _relativeTime(DateTime? value) {
    if (value == null) return '';
    final difference = DateTime.now().toUtc().difference(value.toUtc());
    if (difference.inMinutes < 1) return 'now';
    if (difference.inHours < 1) return '${difference.inMinutes}m';
    if (difference.inDays < 1) return '${difference.inHours}h';
    return '${difference.inDays}d';
  }
}
