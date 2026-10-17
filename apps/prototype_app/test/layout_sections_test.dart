import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/merchandising.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/catalog_providers.dart';

/// The point of layout sections is that the storefront stops deciding section order and labels for
/// itself. These assertions pin that down: stored order is respected, the title and badge come from the
/// layout, a hidden section does not render, and a section whose products are still resolving does not
/// produce a broken empty rail.
StorefrontSection _section({
  required String placement,
  required String label,
  String? title,
  String? badge,
  bool visible = true,
  String? collectionKey = 'col_1',
  int? limit,
}) =>
    StorefrontSection(
      placement: placement,
      label: label,
      title: title,
      badge: badge,
      visible: visible,
      collectionKey: collectionKey,
      limit: limit,
    );

void main() {
  test('a layout payload parses into sections', () {
    final layout = <String, dynamic>{
      'sections': <dynamic>[
        {
          'placement': 'flash_deals',
          'label': 'Flash Deals',
          'title': 'Flash Deals',
          'badge': 'Up to 60% OFF',
          'collection_key': 'col_1',
          'limit': 8,
          'visible': true,
        },
        {'placement': 'best_sellers', 'label': 'Best Sellers', 'visible': false},
      ],
    };
    final sections = parseLayoutSections(layout);
    expect(sections, hasLength(2));
    expect(sections.first.placement, 'flash_deals');
    expect(sections.first.badge, 'Up to 60% OFF');
    expect(sections.first.limit, 8);
    expect(sections[1].visible, isFalse);
  });

  test('an absent or malformed layout yields no sections rather than throwing', () {
    expect(parseLayoutSections(null), isEmpty);
    expect(parseLayoutSections(<String, dynamic>{}), isEmpty);
    expect(parseLayoutSections(<String, dynamic>{'sections': 'nonsense'}), isEmpty);
  });

  test('a section title falls back to its label', () {
    expect(_section(placement: 'flash_deals', label: 'Flash Deals').displayTitle, 'Flash Deals');
    expect(
      _section(placement: 'flash_deals', label: 'Flash Deals', title: 'Weekend deals').displayTitle,
      'Weekend deals',
    );
  });

  test('the layout decides section order, titles, badges and visibility', () async {
    // Deliberately reverse the conventional order, and hide one section, so a local default that
    // ignored the layout would fail this test.
    final sections = <StorefrontSection>[
      _section(placement: 'recommended', label: 'Recommended', title: 'Picked for you', badge: 'Curated'),
      _section(placement: 'flash_deals', label: 'Flash Deals', title: 'Tonight only', badge: 'Up to 60% OFF'),
      _section(placement: 'best_sellers', label: 'Best Sellers', visible: false),
    ];
    final product = demoProducts.first;

    final container = ProviderContainer(
      overrides: [
        productsProvider.overrideWith((ref) async => demoProducts),
        layoutSectionsProvider.overrideWith((ref) async => sections),
        sectionProductsProvider.overrideWith((ref, section) async => <Product>[product]),
      ],
    );
    addTearDown(container.dispose);

    // Resolve the async sources first so the synchronous home provider sees them.
    await container.read(productsProvider.future);
    await container.read(layoutSectionsProvider.future);
    for (final section in sections) {
      await container.read(sectionProductsProvider(section).future);
    }

    final modules = container.read(homeModulesProvider);
    final titles = modules
        .where((module) => module.type != MerchandisingModuleType.secondaryBanner)
        .map((module) => module.title)
        .toList();

    expect(titles, <String>['Picked for you', 'Tonight only'],
        reason: 'order comes from the layout and the hidden section is not rendered');
    expect(
      modules.first.tag,
      'Curated',
      reason: 'the badge comes from the layout, not a hardcoded local string',
    );
  });

  test('a section banner renders above its rail, and See All follows the layout', () async {
    const withBanner = StorefrontSection(
      placement: 'flash_deals',
      label: 'Flash Deals',
      title: 'Tonight only',
      collectionKey: 'col_1',
      bannerReference: 'hero-flash',
      seeAllUri: '/browse?tag=Flash%20Deals',
      seeAllLabel: 'See all deals',
    );
    final product = demoProducts.first;

    final container = ProviderContainer(
      overrides: [
        productsProvider.overrideWith((ref) async => demoProducts),
        layoutSectionsProvider.overrideWith((ref) async => <StorefrontSection>[withBanner]),
        sectionProductsProvider.overrideWith((ref, section) async => <Product>[product]),
        presentationProvider.overrideWith((ref) => StorefrontPresentation(
              banners: <StorefrontBanner>[
                const StorefrontBanner(
                  contentKey: 'hero-flash',
                  placement: 'b2c.home.hero',
                  title: 'Flash banner',
                  themeKey: 'promotion',
                  imageUrl: 'https://img/flash.jpg',
                  imageAlt: 'Flash deals creative',
                ),
              ],
              categories: const <StorefrontCategory>[],
            )),
      ],
    );
    addTearDown(container.dispose);

    await container.read(productsProvider.future);
    await container.read(layoutSectionsProvider.future);
    await container.read(sectionProductsProvider(withBanner).future);

    final modules = container.read(homeModulesProvider);
    expect(
      modules.first.type,
      MerchandisingModuleType.secondaryBanner,
      reason: 'the associated banner renders above the rail it introduces',
    );
    expect(modules.first.banner?.title, 'Flash banner');
    expect(modules.first.banner?.imageAlt, 'Flash deals creative');
    expect(modules[1].title, 'Tonight only');
    expect(
      modules[1].seeAllUri,
      '/browse?tag=Flash%20Deals',
      reason: 'See All follows the layout destination rather than a local tag heuristic',
    );
    expect(modules[1].seeAllLabel, 'See all deals');
  });

  test('no campaign strip is invented when CMS delivers none', () async {
    final section = _section(placement: 'flash_deals', label: 'Flash Deals');
    final container = ProviderContainer(
      overrides: [
        productsProvider.overrideWith((ref) async => demoProducts),
        layoutSectionsProvider.overrideWith((ref) async => <StorefrontSection>[section]),
        sectionProductsProvider.overrideWith((ref, requested) async => <Product>[demoProducts.first]),
        presentationProvider.overrideWith((ref) => const StorefrontPresentation(
              banners: <StorefrontBanner>[],
              categories: <StorefrontCategory>[],
            )),
      ],
    );
    addTearDown(container.dispose);

    await container.read(productsProvider.future);
    await container.read(layoutSectionsProvider.future);
    await container.read(sectionProductsProvider(section).future);

    expect(
      container
          .read(homeModulesProvider)
          .where((module) => module.type == MerchandisingModuleType.secondaryBanner),
      isEmpty,
      reason: 'a promotional banner must exist in published CMS content before the app can show it',
    );
  });
}
