import 'models.dart';

/// A collection addressed by its customer-facing URL.
///
/// The link opens `/collections/<key>`, where the key is the commerce collection handle (or a curated
/// registry key). Products are resolved separately through composition, so the page shows the same
/// price and offer as every other storefront surface.
class StorefrontCollection {
  const StorefrontCollection({
    required this.key,
    this.collectionId,
    this.title,
    this.products = const <Product>[],
  });

  final String key;

  /// Commerce collection id, when the key resolved to a commerce collection.
  final String? collectionId;

  /// Published display title, when one exists. Null for a curated registry key.
  final String? title;

  final List<Product> products;

  StorefrontCollection withProducts(List<Product> resolved) => StorefrontCollection(
        key: key,
        collectionId: collectionId,
        title: title,
        products: resolved,
      );
}

/// The collection address does not resolve to anything a customer can see.
///
/// [code] distinguishes "no collection at this address" from "the collection exists but has nothing
/// deliverable right now", because the two need different words on screen.
class CollectionNotFoundException implements Exception {
  const CollectionNotFoundException(this.code);

  final String code;

  bool get isEmpty => code == 'collection-empty';

  @override
  String toString() => 'CollectionNotFoundException($code)';
}
