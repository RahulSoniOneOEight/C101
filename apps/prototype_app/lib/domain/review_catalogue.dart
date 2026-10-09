/// Review-only catalogue enrichment.
///
/// The staging catalogue seed carries **no** compare-at (list) price and no
/// merchandising tags, which left the D2C collections empty, the product tiles
/// without trust/discount badges, and the price comparison flat. For the review
/// build we derive a **stable** list price and a small tag set per product id.
///
/// This is display-only: selling price, cart and order totals are untouched.
/// It only drives the strike-through MRP, the discount pill, the Flipkart /
/// Amazon comparison, and collection membership. Remove this file (and its two
/// call sites in `models.dart`) once the catalogue backend carries real list
/// prices and merchandising attributes.
library;

/// Collection identifiers surfaced by the home modules and the "See All" flow.
const String kCollectionFlashDeals = 'Flash Deals';
const String kCollectionBestSellers = 'Best Sellers';
const String kCollectionClearance = 'Clearance Sale';
const String kCollectionNewArrivals = 'New Arrivals';

/// Stable, non-cryptographic hash of a string (djb2-ish, kept positive).
int stableHash(String value) {
  var hash = 0;
  for (final unit in value.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return hash;
}

/// Whether [id] falls in the deterministic bucket named [seed] (~44% of ids).
bool _bucket(String id, String seed) => stableHash('$seed:$id') % 9 < 4;

bool inFlashDeals(String id) => _bucket(id, 'flash');
bool inBestSellers(String id) => _bucket(id, 'best');
bool inClearance(String id) => _bucket(id, 'clearance');
bool inNewArrivals(String id) => _bucket(id, 'new');

/// Derived merchandising tags for a product id (order matters: the first two
/// are the ones a tile renders). Never empty.
List<String> reviewTags(String id) {
  final tags = <String>[];
  if (inBestSellers(id)) tags.add('Bestseller');
  if (inFlashDeals(id)) tags.add('Limited Deal');
  if (inNewArrivals(id)) tags.add('New');
  if (inClearance(id)) tags.add('Clearance');
  if (tags.isEmpty) tags.add('Assured');
  return tags;
}

/// Derived discount percentage (18–52%) for a product id.
int reviewDiscountPercent(String id) => 18 + stableHash('d:$id') % 35;
