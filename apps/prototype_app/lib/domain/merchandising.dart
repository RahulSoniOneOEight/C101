/// Merchandising module models for the home scroll feed.
library;

import 'models.dart';

/// The kind of merchandising module rendered in the home scroll feed.
enum MerchandisingModuleType {
  secondaryBanner,
  productCarousel,
  productGrid,
  productComposition,
}

/// Image-led banner content (secondary / contextual banners). All fields are
/// backend-managed presentation; `actionUri` is the backend action target.
class MerchandisingBannerData {
  const MerchandisingBannerData({
    required this.imageUrl,
    required this.title,
    this.imageAlt,
    this.subtitle,
    this.ctaLabel,
    this.actionUri,
  });

  final String imageUrl;
  final String title;

  /// CMS alternative text for [imageUrl]. Passed to the image's semantic label so a screen reader
  /// announces the creative instead of skipping it.
  final String? imageAlt;
  final String? subtitle;
  final String? ctaLabel;
  final String? actionUri;
}

/// The special (sixth) slot in a product-composition module — a merchandising
/// strategy label plus two compact products (e.g. "Recently viewed").
class SplitSlot {
  const SplitSlot({required this.label, required this.products});

  final String label;
  final List<Product> products;
}

/// A data-driven unit of the home scroll feed. One widget tree is rendered per
/// [type]; content is never hardcoded inside the module.
class MerchandisingModule {
  const MerchandisingModule({
    required this.type,
    this.title,
    this.tag,
    this.products = const <Product>[],
    this.banner,
    this.splitSlot,
    this.seeAllLabel,
    this.seeAllUri,
  });

  final MerchandisingModuleType type;
  final String? title;
  final String? tag;
  final List<Product> products;
  final MerchandisingBannerData? banner;
  final SplitSlot? splitSlot;

  /// Where "See All" goes, when the layout configured a destination. Null means the screen decides.
  final String? seeAllLabel;
  final String? seeAllUri;
}
