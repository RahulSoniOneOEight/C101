import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/data/medusa_api.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/cart_providers.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/cart_screen.dart';
import 'package:prototype_app/screens/d2c_shell.dart';
import 'package:prototype_app/widgets/notification_bell.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A client that always fails, standing in for "no Medusa backend reachable".
class _UnreachableClient extends MedusaStoreClient {
  _UnreachableClient() : super(Dio());

  @override
  Future<Cart> createCart() async => throw Exception('offline');
}

Future<Widget> _host(Widget child) async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      productsProvider.overrideWith((ref) async => demoProducts),
    ],
    child: MaterialApp(theme: AgencyTheme.light(), home: child),
  );
}

void main() {
  test('cart degrades to a local cart when the backend is unreachable',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        productsProvider.overrideWith((ref) async => demoProducts),
        medusaClientProvider.overrideWithValue(_UnreachableClient()),
      ],
    );
    addTearDown(container.dispose);

    await container
        .read(cartProvider.notifier)
        .addItem(variantId: 'prod_plywood', quantity: 1);

    final cart = container.read(cartProvider).value;
    expect(cart, isNotNull);
    expect(cart!.items, hasLength(1));
    expect(cart.items.single.quantity, 1);
  });

  testWidgets('Cart page is available and shows related merchandising',
      (tester) async {
    await tester.pumpWidget(await _host(const CartScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Cart'), findsOneWidget);
    // Related-product merchandising unit renders (even with an empty cart).
    expect(find.text('You may also like'), findsOneWidget);
    expect(find.byType(ProductCard), findsWidgets);
    // Quick link to Orders (Orders lives under Account).
    expect(find.text('My Orders'), findsWidgets);
  });

  testWidgets('Browse tab uses the icon-led category rail', (tester) async {
    await tester.pumpWidget(await _host(const BrowseScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(CategoryIconRail), findsOneWidget);
    expect(find.byType(CategoryIconItem), findsWidgets);
    expect(find.text('Sort: Relevance'), findsOneWidget);
    expect(find.text('Filter'), findsOneWidget);
    // The B2C header exposes the notification centre.
    expect(find.byType(NotificationBell), findsOneWidget);
  });
}
