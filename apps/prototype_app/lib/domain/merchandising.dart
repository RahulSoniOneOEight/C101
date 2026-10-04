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

/// Image-led banner content (secondary / contextual banners).
class MerchandisingBannerData {
  const MerchandisingBannerData({
    required this.imageUrl,
    required this.title,
    this.subtitle,
    this.ctaLabel,
  });

  final String imageUrl;
  final String title;
  final String? subtitle;
  final String? ctaLabel;
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
  });

  final MerchandisingModuleType type;
  final String? title;
  final String? tag;
  final List<Product> products;
  final MerchandisingBannerData? banner;
  final SplitSlot? splitSlot;
}
