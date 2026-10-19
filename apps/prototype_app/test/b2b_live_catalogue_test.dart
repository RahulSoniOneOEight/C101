import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/b2b_trade_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_browse_screens.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:shared_preferences/shared_preferences.dart';

Product _groupedProduct() => Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_socket_set',
      'title': '1/2in Drive 24 Pcs Socket Set',
      'metadata': <String, dynamic>{
        'brand': 'BAUM',
        'catalogue_import': 'CHG-049',
        'category_l1': 'Tools & Hardware',
      },
      'categories': <dynamic>[
        <String, dynamic>{'id': 'pcat_tools', 'name': 'Hand Tools'},
      ],
      'variants': <dynamic>[
        <String, dynamic>{
          'id': 'variant_hex',
          'title': 'Set - Hex',
          'sku': 'BAUM-237S1-SET-HEX',
          'in_stock': true,
          'offer_count': 1,
          'best_price': <String, dynamic>{
            'id': 'offer_hex',
            'seller_name': 'BuildMaster Supplies',
            'variant_id': 'variant_hex',
            'currency_code': 'inr',
            'unit_amount_minor': 475000,
            'list_amount_minor': 475000,
            'inventory_quantity': 50,
          },
        },
        <String, dynamic>{
          'id': 'variant_bihex',
          'title': 'Set - Bi Hex',
          'sku': 'BAUM-237S1-SET-BI-HEX',
          'in_stock': true,
          'offer_count': 1,
          'best_price': <String, dynamic>{
            'id': 'offer_bihex',
            'seller_name': 'BuildMaster Supplies',
            'variant_id': 'variant_bihex',
            'currency_code': 'inr',
            'unit_amount_minor': 499000,
            'list_amount_minor': 499000,
            'inventory_quantity': 50,
          },
        },
      ],
      'best_price': <String, dynamic>{
        'id': 'offer_hex',
        'seller_name': 'BuildMaster Supplies',
        'variant_id': 'variant_hex',
        'currency_code': 'inr',
        'unit_amount_minor': 475000,
        'list_amount_minor': 475000,
        'inventory_quantity': 50,
      },
      'offer_count': 2,
    });

void main() {
  test('a grouped catalogue product maps to one trade product with real SKUs',
      () {
    final trade =
        tradeProductFromCatalogue(_groupedProduct(), categoryId: 'pcat_tools');

    // CHG-051 ladder: list at 1+, 5% at 10+, 10% at 25+ (governed ceiling).
    expect(trade.moq, 1);
    expect(trade.tiers.map((t) => t.quantity), <int>[1, 10, 25]);
    expect(trade.tiers.map((t) => t.unitPrice.amount),
        <int>[475000, 451250, 427500]);
    expect(trade.unitPriceFor(9).amount, 475000);
    expect(trade.unitPriceFor(10).amount, 451250);
    expect(trade.unitPriceFor(25).amount, 427500);
    expect(trade.product.variantCount, 2);
    expect(trade.stockQty, 50);
    expect(trade.categoryId, 'pcat_tools');
    expect(trade.deliveryLocation, 'Marketplace Shipping');
    // Both SKUs are offered by the seller that actually priced them.
    expect(trade.sellers, hasLength(2));
    expect(trade.sellers.every((s) => s.name == 'BuildMaster Supplies'), isTrue);
    expect(trade.bestSeller!.unitPrice.amount, 475000);
    expect(trade.bestSeller!.bestPrice, isTrue);
  });

  testWidgets('trade PDP lists every variant and adds the selected SKU',
      (tester) async {
    tester.view.physicalSize = const Size(420, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final trade =
        tradeProductFromCatalogue(_groupedProduct(), categoryId: 'pcat_tools');

    final router = GoRouter(
      initialLocation: '/b2b/pdp/${trade.product.id}',
      routes: <RouteBase>[
        GoRoute(
          path: '/b2b/pdp/:id',
          builder: (context, state) =>
              B2BTradePdpScreen(productId: state.pathParameters['id'] ?? ''),
        ),
        GoRoute(
          path: '/b2b/cart',
          builder: (context, state) =>
              const Scaffold(body: Text('Quotation cart')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          tradeCatalogueProvider.overrideWithValue(<TradeProduct>[trade]),
        ],
        child: MaterialApp.router(
          theme: AgencyTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Variants (2)'), findsOneWidget);
    expect(find.textContaining('BAUM-237S1-SET-HEX'), findsOneWidget);
    expect(find.textContaining('BAUM-237S1-SET-BI-HEX'), findsOneWidget);

    await tester.tap(find.text('Set - Bi Hex'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add to Cart'));
    await tester.pumpAndSettle();

    final container = ProviderScope.containerOf(
      tester.element(find.text('Quotation cart')),
    );
    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines, hasLength(1));
    // The selected variant — not the product id and not the first SKU.
    expect(cart.lines.single.sku, 'BAUM-237S1-SET-BI-HEX');
    expect(cart.lines.single.unitPrice.amount, 499000);
  });

  testWidgets('trade catalogue search finds a grouped card by variant SKU',
      (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final trade =
        tradeProductFromCatalogue(_groupedProduct(), categoryId: 'pcat_tools');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          tradeCatalogueProvider.overrideWithValue(<TradeProduct>[trade]),
        ],
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BCatalogueScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byType(TextField).first, 'BAUM-237S1-SET-BI-HEX');
    await tester.pumpAndSettle();

    expect(find.text('1/2in Drive 24 Pcs Socket Set'), findsOneWidget);
    expect(find.textContaining('2 SKUs'), findsOneWidget);
  });
}
