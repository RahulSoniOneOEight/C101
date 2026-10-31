import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';

Map<String, dynamic> _payload({
  Map<String, dynamic>? metadata,
  List<String> badges = const <String>[],
  int? listAmountMinor,
}) =>
    <String, dynamic>{
      'id': 'prod_u007',
      'title': 'Action Tesa HDHMR Board',
      'thumbnail': 'https://example.test/image.png',
      'badges': badges,
      'metadata': metadata ?? <String, dynamic>{'brand': 'Action Tesa'},
      'best_price': <String, dynamic>{
        'id': 'offer_u007',
        'variant_id': 'variant_u007',
        'unit_amount_minor': 43690,
        if (listAmountMinor != null) 'list_amount_minor': listAmountMinor,
        'currency_code': 'INR',
      },
      'variants': <dynamic>[],
    };

void main() {
  test('real list price and real tags are marked real and allowed', () {
    final product = Product.fromComposedJson(_payload(
      listAmountMinor: 51400,
      badges: const <String>['Flash Deal', 'qc'],
      metadata: <String, dynamic>{
        'brand': 'Action Tesa',
        'catalogue_import': 'CHG-049',
      },
    ));

    expect(product.mrp?.amount, 51400);
    expect(product.mrpIsReal, isTrue);
    expect(product.badgesAreReal, isTrue);
    expect(product.b2cBadges, <String>['Flash Deal']);
    expect(product.discountPercent, 15);
  });

  test('synthetic MRP and tags are not trusted by the B2C tile', () {
    final product = Product.fromComposedJson(_payload());

    // The shared model still carries the review-catalogue values (B2B is untouched).
    expect(product.mrp, isNotNull);
    expect(product.badges, isNotEmpty);
    // The B2C tile can tell they are synthetic and hides them.
    expect(product.mrpIsReal, isFalse);
    expect(product.badgesAreReal, isFalse);
    expect(product.b2cBadges, isEmpty);
  });

  test('a non-imported product with real admin tags keeps only allowlisted badges', () {
    final product = Product.fromComposedJson(_payload(
      badges: const <String>['Assured', 'Cement', 'Flash Deal'],
    ));

    expect(product.mrpIsReal, isFalse);
    expect(product.badgesAreReal, isTrue);
    expect(product.b2cBadges, <String>['Assured', 'Flash Deal']);
  });

  test('local cache round-trips the real/synthetic flags', () {
    final real = Product.fromComposedJson(_payload(
      listAmountMinor: 51400,
      badges: const <String>['Assured'],
    ));
    final cached = Product.fromCacheJson(real.toCacheJson());

    expect(cached.mrpIsReal, isTrue);
    expect(cached.badgesAreReal, isTrue);
    expect(cached.b2cBadges, <String>['Assured']);
  });

  testWidgets('compact B2C tile has no overflow at 1.3x text scale',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 160,
            height: 260,
            child: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
              child: const ProductCard(
                title: 'Action Tesa HDHMR Board, Plain, 8 x 4',
                priceLabel: '₹43,690',
                previousPriceLabel: '₹51,400',
                discountLabel: '15% off',
                brand: 'Action Tesa',
                badges: <String>['Assured', 'Flash Deal', 'New'],
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
