import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/app_notification.dart';
import 'package:prototype_app/providers/notifications_providers.dart';
import 'package:prototype_app/screens/b2c_flow_screens.dart';
import 'package:prototype_app/screens/notifications_screen.dart';

void main() {
  test('notifications are audience-scoped with unread tracking', () {
    final container = ProviderContainer(overrides: [
      notificationsProvider.overrideWith(TestNotificationsNotifier.new),
    ]);
    addTearDown(container.dispose);
    final all = container.read(notificationsProvider);

    expect(all.any((n) => n.audience == NotificationAudience.b2c), isTrue);
    expect(all.any((n) => n.audience == NotificationAudience.b2b), isTrue);
    expect(
        container.read(unreadNotificationsProvider(NotificationAudience.b2c)),
        greaterThan(0));

    container
        .read(notificationsProvider.notifier)
        .markAllRead(NotificationAudience.b2c);

    expect(
        container.read(unreadNotificationsProvider(NotificationAudience.b2c)),
        0);
    expect(
        container.read(unreadNotificationsProvider(NotificationAudience.b2b)),
        greaterThan(0));
  });

  testWidgets('Notifications screen shows the B2B audience feed',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        notificationsProvider.overrideWith(TestNotificationsNotifier.new),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const NotificationsScreen(
          audience: NotificationAudience.b2b,
          loadOnOpen: false,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Quotation received'), findsOneWidget);
    expect(find.textContaining('Credit limit'), findsOneWidget);
    // Consumer-only notification is not shown in the B2B feed.
    expect(find.text('Price drop on your wishlist'), findsNothing);
  });

  testWidgets('Onboarding shows the welcome content and benefits',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const OnboardingScreen(),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Everything you need, delivered to your site.'),
        findsOneWidget);
    expect(find.text('Delivery to your doorstep'), findsOneWidget);
    expect(find.text('Convenient delivery for home and project needs.'),
        findsOneWidget);
    expect(find.text('Better prices for every buyer'), findsOneWidget);
    expect(find.text('Business buying made easy'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}

class TestNotificationsNotifier extends NotificationsNotifier {
  @override
  List<AppNotification> build() => const <AppNotification>[
        AppNotification(
          id: 'consumer-price',
          audience: NotificationAudience.b2c,
          title: 'Price drop on your wishlist',
          body: 'Test price changed.',
          timeLabel: '1h',
          kind: NotificationKind.offer,
        ),
        AppNotification(
          id: 'trade-quote',
          audience: NotificationAudience.b2b,
          title: 'Quotation received',
          body: 'A seller responded.',
          timeLabel: '1h',
          kind: NotificationKind.order,
        ),
        AppNotification(
          id: 'trade-credit',
          audience: NotificationAudience.b2b,
          title: 'Credit limit updated',
          body: 'Your test credit changed.',
          timeLabel: '2h',
          kind: NotificationKind.credit,
        ),
      ];

  @override
  Future<void> markRead(String id) async {
    state = [
      for (final item in state) item.id == id ? item.copyWith(read: true) : item
    ];
  }

  @override
  Future<void> markAllRead(NotificationAudience audience) async {
    state = [
      for (final item in state)
        item.audience == audience ? item.copyWith(read: true) : item,
    ];
  }
}
