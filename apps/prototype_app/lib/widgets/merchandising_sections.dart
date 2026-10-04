import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/merchandising.dart';
import '../domain/models.dart';

/// Renders a single [MerchandisingModule] as its corresponding section widget.
class MerchandisingModuleView extends StatelessWidget {
  const MerchandisingModuleView({
    required this.module,
    this.onProductTap,
    this.onSeeAll,
    this.onAddToCart,
    super.key,
  });

  final MerchandisingModule module;
  final void Function(Product product)? onProductTap;
  final VoidCallback? onSeeAll;
  final void Function(Product product)? onAddToCart;

  @override
  Widget build(BuildContext context) {
    switch (module.type) {
      case MerchandisingModuleType.secondaryBanner:
        final banner = module.banner!;
        return MerchandisingBanner(
          imageUrl: banner.imageUrl,
          title: banner.title,
          subtitle: banner.subtitle,
          ctaLabel: banner.ctaLabel,
        );
      case MerchandisingModuleType.productCarousel:
        return _headed(
          ProductCarousel(children: _cards(ProductCardVariant.compact)),
        );
      case MerchandisingModuleType.productGrid:
        return _headed(
          ProductGrid(children: _cards(ProductCardVariant.compact)),
        );
      case MerchandisingModuleType.productComposition:
        return _composition();
    }
  }

  Widget _headed(Widget child) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (module.title != null)
          SectionHeader(
            title: module.title!,
            tag: module.tag,
            onSeeAll: onSeeAll,
          ),
        if (module.title != null) const SizedBox(height: AgencySpacing.sm),
        child,
      ],
    );
  }

  Widget _composition() {
    final split = module.splitSlot;
    final Widget special = split == null
        ? const SizedBox.shrink()
        : SplitMerchandisingTile(
            sectionLabel: split.label,
            children: <Widget>[
              for (final p in split.products) _compact(p),
            ],
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (module.title != null)
          SectionHeader(
            title: module.title!,
            tag: module.tag,
            onSeeAll: onSeeAll,
          ),
        if (module.title != null) const SizedBox(height: AgencySpacing.sm),
        ProductCompositionSection(
          regularProducts: _cards(ProductCardVariant.large),
          specialSlot: special,
        ),
      ],
    );
  }

  List<Widget> _cards(ProductCardVariant variant) => <Widget>[
        for (final p in module.products) _card(p, variant),
      ];

  Widget _card(Product p, ProductCardVariant variant) {
    return ProductCard(
      title: p.title,
      priceLabel: p.price?.formatted ?? 'Price on request',
      previousPriceLabel: p.mrp?.formatted,
      discountLabel:
          p.discountPercent == null ? null : '${p.discountPercent}% off',
      imageUrl: p.thumbnail,
      brand: p.brand,
      badges: p.badges,
      variant: variant,
      onPressed: onProductTap == null ? null : () => onProductTap!(p),
      onAddToCart: onAddToCart == null ? null : () => onAddToCart!(p),
    );
  }

  Widget _compact(Product p) {
    return CompactProductItem(
      title: p.title,
      priceLabel: p.price?.formatted ?? '',
      discountLabel:
          p.discountPercent == null ? null : '${p.discountPercent}% off',
      imageUrl: p.thumbnail,
      onPressed: onProductTap == null ? null : () => onProductTap!(p),
      onAdd: onAddToCart == null ? null : () => onAddToCart!(p),
    );
  }
}

/// The module-driven home scroll feed.
class HomeScrollFeed extends StatelessWidget {
  const HomeScrollFeed({
    required this.modules,
    this.header,
    this.onProductTap,
    this.onSeeAll,
    this.onAddToCart,
    super.key,
  });

  final List<MerchandisingModule> modules;
  final Widget? header;
  final void Function(Product product)? onProductTap;
  final VoidCallback? onSeeAll;
  final void Function(Product product)? onAddToCart;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        if (header != null) ...<Widget>[
          header!,
          const SizedBox(height: AgencySpacing.md),
        ],
        for (final module in modules) ...<Widget>[
          MerchandisingModuleView(
            module: module,
            onProductTap: onProductTap,
            onSeeAll: onSeeAll,
            onAddToCart: onAddToCart,
          ),
          const SizedBox(height: AgencySpacing.md),
        ],
      ],
    );
  }
}
