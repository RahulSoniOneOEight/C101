import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/storefront_ux.dart';

void main() {
  test('AI demo explains and expands a known consumer intent', () {
    final result = interpretDemoSearch('I need to paint a damp bathroom');

    expect(result.label, 'Bathroom waterproofing and finishes');
    expect(
        result.terms, containsAll(<String>['waterproof', 'paint', 'sealant']));
    expect(result.categoryHints,
        containsAll(<String>['Paints & Finishes', 'Bathroom & Plumbing']));
  });

  test('AI demo ranks only existing catalogue products', () {
    const products = <Product>[
      Product(
          id: 'paint',
          title: 'Interior Primer',
          categoryLabel: 'Paints & Finishes'),
      Product(
          id: 'pipe', title: 'CPVC Pipe', categoryLabel: 'Bathroom & Plumbing'),
      Product(
          id: 'drill',
          title: 'Rotary Hammer Drill',
          categoryLabel: 'Tools & Hardware'),
    ];

    final result = demoAiSearch(products, 'drill into concrete');

    expect(result.first.id, 'drill');
    expect(result.every(products.contains), isTrue,
        reason: 'the helper may rank, but never manufacture, products');
  });

  test('fulfilment preference round-trips without changing the mode', () {
    const value = FulfilmentPreference(
      mode: FulfilmentMode.pickup,
      addressId: 'addr_home',
      pickupPointId: 'pickup_staging_bhiwadi',
    );

    final restored = FulfilmentPreference.fromJson(value.toJson());
    expect(restored.mode, FulfilmentMode.pickup);
    expect(restored.addressId, 'addr_home');
    expect(restored.pickupPointId, 'pickup_staging_bhiwadi');
  });
}
