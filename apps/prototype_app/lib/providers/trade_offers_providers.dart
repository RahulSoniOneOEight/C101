import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_trade_models.dart';
import '../domain/presentation.dart';
import 'b2b_trade_providers.dart';
import 'catalog_providers.dart';

/// The kind of a backend-configured offer/deal collection.
enum TradeOfferType {
  seasonal,
  bestDeals,
  schemes,
  bulkBuy,
  clearance,
  festive,
}

/// Accent token used to tint a collection card (maps to [AgencyColors]).
enum TradeOfferAccent { trust, promotion, primary, info }

/// A backend-configured Trade Offers & Deals collection.
///
/// Names/types are representative — the UI renders whatever this provider
/// supplies, so more collections can be added without new screens.
class TradeOfferCollection {
  const TradeOfferCollection({
    required this.id,
    required this.title,
    required this.description,
    required this.type,
    required this.icon,
    required this.accent,
    required this.displayOrder,
    this.productIds = const <String>[],
    this.categoryLabels = const <String>[],
    this.limit = 8,
    this.featuredOnHome = false,
    this.schemeLabel,
  });

  final String id;
  final String title;
  final String description;
  final TradeOfferType type;
  final IconData icon;
  final TradeOfferAccent accent;
  final int displayOrder;
  final bool featuredOnHome;

  /// Explicit commerce product ids. When present they win over the rule.
  final List<String> productIds;

  /// L1 category labels the collection draws from when no explicit ids exist
  /// (CHG-062). Resolved against the live catalogue on the storefront path.
  final List<String> categoryLabels;

  /// Maximum products the category rule may contribute.
  final int limit;

  final String? schemeLabel;

  bool get isRuleBased => productIds.isEmpty && categoryLabels.isNotEmpty;

  bool get isScheme => type == TradeOfferType.schemes;

  TradeOfferCollection copyWith({String? title}) => TradeOfferCollection(
        id: id,
        title: title ?? this.title,
        description: description,
        type: type,
        icon: icon,
        accent: accent,
        displayOrder: displayOrder,
        productIds: productIds,
        categoryLabels: categoryLabels,
        limit: limit,
        featuredOnHome: featuredOnHome,
        schemeLabel: schemeLabel,
      );
}

/// Governed default collections used when the console has authored none.
List<TradeOfferCollection> _defaultTradeOfferCollections() {
  return const <TradeOfferCollection>[
    // CHG-062: category rules replace the pre-import demonstration ids. All
    // 233 staged products carry a 5-18% fixture discount, so every rule below
    // resolves real trade products.
    TradeOfferCollection(
      id: 'off_seasonal',
      title: 'Seasonal',
      description: 'Lighting & electrical',
      type: TradeOfferType.seasonal,
      icon: Icons.wb_sunny_outlined,
      accent: TradeOfferAccent.trust,
      displayOrder: 1,
      featuredOnHome: true,
      categoryLabels: <String>['Lighting & Electrical'],
      limit: 8,
    ),
    TradeOfferCollection(
      id: 'off_best_deals',
      title: 'Best Deals',
      description: 'Bathroom & plumbing',
      type: TradeOfferType.bestDeals,
      icon: Icons.local_offer_outlined,
      accent: TradeOfferAccent.promotion,
      displayOrder: 2,
      featuredOnHome: true,
      categoryLabels: <String>['Bathroom & Plumbing'],
      limit: 8,
    ),
    TradeOfferCollection(
      id: 'off_schemes',
      title: 'Schemes',
      description: 'Paints & finishes',
      type: TradeOfferType.schemes,
      icon: Icons.card_giftcard_outlined,
      accent: TradeOfferAccent.primary,
      displayOrder: 3,
      featuredOnHome: true,
      schemeLabel: 'Buy 100 Get 5 Free',
      categoryLabels: <String>[
        'Paints & Finishes',
        'Tiles & Building Materials'
      ],
      limit: 8,
    ),
    TradeOfferCollection(
      id: 'off_bulk_buy',
      title: 'Bulk Buy',
      description: 'Tools & hardware',
      type: TradeOfferType.bulkBuy,
      icon: Icons.inventory_2_outlined,
      accent: TradeOfferAccent.info,
      displayOrder: 4,
      categoryLabels: <String>['Tools & Hardware'],
      limit: 10,
    ),
    TradeOfferCollection(
      id: 'off_clearance',
      title: 'Clearance',
      description: 'Tiles & building materials',
      type: TradeOfferType.clearance,
      icon: Icons.cleaning_services_outlined,
      accent: TradeOfferAccent.promotion,
      displayOrder: 5,
      categoryLabels: <String>['Tiles & Building Materials'],
      limit: 8,
    ),
    TradeOfferCollection(
      id: 'off_festive',
      title: 'Festive Offers',
      description: 'Agriculture & seeds',
      type: TradeOfferType.festive,
      icon: Icons.celebration_outlined,
      accent: TradeOfferAccent.trust,
      displayOrder: 6,
      categoryLabels: <String>['Agriculture & Seeds'],
      limit: 6,
    ),
  ];
}

IconData _dealIcon(String? key) => switch (key) {
      'wb-sunny' => Icons.wb_sunny_outlined,
      'local-offer' => Icons.local_offer_outlined,
      'card-giftcard' => Icons.card_giftcard_outlined,
      'inventory' => Icons.inventory_2_outlined,
      'cleaning' => Icons.cleaning_services_outlined,
      'celebration' => Icons.celebration_outlined,
      _ => Icons.local_offer_outlined,
    };

TradeOfferAccent _dealAccent(String? key) => switch (key) {
      'promotion' => TradeOfferAccent.promotion,
      'primary' => TradeOfferAccent.primary,
      'info' => TradeOfferAccent.info,
      _ => TradeOfferAccent.trust,
    };

TradeOfferType _dealType(String? key) => switch (key) {
      'best-deals' => TradeOfferType.bestDeals,
      'schemes' => TradeOfferType.schemes,
      'bulk-buy' => TradeOfferType.bulkBuy,
      'clearance' => TradeOfferType.clearance,
      'festive' => TradeOfferType.festive,
      _ => TradeOfferType.seasonal,
    };

/// All offer/deal collections.
///
/// Console-authored records (placement `b2b.trade_offers`) override the governed
/// defaults by display position, so an operator can retitle, retarget or reorder
/// the deals rail without an app release. With no authored record the defaults
/// above apply unchanged.
final tradeOfferCollectionsProvider =
    Provider<List<TradeOfferCollection>>((ref) {
  final base = _defaultTradeOfferCollections();
  final curated = (ref.watch(b2bCuratedCollectionsProvider).value ??
          const <CuratedCollection>[])
      .where((item) => item.placement == 'b2b.trade_offers')
      .toList()
    ..sort((a, b) => (a.displayOrder ?? 999).compareTo(b.displayOrder ?? 999));
  if (curated.isEmpty) return base;

  final merged = <TradeOfferCollection>[];
  for (var i = 0; i < base.length; i++) {
    if (i >= curated.length) {
      merged.add(base[i]);
      continue;
    }
    final record = curated[i];
    final fallback = base[i];
    merged.add(TradeOfferCollection(
      id: fallback.id,
      title: record.title,
      description: record.description ?? fallback.description,
      type: _dealType(record.dealType ?? fallback.type.name),
      icon: _dealIcon(record.iconKey),
      accent: _dealAccent(record.accent),
      displayOrder: record.displayOrder ?? fallback.displayOrder,
      productIds: record.productIds,
      categoryLabels: record.categoryLabels.isEmpty
          ? fallback.categoryLabels
          : record.categoryLabels,
      limit: record.limit ?? fallback.limit,
      featuredOnHome: fallback.featuredOnHome,
      schemeLabel: record.schemeLabel ?? fallback.schemeLabel,
    ));
  }
  return merged;
});

/// The collections featured on the B2B Home preview, driven by the backend layout when one is
/// published for the b2b channel.
///
/// The layout's `trade_offers` group declares which categories appear, in what order, under what label
/// and whether they are visible. Only the *presentation* comes from the layout: product membership
/// still resolves through the governed offers path, so nothing is copied into the layout.
///
/// With no layout configured the governed local defaults are used unchanged, so the home never
/// renders empty because an operator has not authored a layout yet.
final featuredTradeOffersProvider = Provider<List<TradeOfferCollection>>((ref) {
  final collections = ref.watch(tradeOfferCollectionsProvider);

  final sections =
      ref.watch(b2bLayoutSectionsProvider).value ?? const <StorefrontSection>[];
  final group = sections
      .where((s) => s.placement == 'trade_offers' && s.visible)
      .firstOrNull;

  if (group != null && group.children.isNotEmpty) {
    final byId = <String, TradeOfferCollection>{
      for (final collection in collections) collection.id: collection,
    };
    final configured = <TradeOfferCollection>[];
    for (final child in group.children) {
      if (!child.visible) continue;
      final collectionId = _tradeOfferPlacementToCollection[child.placement];
      final collection = collectionId == null ? null : byId[collectionId];
      if (collection == null) continue;
      configured.add(collection.copyWith(title: child.displayTitle));
    }
    if (configured.isNotEmpty) return configured;
  }

  final fallback = collections.where((c) => c.featuredOnHome).toList()
    ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
  return fallback;
});

/// Layout placement to local offer collection.
///
/// A layout section references content by placement; the trade rail renders a local collection with its
/// own icon and accent. An unmapped placement is skipped rather than guessed at, so a section the app
/// cannot render never appears as an empty tile.
const Map<String, String> _tradeOfferPlacementToCollection = <String, String>{
  'seasonal': 'off_seasonal',
  'best_deals': 'off_best_deals',
  'schemes': 'off_schemes',
};

/// Whether any configured collection resolves at least one live product.
final tradeOffersHaveAnyProductsProvider = Provider<bool>((ref) {
  final collections = ref.watch(tradeOfferCollectionsProvider);
  return collections.any(
    (collection) =>
        ref.watch(tradeOffersForCollectionProvider(collection.id)).isNotEmpty,
  );
});

/// Whether any featured collection resolves at least one live product.
///
/// The seeded collections reference pre-import product ids. When the live
/// catalogue is in use and none of them resolve, the home must not advertise a
/// deals module that can only open an empty lane.
final tradeOffersHaveProductsProvider = Provider<bool>((ref) {
  final featured = ref.watch(featuredTradeOffersProvider);
  return featured.any(
    (collection) =>
        ref.watch(tradeOffersForCollectionProvider(collection.id)).isNotEmpty,
  );
});

/// The catalogue products assigned to a collection (deduped, catalogue order).
final tradeOffersForCollectionProvider =
    Provider.family<List<TradeProduct>, String>((ref, collectionId) {
  final collections = ref.watch(tradeOfferCollectionsProvider);
  final catalogue = ref.watch(tradeCatalogueViewProvider);
  final collection = collections.where((c) => c.id == collectionId).firstOrNull;
  if (collection == null) return const <TradeProduct>[];

  // Explicit commerce ids always win; otherwise resolve the category rule in
  // catalogue order (which is the CHG-060 display-fitness order).
  if (collection.productIds.isNotEmpty) {
    final byId = <String, TradeProduct>{
      for (final p in catalogue) p.product.id: p,
    };
    return <TradeProduct>[
      for (final id in collection.productIds)
        if (byId[id] != null) byId[id]!,
    ];
  }

  final labels = <String>{
    for (final label in collection.categoryLabels) label.trim().toLowerCase(),
  };
  if (labels.isEmpty) return const <TradeProduct>[];
  final categoryIds = <String>{
    for (final label in labels)
      if (TradeCategoryIds.byLabel[label] != null)
        TradeCategoryIds.byLabel[label]!,
  };
  final resolved = <TradeProduct>[];
  final seen = <String>{};
  for (final product in catalogue) {
    final label = (product.product.categoryLabel ?? '').trim().toLowerCase();
    if (!labels.contains(label) && !categoryIds.contains(product.categoryId)) {
      continue;
    }
    if (!seen.add(product.product.id)) continue;
    resolved.add(product);
    if (resolved.length >= collection.limit) break;
  }
  return resolved;
});
