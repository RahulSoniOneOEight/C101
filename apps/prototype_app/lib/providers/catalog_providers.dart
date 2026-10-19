import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config.dart';
import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/merchandising.dart';
import '../domain/image_quality_order.dart';
import '../domain/models.dart';
import '../domain/presentation.dart';
import '../domain/review_catalogue.dart';

/// Backend storefront presentation (hero/campaign banners and root category
/// presentation). Never throws: on failure it resolves to the governed fallback
/// so the storefront stays usable offline and before CMS content exists.
final storefrontPresentationProvider =
    FutureProvider<StorefrontPresentation>((ref) async {
  try {
    final presentation =
        await ref.watch(experienceApiProvider).getPresentation();
    return presentation.withStorefrontCategoryPriority();
  } catch (_) {
    return const StorefrontPresentation(
      banners: fallbackBanners,
      categories: fallbackCategories,
    );
  }
});

/// Synchronous presentation accessor that always returns a usable value.
final presentationProvider = Provider<StorefrontPresentation>((ref) {
  return ref.watch(storefrontPresentationProvider).value ??
      const StorefrontPresentation(
        banners: fallbackBanners,
        categories: fallbackCategories,
      );
});

/// Root category rail labels and icons, delivered by the Experience API and
/// composed from commerce category identity plus CMS presentation.
final categoriesProvider = Provider<List<Category>>((ref) {
  final categories = ref.watch(presentationProvider).categories;
  return categories
      .map((category) => Category(
            label: category.label,
            icon: categoryIconFor(category.iconKey),
          ))
      .toList();
});

/// Home hero carousel banners, priority-ordered by the backend.
final heroBannersProvider = Provider<List<StorefrontBanner>>((ref) {
  return ref.watch(presentationProvider).bannersFor('home.hero');
});

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
    label: 'Tiles & Building Materials',
    keywords: <String>[
      'tile',
      'plywood',
      'board',
      'ceramic',
      'marble',
      'granite',
      'cement',
      'brick',
      'stone',
    ],
  ),
  HomeCategoryFilter(
    label: 'Lighting & Electrical',
    keywords: <String>[
      'wire',
      'cable',
      'switch',
      'bulb',
      'led',
      'electric',
      'mcb',
      'fan',
      'panel',
      'light',
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
    label: 'Building & Construction',
    keywords: <String>[
      'cement',
      'putty',
      'steel',
      'sand',
      'brick',
      'drill',
      'grinder'
    ],
  ),
  // The taxonomy added on 2026-10-19. Keywords stay a heuristic: the composed product payload
  // still carries no category ids, so these must be maintained alongside Category presentation.
  HomeCategoryFilter(
    label: 'Tools & Hardware',
    keywords: <String>[
      'drill',
      'saw',
      'tool',
      'hammer',
      'wrench',
      'screwdriver',
      'fastener'
    ],
  ),
  HomeCategoryFilter(
    label: 'Paints & Finishes',
    keywords: <String>[
      'paint',
      'primer',
      'enamel',
      'varnish',
      'putty',
      'finish'
    ],
  ),
  HomeCategoryFilter(
    label: 'Automotive & Tyres',
    keywords: <String>['tyre', 'tire', 'oil', 'lubricant', 'battery', 'auto'],
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
    if (filter.label.toLowerCase() == label.toLowerCase()) {
      match = filter;
      break;
    }
  }
  // Products sourced from the catalogue carry their L1 category verbatim, so the
  // filter is exact. Keyword guessing is only for the demonstration catalogue,
  // which has no category identity; without this, "Tools & Hardware" matched only
  // titles containing "tool/drill/saw" and missed most of its 71 imported SKUs.
  final target = label.trim().toLowerCase();
  final keywords = match?.keywords ??
      label
          .toLowerCase()
          .split(RegExp(r'[^a-z0-9]+'))
          .where((word) => word.length > 2)
          .toList();
  return products.where((product) {
    final category = product.categoryLabel?.trim().toLowerCase();
    if (category != null && category.isNotEmpty) return category == target;
    if (keywords.isEmpty) return false;
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
    final api = ref.watch(experienceApiProvider);
    // Read every page: the catalogue is 233 grouped products / 500 SKUs, and a
    // single fixed page silently hid 133 of them.
    var products = await api.getAllComposedProducts(
      catalogueImport: AppConfig.catalogueImport,
    );
    // A catalogue with no import marker (or a differently named one) must still
    // render rather than showing an empty storefront.
    if (products.isEmpty) {
      products = await api.getAllComposedProducts();
    }
    products = orderProductsByDisplayImage(products);
    await store.writeCatalog(products);
    return products;
  } catch (_) {
    final cached = store.readCatalog();
    if (cached.isNotEmpty) return orderProductsByDisplayImage(cached);
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
final composedProductOffersProvider = FutureProvider.autoDispose
    .family<List<ProductSeller>, String>((ref, productId) async {
  final data = await ref.watch(experienceApiProvider).getProduct(productId);
  final offers = (data['offers'] as List<dynamic>? ?? const <dynamic>[])
      .whereType<Map<String, dynamic>>()
      .toList();
  final selectedId = (data['commercial']?['selected_seller']?['id']) as String?;
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

/// Banner image for a home/Browse category. Prefers the backend presentation
/// for the category, then the reviewed static map, then a generic trade shot.
final categoryBannerImageProvider =
    Provider.family<String, String?>((ref, label) {
  final match = ref.watch(presentationProvider).categoryByLabel(label);
  return match?.bannerImageUrl ??
      _categoryBannerImages[label] ??
      fallbackCategoryBannerImage;
});

/// B2B storefront presentation, fetched for the b2b channel.
///
/// The B2B surfaces previously fell back to a hard-coded per-category image map. They now read the
/// same CMS content the B2C surfaces read, which is the only way a B2B category banner authored in
/// the console can actually appear.
final b2bPresentationProvider =
    FutureProvider<StorefrontPresentation>((ref) async {
  try {
    final presentation =
        await ref.watch(experienceApiProvider).getPresentation(channel: 'b2b');
    return presentation.withStorefrontCategoryPriority();
  } catch (_) {
    return const StorefrontPresentation(
      banners: <StorefrontBanner>[],
      categories: <StorefrontCategory>[],
    );
  }
});

/// Banner image published for a B2B category, or null when the CMS has none for that category yet.
///
/// Returning null is deliberate: the caller renders the shared governed placeholder rather than an
/// invented per-category image, so an operator can tell the difference between "authored" and
/// "not authored".
final b2bCategoryBannerImageProvider =
    Provider.family<String?, String?>((ref, label) {
  return ref
      .watch(b2bPresentationProvider)
      .value
      ?.categoryByLabel(label)
      ?.bannerImageUrl;
});

/// Same banner, resolved by commerce category id.
///
/// The trade rail selects categories by id (CHG-048), and the CMS keys category banners by that id,
/// so a label lookup silently fell back to the placeholder after the rail switched to ids.
final b2bCategoryBannerImageByIdProvider =
    Provider.family<String?, String?>((ref, id) {
  return ref
      .watch(b2bPresentationProvider)
      .value
      ?.categoryById(id)
      ?.bannerImageUrl;
});

/// CMS alternative text for the B2B category banner, or null when none is authored.
final b2bCategoryBannerAltProvider =
    Provider.family<String?, String?>((ref, label) {
  return ref
      .watch(b2bPresentationProvider)
      .value
      ?.categoryByLabel(label)
      ?.bannerImageAlt;
});

final b2bCategoryBannerAltByIdProvider =
    Provider.family<String?, String?>((ref, id) {
  return ref
      .watch(b2bPresentationProvider)
      .value
      ?.categoryById(id)
      ?.bannerImageAlt;
});

/// Storefront layout sections for the B2C storefront, delivered by the backend.
///
/// Empty when no layout is configured or the API is unavailable, in which case the home falls back to
/// its local defaults rather than rendering nothing.
final layoutSectionsProvider =
    FutureProvider.autoDispose<List<StorefrontSection>>((ref) async {
  try {
    return await ref
        .watch(experienceApiProvider)
        .getLayoutSections(channel: 'b2c');
  } catch (_) {
    return const <StorefrontSection>[];
  }
});

/// Storefront layout sections for the B2B storefront, delivered by the backend.
///
/// Separate from the B2C provider because a layout is authored per channel; the B2B home reads this
/// one so an operator-configured order, label or visibility actually reaches the trade surfaces.
final b2bLayoutSectionsProvider =
    FutureProvider.autoDispose<List<StorefrontSection>>((ref) async {
  try {
    return await ref
        .watch(experienceApiProvider)
        .getLayoutSections(channel: 'b2b');
  } catch (_) {
    return const <StorefrontSection>[];
  }
});

/// Hero rotation interval for a channel, authored per layout in the console.
///
/// 0 (the default) keeps the carousel still, so an unset or failed read never introduces motion.
final heroRotationMsProvider =
    FutureProvider.family<int, String>((ref, channel) async {
  try {
    return await ref
        .watch(experienceApiProvider)
        .getHeroRotationMs(channel: channel);
  } catch (_) {
    return 0;
  }
});

/// Operator-authored B2B quick-order lists and trade-offer collections.
///
/// CHG-062: an empty list is a normal state. The app then keeps its governed
/// category-rule defaults, so the trade surface never depends on an operator
/// having authored content first.
final b2bCuratedCollectionsProvider =
    FutureProvider.autoDispose<List<CuratedCollection>>((ref) async {
  // Widget tests and processes that have not bootstrapped the live runtime keep
  // the governed rule defaults instead of starting a request.
  if (!AppConfig.liveCatalogueEnabled) return const <CuratedCollection>[];
  try {
    return await ref.watch(experienceApiProvider).getCuratedCollections();
  } catch (_) {
    return const <CuratedCollection>[];
  }
});

/// Products for one layout section, resolved from its commerce collection.
///
/// The section stores a reference; commerce resolves membership, so adding a product to the collection
/// changes this rail with no editorial action.
final sectionProductsProvider = FutureProvider.family
    .autoDispose<List<Product>, StorefrontSection>((ref, section) async {
  final collectionId = section.collectionKey;
  if (collectionId == null || collectionId.isEmpty) return const <Product>[];
  try {
    return await ref.watch(experienceApiProvider).getComposedProducts(
          limit: (section.limit != null && section.limit! > 0)
              ? section.limit!
              : 12,
          collectionId: collectionId,
        );
  } catch (_) {
    return const <Product>[];
  }
});

/// Home scroll-feed modules.
///
/// When the backend delivers layout sections they decide the sections, their order, titles, badges,
/// limits and visibility. With no configured layout the governed local defaults are used, so the home
/// never renders empty because merchandising has not been configured yet.
final homeModulesProvider =
    Provider.autoDispose<List<MerchandisingModule>>((ref) {
  final products = ref.watch(productsProvider).value ?? const <Product>[];
  if (products.isEmpty) return const <MerchandisingModule>[];

  // The campaign strip is banner presentation, not a section, so it keeps its own source. Unlike the
  // catalogue fallback, it is intentionally absent when no published CMS banner exists: operators
  // must never see an unmanageable promotional banner appear from app seed code.
  final campaignStrip = ref
      .watch(presentationProvider)
      .bannersFor('home.campaign-strip')
      .firstOrNull;
  final stripImageUrl = campaignStrip?.imageUrl;
  final stripModule =
      campaignStrip != null && stripImageUrl != null && stripImageUrl.isNotEmpty
          ? MerchandisingModule(
              type: MerchandisingModuleType.secondaryBanner,
              banner: MerchandisingBannerData(
                imageUrl: stripImageUrl,
                imageAlt: campaignStrip.imageAlt,
                title: campaignStrip.title,
                // No invented copy. If the banner has no body, the strip renders without a claim.
                subtitle: campaignStrip.body,
                ctaLabel: campaignStrip.actionLabel,
                actionUri: campaignStrip.actionUri,
              ),
            )
          : null;

  // --- layout-driven ------------------------------------------------------------
  final sections =
      (ref.watch(layoutSectionsProvider).value ?? const <StorefrontSection>[])
          .where((section) => section.visible)
          .toList();
  final banners = ref.watch(presentationProvider).banners;
  final recentlyViewedIds = ref.watch(recentlyViewedProvider);
  final splitSlot = _splitSlotFor(recentlyViewedIds, products);
  final layoutModules = <MerchandisingModule>[];
  for (final section in sections) {
    final sectionProducts = ref.watch(sectionProductsProvider(section)).value;
    // Still resolving, or the referenced collection has no products. A section
    // that resolves nothing must not render a header over a blank rail; when all
    // sections are empty the home falls through to the governed catalogue
    // defaults below.
    if (sectionProducts == null || sectionProducts.isEmpty) continue;

    // A section may carry a banner managed under Merchandising → Banners. It renders above the rail so
    // the creative and the products it introduces stay together.
    final bannerKey = section.bannerReference;
    if (bannerKey != null && bannerKey.isNotEmpty) {
      final banner =
          banners.where((b) => b.contentKey == bannerKey).firstOrNull;
      final imageUrl = banner?.imageUrl;
      if (banner != null && imageUrl != null && imageUrl.isNotEmpty) {
        layoutModules.add(MerchandisingModule(
          type: MerchandisingModuleType.secondaryBanner,
          banner: MerchandisingBannerData(
            imageUrl: imageUrl,
            imageAlt: banner.imageAlt,
            title: banner.title,
            subtitle: banner.body,
            ctaLabel: banner.actionLabel,
            actionUri: banner.actionUri,
          ),
        ));
      }
    }

    switch (section.placement) {
      case 'flash_deals':
      case 'best_sellers':
      case 'seasonal':
      case 'best_deals':
        layoutModules.add(MerchandisingModule(
          type: MerchandisingModuleType.productCarousel,
          title: section.displayTitle,
          tag: section.badge,
          products: sectionProducts,
          seeAllLabel: section.seeAllLabel,
          seeAllUri: section.seeAllUri,
        ));
      case 'recommended':
        // The split tile occupies the sixth cell, so an even product count would leave a dangling
        // cell on the last row. One product is held back to keep the composition rectangular.
        final compositionProducts =
            splitSlot != null && sectionProducts.length.isEven
                ? sectionProducts.take(sectionProducts.length - 1).toList()
                : sectionProducts;
        layoutModules.add(MerchandisingModule(
          type: MerchandisingModuleType.productComposition,
          title: section.displayTitle,
          tag: section.badge,
          products: compositionProducts,
          seeAllLabel: section.seeAllLabel,
          seeAllUri: section.seeAllUri,
          // The split tile is the customer's own history, so it survives a layout-driven home.
          // Nothing is invented: without history the sixth cell is simply absent.
          splitSlot: splitSlot,
        ));
      default:
        // Buy Again, Schemes and the Trade Offers group are not rendered by this surface yet.
        break;
    }
  }
  if (layoutModules.isNotEmpty) {
    return <MerchandisingModule>[
      ...layoutModules,
      if (stripModule != null) stripModule,
    ];
  }

  // --- governed local defaults ---------------------------------------------------
  // Flash Deals / Best Sellers are deterministic collections over the
  // catalogue; badges come from the product itself (review enrichment) so the
  // rails and the "See All" collection filters agree.
  //
  // CHG-065: the first three categories the operator prioritised lead every
  // home rail. Within a rail their products come first, then the remaining
  // catalogue fills the rest, so the modules carry more of the assortment the
  // brief called out without hiding the rest.
  // Balanced priority: each category takes a turn before any category can take
  // a second slot, so a large category cannot fill a rail. Tools are
  // power-tool-first inside their own bucket.
  const priorityCategories = <String>[
    'lighting & electrical',
    'bathroom & plumbing',
    'paints & finishes',
    'tools & hardware',
  ];
  bool isPowerTool(Product product) {
    final title = product.title.toLowerCase();
    return <String>[
      'drill',
      'grinder',
      'cutter',
      'saw',
      'sander',
      'polisher',
      'blower',
      'impact',
      'rotary',
      'cordless',
      'machine',
    ].any(title.contains);
  }

  List<Product> prioritised(List<Product> pool, int count) {
    final buckets = <String, List<Product>>{
      for (final label in priorityCategories)
        label: pool
            .where((p) => (p.categoryLabel ?? '').trim().toLowerCase() == label)
            .toList(),
    };
    buckets['tools & hardware']!
        .sort((a, b) => (isPowerTool(b) ? 1 : 0) - (isPowerTool(a) ? 1 : 0));
    final picked = <Product>[];
    final seen = <String>{};
    var round = 0;
    while (picked.length < count && round < 40) {
      for (final label in priorityCategories) {
        final bucket = buckets[label]!;
        if (round < bucket.length) {
          final product = bucket[round];
          if (seen.add(product.id)) picked.add(product);
        }
        if (picked.length >= count) break;
      }
      round++;
    }
    for (final product in pool) {
      if (picked.length >= count) break;
      if (seen.add(product.id)) picked.add(product);
    }
    return picked;
  }

  final flashPool = products.where((p) => inFlashDeals(p.id)).toList();
  final bestPool = products.where((p) => inBestSellers(p.id)).toList();
  final flashDeals =
      prioritised(flashPool.isNotEmpty ? flashPool : products, 16);
  final bestSellers = prioritised(
      bestPool.isNotEmpty ? bestPool : products.skip(2).toList(), 16);

  // Recommended + the special "Recently viewed" split slot.
  final recommended = prioritised(products, 8);

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
    if (stripModule != null) stripModule,
    MerchandisingModule(
      type: MerchandisingModuleType.productComposition,
      title: 'Recommended for You',
      products: recommended,
      splitSlot: splitSlot,
    ),
  ];
});

/// The "Recently viewed" tile, built only from products this customer actually opened.
///
/// Never fills the slot with arbitrary catalogue items: an empty history means no tile, rather than
/// two products labelled as recent.
SplitSlot? _splitSlotFor(List<String> viewedIds, List<Product> products) {
  if (viewedIds.isEmpty) return null;
  final viewed = viewedIds
      .map((id) => products.where((product) => product.id == id).firstOrNull)
      .whereType<Product>()
      .take(2)
      .toList();
  if (viewed.isEmpty) return null;
  return SplitSlot(label: 'Recently viewed', products: viewed);
}
