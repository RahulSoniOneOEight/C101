import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../domain/models.dart';
import '../domain/storefront_collection.dart';

/// The collection behind a customer-facing URL, with the products it shows.
///
/// Membership is commerce's answer: the delivery endpoint resolves the key (a curated registry key or a
/// commerce handle) and returns the collection id, and products are then fetched through the same
/// composed list every other surface uses. Nothing re-derives membership in the app.
final storefrontCollectionProvider = FutureProvider.autoDispose
    .family<StorefrontCollection, String>((ref, key) async {
  final api = ref.watch(experienceApiProvider);
  final collection = await api.getStorefrontCollection(key);

  final collectionId = collection.collectionId;
  if (collectionId != null && collectionId.isNotEmpty) {
    final products =
        await api.getComposedProducts(collectionId: collectionId, limit: 100);
    return collection.withProducts(products);
  }

  // A curated registry key has no commerce id behind it. Delivery already resolved its list, so use it
  // rather than showing nothing: prices render as "price on request" because a raw store product carries
  // no composed best-price offer, and inventing one here is not the app's decision to make.
  final items = await api.getCollection(key);
  final products = items
      .whereType<Map<String, dynamic>>()
      .map(Product.fromComposedJson)
      .where((product) => product.id.isNotEmpty)
      .toList();
  return collection.withProducts(products);
});
