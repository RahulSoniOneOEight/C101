// U-017 — PDP gallery + layout tests.
//
// Phase 1: app-side demo gallery for three allowlisted products; Discuss is a
// secondary action; the sticky bar carries Add/Buy only.
import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/demo_gallery.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/product_detail_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _iphoneId = 'prod_01M699CZFCAMBVAVF0THEK25H2';
const _otherId = 'prod_not_in_demo_gallery';

Product _product(String id) => Product(
      id: id,
      title: 'IPHONE 17',
      brand: 'APPLE',
      thumbnail: 'https://images.example.test/iphone.png',
      variants: const <ProductVariant>[
        ProductVariant(
          id: 'variant_iphone',
          label: 'BLACK',
          sku: 'APPLE IPHONE BLACK',
          offerId: 'offer_iphone',
          price: Money(amount: 18500000, currencyCode: 'INR'),
        ),
      ],
      price: const Money(amount: 18500000, currencyCode: 'INR'),
    );

void main() {
  test('demo gallery adds three representative slides to allowlisted products',
      () {
    final images = pdpImages(
      productId: _iphoneId,
      thumbnail: 'https://images.example.test/iphone.png',
    );
    expect(images, hasLength(4));
    expect(images.first.representative, isFalse);
    expect(images.skip(1).every((image) => image.representative), isTrue);
    expect(images[1].url, contains('pexels.com'));
  });

  test('products outside the allowlist get no faked slides', () {
    final images =
        pdpImages(productId: _otherId, thumbnail: 'https://x.test/a.png');
    expect(images, hasLength(1));
    expect(images.single.representative, isFalse);
  });

  test('a product without a thumbnail only shows its demo slides', () {
    final images = pdpImages(productId: _iphoneId, thumbnail: null);
    expect(images, hasLength(3));
    expect(images.every((image) => image.representative), isTrue);
  });

  testWidgets('allowlisted PDP shows the slider and a secondary Discuss',
      (tester) async {
    tester.view.physicalSize = const Size(390, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final product = _product(_iphoneId);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        productsProvider.overrideWith((ref) async => <Product>[product]),
        productProvider.overrideWith((ref, id) async => product),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const ProductDetailScreen(productId: _iphoneId),
      ),
    ));
    await tester.pumpAndSettle();

    // Gallery: 4 slides, counter, first slide is the real thumbnail.
    expect(find.text('1 / 4'), findsOneWidget);
    expect(find.text('Representative image'), findsNothing);

    await tester.drag(find.byType(PageView), const Offset(-320, 0));
    await tester.pumpAndSettle();
    expect(find.text('2 / 4'), findsOneWidget);
    expect(find.text('Representative image'), findsOneWidget);

    // Discuss is a secondary text action, never a full-width button.
    final discuss = find.byKey(const Key('pdp-discuss'));
    expect(discuss, findsOneWidget);
    expect(tester.widget(discuss), isA<TextButton>());
    expect(find.widgetWithText(OutlinedButton, 'Discuss'), findsNothing);

    // Price comparison sits below the specifications, not above the buy box.
    final comparison = tester.getTopLeft(find.text('Price comparison')).dy;
    final fullSpecs = tester.getTopLeft(find.text('Full specifications')).dy;
    expect(comparison, greaterThan(fullSpecs));
  });

  testWidgets('sticky bar appears on scroll and carries Add/Buy only',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final product = _product(_iphoneId);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        productsProvider.overrideWith((ref) async => <Product>[product]),
        productProvider.overrideWith((ref, id) async => product),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const ProductDetailScreen(productId: _iphoneId),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pdp-sticky-bar')), findsNothing);

    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pumpAndSettle();

    final sticky = find.byKey(const Key('pdp-sticky-bar'));
    expect(sticky, findsOneWidget);
    expect(find.descendant(of: sticky, matching: find.text('Add')), findsOneWidget);
    expect(find.descendant(of: sticky, matching: find.text('Buy')), findsOneWidget);
    expect(
      find.descendant(of: sticky, matching: find.text('Discuss this product')),
      findsNothing,
    );
  });
}
