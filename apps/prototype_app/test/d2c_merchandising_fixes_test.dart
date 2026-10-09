import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/merchandising.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/product_detail_screen.dart';
import 'package:prototype_app/widgets/merchandising_sections.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('detail contract reads the best offer from commercial.selected_seller',
      () {
    final product = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_1',
      'title': 'Ceramic Floor Tiles 600x600 Matt',
      'thumbnail': null,
      'variants': <dynamic>[
        <String, dynamic>{'id': 'variant_1'},
      ],
      'offers': <dynamic>[],
      'commercial': <String, dynamic>{
        'selected_seller': <String, dynamic>{
          'id': 'offer_1',
          'variant_id': 'variant_1',
          'seller_name': 'BuildMaster Supplies',
          'currency_code': 'INR',
          'unit_amount_minor': 71190,
          'list_amount_minor': 79100,
        },
      },
    });

    // The detail endpoint nests the best price under commercial.selected_seller;
    // dropping it left price null and greyed out Add to Cart / Buy Now.
    expect(product.price, isNotNull);
    expect(product.price!.amount, 71190);
    expect(product.mrp, isNotNull);
    expect(product.mrp!.amount, 79100);
    expect(product.offerId, 'offer_1');
    expect(product.variantId, 'variant_1');
    expect(product.discountPercent, 10);
  });

  test('seed with no list price gets a derived MRP and tags (review)', () {
    final product = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_review',
      'title': 'Review Product',
      'best_price': <String, dynamic>{
        'id': 'offer_r',
        'unit_amount_minor': 10000,
        'list_amount_minor': 10000,
        'currency_code': 'INR',
      },
    });
    expect(product.price!.amount, 10000);
    // Derived list price is strictly higher than the selling price, so the
    // discount pill and the Flipkart/Amazon comparison have a real gap.
    expect(product.mrp, isNotNull);
    expect(product.mrp!.amount, greaterThan(product.price!.amount));
    expect(product.discountPercent, isNotNull);
    expect(product.badges, isNotEmpty);
  });

  testWidgets('product page actions are enabled when a price is composed',
      (tester) async {
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
        productProvider.overrideWith((ref, id) async => product),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: ProductDetailScreen(productId: product.id),
      ),
    ));
    await tester.pumpAndSettle();

    final addButton = tester
        .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Add to Cart'));
    final buyButton =
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Buy Now'));
    expect(addButton.onPressed, isNotNull);
    expect(buyButton.onPressed, isNotNull);
  });

  test('home modules expose Flash Deals / Best Sellers with a split slot',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      productsProvider.overrideWith((ref) async => demoProducts),
    ]);
    addTearDown(container.dispose);
    await container.read(productsProvider.future);

    final modules = container.read(homeModulesProvider);
    expect(modules, isNotEmpty);

    final flash = modules.firstWhere((m) => m.title == 'Flash Deals');
    expect(flash.products, isNotEmpty);

    final best = modules.firstWhere((m) => m.title == 'Best Sellers');
    expect(best.products, isNotEmpty);

    final composition = modules.firstWhere(
        (m) => m.type == MerchandisingModuleType.productComposition);
    expect(composition.splitSlot, isNotNull);
    expect(composition.splitSlot!.label, 'Recently viewed');
  });

  testWidgets('module "See All" invokes its collection callback',
      (tester) async {
    var tapped = false;
    const module = MerchandisingModule(
      type: MerchandisingModuleType.productCarousel,
      title: 'Flash Deals',
      tag: 'Up to 60% OFF',
      products: <Product>[
        Product(
          id: 'p1',
          title: '18V Drill Kit',
          price: Money(amount: 649900, currencyCode: 'INR'),
        ),
      ],
    );

    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: MerchandisingModuleView(
          module: module,
          onSeeAll: () => tapped = true,
        ),
      ),
    ));
    await tester.tap(find.text('See All'));
    expect(tapped, isTrue);
  });

  testWidgets('banner CTA invokes its collection callback', (tester) async {
    var tapped = false;
    const module = MerchandisingModule(
      type: MerchandisingModuleType.secondaryBanner,
      banner: MerchandisingBannerData(
        imageUrl: 'https://example.com/banner.jpg',
        title: 'Clearance Sale',
        subtitle: 'Up to 70% off select items',
        ctaLabel: 'Shop Now',
      ),
    );

    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: MerchandisingModuleView(
          module: module,
          onBannerTap: () => tapped = true,
        ),
      ),
    ));
    await tester.tap(find.text('Shop Now'));
    expect(tapped, isTrue);
  });
}
