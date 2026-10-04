import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/product_detail_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('a product has multiple sellers and the best price is cheapest',
      () async {
    final container = ProviderContainer(overrides: [
      productsProvider.overrideWith((ref) async => demoProducts),
    ]);
    addTearDown(container.dispose);
    await container.read(productsProvider.future);

    final product = demoProducts.first;
    final sellers = container.read(productSellersProvider(product.id));

    expect(sellers.length, greaterThan(1));
    expect(sellers.first.isBestPrice, isTrue);
    expect(sellers.first.price.amount, product.price!.amount);
    expect(
      sellers.every((s) => s.price.amount >= sellers.first.price.amount),
      isTrue,
      reason: 'the default (first) seller must be the cheapest',
    );
  });

  testWidgets('product page defaults to the best-price seller', (tester) async {
    tester.view.physicalSize = const Size(420, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final product = demoProducts.first;

    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        productsProvider.overrideWith((ref) async => demoProducts),
        productProvider.overrideWith(
            (ref, id) async => demoProducts.firstWhere((p) => p.id == id)),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: ProductDetailScreen(productId: product.id),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('sellers'), findsOneWidget);
    expect(find.text('Best price'), findsOneWidget);
    // Best-price seller is selected by default (exactly one checked radio).
    expect(find.byIcon(Icons.radio_button_checked), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
