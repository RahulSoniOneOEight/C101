import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/merchandising.dart';
import '../domain/models.dart';
import '../domain/review_catalogue.dart';

/// Storefront categories from the client brief, rendered icon-led on the home
/// screen. Placeholder data until a category API is wired.
final categoriesProvider = Provider<List<Category>>((ref) => const <Category>[
      Category(label: 'Bathroom & Plumbing', icon: Icons.bathtub_outlined),
      Category(label: 'Tiles & Plywood', icon: Icons.grid_view_outlined),
      Category(label: 'Electrical', icon: Icons.electrical_services_outlined),
      Category(label: 'Agriculture & Seeds', icon: Icons.grass_outlined),
      Category(
          label: 'Pumps & Machines',
          icon: Icons.precision_manufacturing_outlined),
      Category(label: 'Construction', icon: Icons.construction_outlined),
    ]);

/// Offline demo catalog used when the Medusa backend is unreachable and there
/// is no cached catalog. Mirrors the reference BuildKart profile so the
/// storefront is testable without a running backend.
const List<Product> demoProducts = <Product>[
  Product(
    id: 'prod_drill',
    title: '18V Drill Kit',
    brand: 'BuildPro',
    thumbnail:
        'https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 649900, currencyCode: 'INR'),
    mrp: Money(amount: 799900, currencyCode: 'INR'),
    badges: <String>['Bestseller'],
    rating: 4.5,
    reviewCount: 214,
    deliveryNote: 'Free · Mon',
  ),
  Product(
    id: 'prod_grinder',
    title: 'Angle Grinder 4 in',
    brand: 'Bosch',
    thumbnail:
        'https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 329900, currencyCode: 'INR'),
    mrp: Money(amount: 459900, currencyCode: 'INR'),
    badges: <String>['Premium'],
    rating: 4.3,
    reviewCount: 128,
    deliveryNote: 'Free · Tue',
  ),
  Product(
    id: 'prod_tiles',
    title: 'Ceramic Floor Tiles 600x600 Matt',
    brand: 'CERAMICA',
    thumbnail:
        'https://images.pexels.com/photos/207142/pexels-photo-207142.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 115000, currencyCode: 'INR'),
    mrp: Money(amount: 149900, currencyCode: 'INR'),
    badges: <String>['Bestseller'],
    rating: 4.6,
    reviewCount: 342,
    deliveryNote: 'Free · Wed',
  ),
  Product(
    id: 'prod_pipe',
    title: 'CPVC Pipe 3/4 in',
    brand: 'Astral',
    thumbnail:
        'https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 84000, currencyCode: 'INR'),
    mrp: Money(amount: 99900, currencyCode: 'INR'),
    rating: 4.4,
    reviewCount: 96,
    deliveryNote: 'Free · Mon',
  ),
  Product(
    id: 'prod_fittings',
    title: 'Bathroom Fittings Set',
    brand: 'Jaquar',
    thumbnail:
        'https://images.pexels.com/photos/6492403/pexels-photo-6492403.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 245000, currencyCode: 'INR'),
    mrp: Money(amount: 320000, currencyCode: 'INR'),
    rating: 4.2,
    reviewCount: 87,
    deliveryNote: 'Free · Thu',
  ),
  Product(
    id: 'prod_plywood',
    title: 'Plywood Board 8x4',
    brand: 'Century',
    thumbnail:
        'https://images.pexels.com/photos/207142/pexels-photo-207142.jpeg?auto=compress&cs=tinysrgb&w=600',
    price: Money(amount: 189000, currencyCode: 'INR'),
    rating: 4.0,
    reviewCount: 51,
    deliveryNote: 'Free · Fri',
  ),
];

/// A home "Browse Categories" chip: a display label plus the keyword predicate
/// used to match catalog products. Data-driven so the rail and the filter stay
/// in sync; a category API can replace this later.
class HomeCategoryFilter {
  const HomeCategoryFilter({required this.label, required this.keywords});

  final String label;
  final List<String> keywords;
}

/// The home category filter set (excluding the implicit "All"). Labels match
/// [categoriesProvider] so the icon rail and the filter stay in sync.
const List<HomeCategoryFilter> homeCategoryFilters = <HomeCategoryFilter>[
  HomeCategoryFilter(
    label: 'Bathroom & Plumbing',
    keywords: <String>[
      'pipe',
      'fitting',
      'bath',
      'sanitary',
      'tap',
      'faucet',
      'cpvc',
      'wash',
      'bib',
      'valve',
    ],
  ),
  HomeCategoryFilter(
    label: 'Tiles & Plywood',
    keywords: <String>[
      'tile',
      'plywood',
      'board',
      'ceramic',
      'marble',
      'granite',
    ],
  ),
  HomeCategoryFilter(
    label: 'Electrical',
    keywords: <String>[
      'wire',
      'cable',
      'switch',
      'bulb',
      'led',
      'electric',
      'mcb',
      'fan',
    ],
  ),
  HomeCategoryFilter(
    label: 'Agriculture & Seeds',
    keywords: <String>['seed', 'fertilizer', 'pesticide', 'spray', 'agri'],
  ),
  HomeCategoryFilter(
    label: 'Pumps & Machines',
    keywords: <String>['pump', 'motor', 'machine', 'compressor'],
  ),
  HomeCategoryFilter(
    label: 'Construction',
    keywords: <String>['cement', 'putty', 'paint', 'drill', 'grinder', 'tool'],
  ),
];

/// Product brands present in [products] (marketplace browse → Brand filter).
List<String> brandsOf(List<Product> products) {
  final brands = <String>{};
  for (final p in products) {
    final brand = p.brand?.trim();
    if (brand != null && brand.isNotEmpty) brands.add(brand);
  }
  final list = brands.toList()..sort();
  return list;
}

/// Filters [products] to the home category named [label]. A null (or unknown)
/// [label] means "All" and returns [products] unchanged.
List<Product> filterProductsByHomeCategory(
    List<Product> products, String? label) {
  if (label == null) return products;
  HomeCategoryFilter? match;
  for (final filter in homeCategoryFilters) {
    if (filter.label == label) {
      match = filter;
      break;
    }
  }
  if (match == null) return products;
  final keywords = match.keywords;
  return products.where((product) {
    final haystack = '${product.title} ${product.brand ?? ''}'.toLowerCase();
    return keywords.any(haystack.contains);
  }).toList();
}

/// Catalog providers for the browse flow.
///
/// The product list is sourced from the shared Experience API (composed products
/// with best-price offers) and cached locally as a fallback when the backend is
/// unreachable, giving the storefront basic offline behaviour.
final productsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final store = ref.watch(localStoreProvider);
  try {
    final products =
        await ref.watch(experienceApiProvider).getComposedProducts(limit: 100);
    await store.writeCatalog(products);
    return products;
  } catch (_) {
    final cached = store.readCatalog();
    if (cached.isNotEmpty) return cached;
    // Dev-only: serve the seeded demo catalog for UI review. In release builds
    // this falls through to rethrow so users see the clean retry state.
    if (AppConfig.useMockData) return demoProducts;
    rethrow;
  }
});

final productProvider =
    FutureProvider.autoDispose.family<Product, String>((ref, id) async {
  try {
    return await ref.watch(experienceApiProvider).getComposedProduct(id);
  } catch (_) {
    if (AppConfig.useMockData) {
      final match = demoProducts.where((p) => p.id == id).firstOrNull;
      if (match != null) return match;
    }
    rethrow;
  }
});

/// Real seller offers for a product, fetched from the shared Experience API
/// (Medusa product + Mercur offers + best-price selection). This is the
/// canonical offer list — it is never manufactured locally.
final composedProductOffersProvider =
    FutureProvider.autoDispose.family<List<ProductSeller>, String>(
        (ref, productId) async {
  final data = await ref.watch(experienceApiProvider).getProduct(productId);
  final offers = (data['offers'] as List<dynamic>? ?? const <dynamic>[])
      .whereType<Map<String, dynamic>>()
      .toList();
  final selectedId =
      (data['commercial']?['selected_seller']?['id']) as String?;
  return offers.map((o) {
    final unit = (o['unit_amount_minor'] as num?)?.toInt() ?? 0;
    final list = (o['list_amount_minor'] as num?)?.toInt();
    final currency = (o['currency_code'] as String?) ?? 'INR';
    return ProductSeller(
      id: o['id'] as String? ?? '',
      name: o['seller_name'] as String? ?? 'Seller',
      price: Money(amount: unit, currencyCode: currency),
      mrp: list != null && list > unit
          ? Money(amount: list, currencyCode: currency)
          : null,
      isBestPrice: o['id'] == selectedId,
    );
  }).toList();
});

/// Seller offers for a product, **best-price first**.
///
/// Serves the canonical offers from the shared Experience API. A small,
/// deterministic dev-only set is derived only when the backend is unreachable
/// (`AppConfig.useMockData`), so no silent seller substitution can reach
/// production.
final productSellersProvider =
    Provider.family<List<ProductSeller>, String>((ref, productId) {
  final real = ref.watch(composedProductOffersProvider(productId)).value;
  if (real != null && real.isNotEmpty) return real;

  if (!AppConfig.useMockData) return const <ProductSeller>[];

  final products = ref.watch(productsProvider).value ?? const <Product>[];
  Product? product;
  for (final p in products) {
    if (p.id == productId) product = p;
  }
  if (product == null || product.price == null) return const <ProductSeller>[];
  final base = product.price!;
  final brand = product.brand ?? 'BuildKart Seller';
  Money bump(int pct) => Money(
        amount: (base.amount * (100 + pct) / 100).round(),
        currencyCode: base.currencyCode,
      );
  return <ProductSeller>[
    ProductSeller(
      id: '${product.id}_s1',
      name: brand,
      price: base,
      mrp: product.mrp,
      rating: product.rating ?? 4.4,
      deliveryNote: 'Free · 2–3 days',
      isBestPrice: true,
    ),
    ProductSeller(
      id: '${product.id}_s2',
      name: 'BuildMart Supplies',
      price: bump(4),
      mrp: base,
      rating: 4.1,
      deliveryNote: 'Free · 4–5 days',
    ),
    ProductSeller(
      id: '${product.id}_s3',
      name: 'TradeHub Store',
      price: bump(9),
      mrp: base,
      rating: 3.9,
      deliveryNote: '₹49 · 5–7 days',
    ),
  ];
});

/// Recently-viewed product ids (client-side history, persisted locally).
class RecentlyViewedNotifier extends Notifier<List<String>> {
  @override
  List<String> build() => ref.read(localStoreProvider).readRecentlyViewed();

  void add(String productId) {
    final deduped = state.where((id) => id != productId).toList();
    final capped = <String>[productId, ...deduped].take(10).toList();
    state = capped;
    ref.read(localStoreProvider).writeRecentlyViewed(capped);
  }
}

final recentlyViewedProvider =
    NotifierProvider<RecentlyViewedNotifier, List<String>>(
        RecentlyViewedNotifier.new);

/// Category-appropriate banner imagery (Pexels) for the home / Browse category
/// banners. Falls back to a general trade shot for "All".
const Map<String, String> _categoryBannerImages = <String, String>{
  'Bathroom & Plumbing':
      'https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=940',
  'Tiles & Plywood':
      'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=940',
  'Electrical':
      'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=940',
  'Agriculture & Seeds':
      'https://images.pexels.com/photos/265216/pexels-photo-265216.jpeg?auto=compress&cs=tinysrgb&w=940',
  'Pumps & Machines':
      'https://images.pexels.com/photos/175709/pexels-photo-175709.jpeg?auto=compress&cs=tinysrgb&w=940',
  'Construction':
      'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=940',
};

/// Banner image for a home/Browse category (changes per category).
String categoryBannerImage(String? label) =>
    _categoryBannerImages[label] ??
    'https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&w=940';

/// Home scroll-feed modules, derived from the catalog. Placeholder structure
/// until a merchandising backend is wired.
final homeModulesProvider =
    Provider.autoDispose<List<MerchandisingModule>>((ref) {
  final products = ref.watch(productsProvider).value ?? const <Product>[];
  if (products.isEmpty) return const <MerchandisingModule>[];

  // Flash Deals / Best Sellers are deterministic collections over the
  // catalogue; badges come from the product itself (review enrichment) so the
  // rails and the "See All" collection filters agree.
  final flashPool = products.where((p) => inFlashDeals(p.id)).toList();
  final bestPool = products.where((p) => inBestSellers(p.id)).toList();
  final flashDeals =
      (flashPool.isNotEmpty ? flashPool : products).take(8).toList();
  final bestSellers =
      (bestPool.isNotEmpty ? bestPool : products.skip(2)).take(8).toList();

  // Recommended + the special "Recently viewed" split slot.
  final recentlyViewed = ref
      .watch(recentlyViewedProvider)
      .map((id) => products.where((p) => p.id == id).firstOrNull)
      .whereType<Product>()
      .toList();
  final splitProducts = (recentlyViewed.isNotEmpty
          ? recentlyViewed.take(2)
          : products.take(2))
      .toList();
  final recommended = products.take(5).toList();

  return <MerchandisingModule>[
    MerchandisingModule(
      type: MerchandisingModuleType.productCarousel,
      title: 'Flash Deals',
      tag: 'Up to 60% OFF',
      products: flashDeals,
    ),
    MerchandisingModule(
      type: MerchandisingModuleType.productCarousel,
      title: 'Best Sellers',
      tag: 'Most Loved',
      products: bestSellers,
    ),
    MerchandisingModule(
      type: MerchandisingModuleType.secondaryBanner,
      banner: MerchandisingBannerData(
        imageUrl:
            'https://images.pexels.com/photos/10284048/pexels-photo-10284048.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
        title: 'Clearance Sale',
        subtitle: 'Up to 70% off select items',
        ctaLabel: 'Shop Now',
      ),
    ),
    MerchandisingModule(
      type: MerchandisingModuleType.productComposition,
      title: 'Recommended for You',
      products: recommended,
      splitSlot: SplitSlot(
        label: 'Recently viewed',
        products: splitProducts,
      ),
    ),
  ];
});
