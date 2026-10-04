import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/account_models.dart';
import 'package:prototype_app/providers/account_providers.dart';
import 'package:prototype_app/providers/orders_providers.dart';
import 'package:prototype_app/screens/account_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('saved addresses seed, set default, add and remove', () async {
    final c = await _container();
    expect(c.read(addressesProvider), hasLength(2));
    expect(c.read(defaultAddressProvider)!.label, 'Home');

    await c.read(addressesProvider.notifier).setDefault('addr_site');
    expect(c.read(defaultAddressProvider)!.id, 'addr_site');

    await c.read(addressesProvider.notifier).add(const SavedAddress(
          id: 'addr_office',
          label: 'Office',
          fullName: 'Rahul Sharma',
          phone: '+91 98765 43210',
          line1: 'Tower B',
          city: 'Gurugram',
          pincode: '122001',
        ));
    expect(c.read(addressesProvider), hasLength(3));

    await c.read(addressesProvider.notifier).remove('addr_site');
    final list = c.read(addressesProvider);
    expect(list.any((a) => a.id == 'addr_site'), isFalse);
    // A default always remains.
    expect(list.where((a) => a.isDefault), hasLength(1));
  });

  test('wishlist seeds, toggles and persists', () async {
    final c = await _container();
    final initial = c.read(wishlistProvider);
    expect(initial, isNotEmpty);

    await c.read(wishlistProvider.notifier).remove(initial.first);
    expect(c.read(wishlistProvider).contains(initial.first), isFalse);

    await c.read(wishlistProvider.notifier).add('prod_paint');
    expect(c.read(wishlistProvider).first, 'prod_paint');
  });

  test('order cancel clears eligibility and appends a timeline event',
      () async {
    final c = await _container();
    final order = c.read(ordersProvider).firstWhere((o) => o.cancelEligible);
    final before = order.timeline.length;

    c.read(ordersProvider.notifier).cancel(order.id);

    final after = c.read(orderByIdProvider(order.id))!;
    expect(after.cancelEligible, isFalse);
    expect(after.stage.name, 'cancelled');
    expect(after.timeline.length, before + 1);
  });

  test('payment methods expose supported methods and manage saved cards',
      () async {
    final c = await _container();
    final methods = c.read(paymentMethodsProvider);
    expect(methods.where((m) => !m.removable).length, greaterThanOrEqualTo(4));

    await c.read(paymentMethodsProvider.notifier).addSaved(const PaymentMethod(
          id: 'pm_card_test',
          kind: PaymentMethodKind.card,
          label: '9999 •••• 9999',
          detail: 'Expires 12/30',
        ));
    expect(c.read(paymentMethodsProvider).any((m) => m.id == 'pm_card_test'),
        isTrue);

    await c.read(paymentMethodsProvider.notifier).setDefault('pm_card_test');
    final saved = c
        .read(paymentMethodsProvider)
        .firstWhere((m) => m.id == 'pm_card_test');
    expect(saved.isDefault, isTrue);

    // Supported (non-removable) methods can never be removed.
    await c.read(paymentMethodsProvider.notifier).remove('pm_upi');
    expect(c.read(paymentMethodsProvider).any((m) => m.id == 'pm_upi'), isTrue);

    await c.read(paymentMethodsProvider.notifier).remove('pm_card_test');
    expect(c.read(paymentMethodsProvider).any((m) => m.id == 'pm_card_test'),
        isFalse);
  });

  test('GST details persist and stamp invoices', () async {
    final c = await _container();
    await c.read(gstProvider.notifier).save(const GstDetails(
          gstin: '08AAICS1234F1Z5',
          legalName: 'Sharma Traders',
          state: 'Rajasthan',
        ));
    expect(c.read(gstProvider).gstin, '08AAICS1234F1Z5');
    expect(c.read(invoicesProvider).first.gstin, '08AAICS1234F1Z5');
  });

  test('support tickets are raised and listed', () async {
    final c = await _container();
    expect(c.read(ticketsProvider), isEmpty);
    await c.read(ticketsProvider.notifier).add(
        subject: 'Late delivery', category: 'Delivery', message: 'Still waiting');
    final tickets = c.read(ticketsProvider);
    expect(tickets, hasLength(1));
    expect(tickets.first.status, TicketStatus.open);
  });

  test('settings update language and notification prefs', () async {
    final c = await _container();
    final s = c.read(settingsProvider);
    await c.read(settingsProvider.notifier).update(
        s.copyWith(language: AppLanguage.hindi, notificationsEnabled: false));
    expect(c.read(settingsProvider).language, AppLanguage.hindi);
    expect(c.read(settingsProvider).notificationsEnabled, isFalse);
  });

  test('profile saves name, email and mobile', () async {
    final c = await _container();
    await c.read(profileProvider.notifier).save(const AccountProfile(
          name: 'A B',
          email: 'a@b.com',
          phone: '+91 90000 00000',
        ));
    expect(c.read(profileProvider).initials, 'AB');
  });

  testWidgets('every Account entry navigates to its screen', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final visited = <String>[];
    final targets = <String, String>{
      '/orders': 'orders',
      '/wishlist': 'wishlist',
      '/addresses': 'addresses',
      '/payments': 'payments',
      '/gst-invoices': 'gst',
      '/help': 'help',
      '/settings': 'settings',
      '/profile': 'profile',
    };

    final router = GoRouter(
      initialLocation: '/account',
      routes: <RouteBase>[
        GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
        GoRoute(
          path: '/profile',
          builder: (_, __) => const Text('profile'),
        ),
        for (final path in targets.keys)
          if (path != '/profile')
            GoRoute(
              path: path,
              builder: (_, __) => Builder(builder: (context) {
                visited.add(path);
                return Text(targets[path]!);
              }),
            ),
      ],
    );

    await tester.pumpWidget(UncontrolledProviderScope(
      container: ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      ),
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();

    // Profile header opens Profile.
    await tester.tap(find.text('Rahul Sharma').first);
    await tester.pumpAndSettle();
    expect(find.text('profile'), findsOneWidget);
    router.go('/account');
    await tester.pumpAndSettle();

    for (final entry in targets.keys.where((p) => p != '/profile')) {
      final label = targets[entry]!;
      await tester.tap(find.textContaining(labelLabel(entry)).first);
      await tester.pumpAndSettle();
      expect(find.text(label), findsOneWidget, reason: 'tapping $entry');
      router.go('/account');
      await tester.pumpAndSettle();
    }
  });
}

/// Maps a route to the visible menu label used in [AccountScreen].
String labelLabel(String route) => switch (route) {
      '/orders' => 'My Orders',
      '/wishlist' => 'Wishlist',
      '/addresses' => 'Saved Addresses',
      '/payments' => 'Payment Methods',
      '/gst-invoices' => 'GST',
      '/help' => 'Help',
      '/settings' => 'Settings',
      _ => route,
    };
