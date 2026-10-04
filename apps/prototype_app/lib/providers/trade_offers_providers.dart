import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_trade_models.dart';
import 'b2b_trade_providers.dart';

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
    required this.productIds,
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
  final List<String> productIds;
  final String? schemeLabel;

  bool get isScheme => type == TradeOfferType.schemes;
}

/// All offer/deal collections (backend-configurable fixture).
final tradeOfferCollectionsProvider =
    Provider<List<TradeOfferCollection>>((ref) {
  return const <TradeOfferCollection>[
    TradeOfferCollection(
      id: 'off_seasonal',
      title: 'Seasonal',
      description: 'Electrical',
      type: TradeOfferType.seasonal,
      icon: Icons.wb_sunny_outlined,
      accent: TradeOfferAccent.trust,
      displayOrder: 1,
      featuredOnHome: true,
      productIds: <String>['prod_led', 'prod_wire', 'prod_mcb'],
    ),
    TradeOfferCollection(
      id: 'off_best_deals',
      title: 'Best Deals',
      description: 'Dealer deals',
      type: TradeOfferType.bestDeals,
      icon: Icons.local_offer_outlined,
      accent: TradeOfferAccent.promotion,
      displayOrder: 2,
      featuredOnHome: true,
      productIds: <String>['prod_tiles', 'prod_paint', 'prod_drill'],
    ),
    TradeOfferCollection(
      id: 'off_schemes',
      title: 'Schemes',
      description: 'Active offers',
      type: TradeOfferType.schemes,
      icon: Icons.card_giftcard_outlined,
      accent: TradeOfferAccent.primary,
      displayOrder: 3,
      featuredOnHome: true,
      schemeLabel: 'Buy 100 Get 5 Free',
      productIds: <String>['prod_bibcock', 'prod_ballvalve', 'prod_mcb'],
    ),
    TradeOfferCollection(
      id: 'off_bulk_buy',
      title: 'Bulk Buy',
      description: 'High-MOQ savings',
      type: TradeOfferType.bulkBuy,
      icon: Icons.inventory_2_outlined,
      accent: TradeOfferAccent.info,
      displayOrder: 4,
      productIds: <String>['prod_switch', 'prod_cpvc', 'prod_wire'],
    ),
    TradeOfferCollection(
      id: 'off_clearance',
      title: 'Clearance',
      description: 'Limited stock',
      type: TradeOfferType.clearance,
      icon: Icons.cleaning_services_outlined,
      accent: TradeOfferAccent.promotion,
      displayOrder: 5,
      productIds: <String>['prod_grinder', 'prod_fittings'],
    ),
    TradeOfferCollection(
      id: 'off_festive',
      title: 'Festive Offers',
      description: 'Campaign deals',
      type: TradeOfferType.festive,
      icon: Icons.celebration_outlined,
      accent: TradeOfferAccent.trust,
      displayOrder: 6,
      productIds: <String>['prod_bibcock', 'prod_tiles', 'prod_led'],
    ),
  ];
});

/// The collections featured on the B2B Home preview (ordered).
final featuredTradeOffersProvider = Provider<List<TradeOfferCollection>>((ref) {
  final list = ref
      .watch(tradeOfferCollectionsProvider)
      .where((c) => c.featuredOnHome)
      .toList()
    ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
  return list;
});

/// The catalogue products assigned to a collection (deduped, catalogue order).
final tradeOffersForCollectionProvider =
    Provider.family<List<TradeProduct>, String>((ref, collectionId) {
  final collections = ref.watch(tradeOfferCollectionsProvider);
  final catalogue = ref.watch(tradeCatalogueProvider);
  final collection = collections.where((c) => c.id == collectionId).firstOrNull;
  if (collection == null) return const <TradeProduct>[];
  final byId = <String, TradeProduct>{
    for (final p in catalogue) p.product.id: p,
  };
  return <TradeProduct>[
    for (final id in collection.productIds)
      if (byId[id] != null) byId[id]!,
  ];
});
