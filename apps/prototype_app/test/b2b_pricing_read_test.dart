import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/b2b_trade_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _composed({required bool configured}) {
  final bestPrice = <String, dynamic>{
    'id': 'offer_test',
    'seller_name': 'Test Supplier',
    'currency_code': 'INR',
    'unit_amount_minor': configured ? 399000 : 427500,
    'list_amount_minor': 475000,
    'inventory_quantity': 50,
    'b2b_configured': configured,
    'b2b_moq': configured ? 5 : null,
    'b2b_tiers': configured
        ? <Map<String, dynamic>>[
            <String, dynamic>{
              'min_quantity': 5,
              'max_quantity': 9,
              'amount': 389000,
            },
            <String, dynamic>{
              'min_quantity': 10,
              'max_quantity': null,
              'amount': 379000,
            },
          ]
        : <Map<String, dynamic>>[],
  };
  return <String, dynamic>{
    'id': 'prod_test',
    'title': 'Test B2B Product',
    'variants': <Map<String, dynamic>>[
      <String, dynamic>{
        'id': 'var_test',
        'title': 'Default',
        'sku': 'SKU-TEST',
        'in_stock': true,
        'offer_count': 1,
        'best_price': bestPrice,
      },
    ],
    'best_price': bestPrice,
    'metadata': <String, dynamic>{'catalogue_import': 'CHG-049'},
    'categories': <dynamic>[],
  };
}

void main() {
  test('B2B trade product uses the saved B2B price, MOQ and tiers', () {
    final product = Product.fromComposedJson(_composed(configured: true));
    final trade = tradeProductFromCatalogue(product);

    expect(trade.tradePrice.amount, 399000);
    expect(trade.moq, 5);
    expect(trade.tiers.map((tier) => tier.quantity).toList(), <int>[5, 10]);
    expect(trade.tiers.map((tier) => tier.unitPrice.amount).toList(),
        <int>[389000, 379000]);
    expect(trade.sellers.single.moq, 5);
    expect(product.variants.single.b2bConfigured, true);
    expect(product.variants.single.mrp?.amount, 475000);
  });

  test('an unconfigured B2B offer keeps the offer price and existing ladder',
      () {
    final product = Product.fromComposedJson(_composed(configured: false));
    final trade = tradeProductFromCatalogue(product);

    expect(trade.tradePrice.amount, 427500);
    expect(trade.moq, 1);
    expect(trade.tiers.map((tier) => tier.quantity).toList(), <int>[1, 10, 25]);
    expect(trade.sellers.single.moq, 1);
  });

  test('B2B surfaces prefer a configured trade SKU over a cheaper B2C SKU', () {
    final b2cOnly = <String, dynamic>{
      'id': 'offer_b2c_only',
      'seller_name': 'B2C Supplier',
      'currency_code': 'INR',
      'unit_amount_minor': 380000,
      'list_amount_minor': 475000,
      'inventory_quantity': 50,
      'b2b_configured': false,
      'b2b_moq': null,
      'b2b_tiers': <Map<String, dynamic>>[],
    };
    final configured = <String, dynamic>{
      'id': 'offer_b2b',
      'seller_name': 'B2B Supplier',
      'currency_code': 'INR',
      'unit_amount_minor': 399000,
      'list_amount_minor': 475000,
      'inventory_quantity': 50,
      'b2b_configured': true,
      'b2b_moq': 5,
      'b2b_tiers': <Map<String, dynamic>>[
        <String, dynamic>{
          'min_quantity': 5,
          'max_quantity': 9,
          'amount': 389000,
        },
      ],
    };
    final product = Product.fromComposedJson(<String, dynamic>{
      'id': 'prod_mixed',
      'title': 'Mixed Terms Product',
      'variants': <Map<String, dynamic>>[
        <String, dynamic>{
          'id': 'var_b2c',
          'title': 'B2C SKU',
          'sku': 'SKU-B2C',
          'in_stock': true,
          'offer_count': 1,
          'best_price': b2cOnly,
        },
        <String, dynamic>{
          'id': 'var_b2b',
          'title': 'B2B SKU',
          'sku': 'SKU-B2B',
          'in_stock': true,
          'offer_count': 1,
          'best_price': configured,
        },
      ],
      'best_price': b2cOnly,
      'metadata': <String, dynamic>{'catalogue_import': 'CHG-049'},
      'categories': <dynamic>[],
    });
    final trade = tradeProductFromCatalogue(product);

    expect(trade.tradePrice.amount, 399000);
    expect(trade.moq, 5);
    expect(trade.tiers.single.quantity, 5);
    expect(product.variants.first.b2bConfigured, false);
    expect(product.variants.last.b2bConfigured, true);
  });

  test('cached catalogue round-trip preserves B2B MOQ and tiers', () {
    final product = Product.fromComposedJson(_composed(configured: true));
    final restored = Product.fromCacheJson(product.toCacheJson());

    expect(restored.variants.single.b2bConfigured, true);
    expect(restored.variants.single.b2bMoq, 5);
    expect(restored.variants.single.b2bTiers.length, 2);
    expect(restored.variants.single.b2bTiers.first.unitPrice.amount, 389000);
  });

  test('RFQ reprices a B2B SKU at the selected tier quantity', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final product = Product.fromComposedJson(_composed(configured: true));
    final trade = tradeProductFromCatalogue(product);
    final container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        tradeCatalogueViewProvider.overrideWithValue(<TradeProduct>[trade]),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(b2bQuotationCartProvider.notifier);
    notifier.addTradeProduct(trade,
        quantity: 5, variant: product.variants.single);

    var cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines.single.quantity, 5);
    expect(cart.lines.single.unitPrice.amount, 389000);

    notifier.updateQuantity('SKU-TEST', 10);
    cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines.single.unitPrice.amount, 379000);
  });
}
