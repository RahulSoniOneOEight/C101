import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/b2b_trade_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/trade_offers_providers.dart';

/// CHG-062: the quick-order lists and trade offers must resolve from the live
/// catalogue by category rule, not from pre-import demonstration ids.
List<TradeProduct> _catalogue() {
  final products = <TradeProduct>[];
  const groups = <String, String>{
    TradeCategoryIds.electrical: 'Lighting & Electrical',
    TradeCategoryIds.bathroom: 'Bathroom & Plumbing',
    TradeCategoryIds.paints: 'Paints & Finishes',
    TradeCategoryIds.tiles: 'Tiles & Building Materials',
    TradeCategoryIds.tools: 'Tools & Hardware',
  };
  for (final entry in groups.entries) {
    for (var i = 0; i < 25; i++) {
      products.add(tradeProductFromCatalogue(
        Product(
          id: 'prod_${entry.key}_$i',
          title: '${entry.value} item $i',
          price: Money(amount: 10000 + i, currencyCode: 'INR'),
          mrp: Money(amount: 12000 + i, currencyCode: 'INR'),
          categoryId: entry.key,
          categoryLabel: entry.value,
        ),
        categoryId: entry.key,
      ));
    }
  }
  return products;
}

ProviderContainer _container({List<TradeOfferCollection>? offers}) {
  final container = ProviderContainer(overrides: [
    tradeCatalogueProvider.overrideWithValue(_catalogue()),
    if (offers != null) tradeOfferCollectionsProvider.overrideWithValue(offers),
  ]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('four quick-order lists resolve 15-20 live products each', () {
    final container = _container();
    final lists = container.read(resolvedProcurementListsProvider);

    expect(lists, hasLength(4));
    expect(
      lists.map((l) => l.title),
      <String>[
        'Electrical Essentials',
        'Bathroom & Plumbing',
        'Paints & Finishes',
        'Tools & Hardware',
      ],
    );
    expect(lists.map((l) => l.items.length), <int>[20, 20, 18, 20]);
    expect(lists.every((l) => l.isRuleBased), isTrue);
    expect(
      lists.every((l) => l.items.every((i) => i.sku.startsWith('prod_'))),
      isTrue,
    );
  });

  test('a rule list never exposes more than its limit', () {
    final container = _container();
    final lists = container.read(resolvedProcurementListsProvider);
    for (final list in lists) {
      expect(list.items.length, lessThanOrEqualTo(list.limit!));
      expect(list.items.length, greaterThanOrEqualTo(15));
    }
  });

  test('trade offers resolve by category and the deals unit is visible', () {
    final container = _container();
    final electrical =
        container.read(tradeOffersForCollectionProvider('off_seasonal'));
    final bathroom =
        container.read(tradeOffersForCollectionProvider('off_best_deals'));
    final finishes =
        container.read(tradeOffersForCollectionProvider('off_schemes'));

    expect(electrical, hasLength(8));
    expect(
        electrical
            .every((p) => p.product.categoryLabel == 'Lighting & Electrical'),
        isTrue);
    expect(bathroom, hasLength(8));
    expect(finishes, hasLength(8));
    expect(container.read(tradeOffersHaveProductsProvider), isTrue);
    expect(container.read(tradeOffersHaveAnyProductsProvider), isTrue);
  });

  test('explicit commerce ids override the category rule', () {
    final container = _container(offers: const <TradeOfferCollection>[
      TradeOfferCollection(
        id: 'off_seasonal',
        title: 'Seasonal',
        description: 'Explicit picks',
        type: TradeOfferType.seasonal,
        icon: Icons.local_offer_outlined,
        accent: TradeOfferAccent.trust,
        displayOrder: 1,
        featuredOnHome: true,
        productIds: <String>['prod_${TradeCategoryIds.electrical}_3'],
        categoryLabels: <String>['Lighting & Electrical'],
        limit: 8,
      ),
    ]);

    final resolved =
        container.read(tradeOffersForCollectionProvider('off_seasonal'));
    expect(resolved.map((p) => p.product.id),
        <String>['prod_${TradeCategoryIds.electrical}_3']);
  });

  test('console-authored records override quick-order and deal properties',
      () async {
    final container = ProviderContainer(overrides: [
      tradeCatalogueProvider.overrideWithValue(_catalogue()),
      b2bCuratedCollectionsProvider
          .overrideWith((ref) async => const <CuratedCollection>[
                CuratedCollection(
                  collectionKey: 'b2b_quick_electrical',
                  audience: 'b2b',
                  placement: 'b2b.quick_order',
                  title: 'Site Electrical',
                  description: 'Operator-authored list',
                  categoryLabels: <String>['Tools & Hardware'],
                  limit: 17,
                  defaultQuantity: 3,
                  displayOrder: 1,
                ),
                CuratedCollection(
                  collectionKey: 'b2b_trade_seasonal',
                  audience: 'b2b',
                  placement: 'b2b.trade_offers',
                  title: 'Console Seasonal',
                  description: 'Operator-authored deals',
                  categoryLabels: <String>['Tools & Hardware'],
                  limit: 5,
                  displayOrder: 1,
                  iconKey: 'local-offer',
                  accent: 'promotion',
                  dealType: 'best-deals',
                ),
              ]),
    ]);
    addTearDown(container.dispose);
    await container.read(b2bCuratedCollectionsProvider.future);

    final lists = container.read(effectiveProcurementListsProvider);
    expect(lists.first.title, 'Site Electrical');
    expect(lists.first.limit, 17);
    expect(lists.first.items, hasLength(17));
    expect(
      lists.first.items.every((i) => i.name.startsWith('Tools & Hardware')),
      isTrue,
    );

    final deals = container.read(tradeOfferCollectionsProvider);
    expect(deals.first.title, 'Console Seasonal');
    expect(deals.first.limit, 5);
    expect(deals.first.categoryLabels, <String>['Tools & Hardware']);
  });
}
