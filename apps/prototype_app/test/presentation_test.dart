import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/merchandising.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/widgets/merchandising_sections.dart';

void main() {
  test('parses the backend presentation payload', () {
    final presentation = StorefrontPresentation.fromJson(<String, dynamic>{
      'banners': <dynamic>[
        <String, dynamic>{
          'content_key': 'cms-hero',
          'placement': 'home.hero',
          'title': 'CMS hero',
          'theme_key': 'trust',
          'priority': 5,
        },
        <String, dynamic>{
          'content_key': 'cms-strip',
          'placement': 'home.campaign-strip',
          'title': 'Strip',
          'theme_key': 'promotion',
        },
      ],
      'categories': <dynamic>[
        <String, dynamic>{
          'category_id': 'pcat_construction',
          'name': 'Construction',
          'label': 'Construction & Site',
          'icon_key': 'construction',
          'short_text': 'Cement and steel',
        },
      ],
    });

    expect(presentation.banners, hasLength(2));
    expect(presentation.bannersFor('home.hero'), hasLength(1));
    expect(presentation.bannersFor('home.hero').single.themeKey, 'trust');

    final category = presentation.categoryByLabel('Construction & Site');
    expect(category, isNotNull);
    // Resolves by commerce name too.
    expect(presentation.categoryByLabel('Construction')?.id, 'pcat_construction');
    expect(presentation.categoryByLabel('Missing'), isNull);
  });

  test('no seed banner carries a quantified claim', () {
    for (final banner in fallbackBanners) {
      final copy = '${banner.title} ${banner.body ?? ''}'.toLowerCase();
      expect(banner.body, isNull,
          reason: '${banner.contentKey}: a seed body is a claim shown before any operator authors one');
      expect(copy, isNot(contains('%')), reason: '${banner.contentKey}: no percentage saving');
      expect(copy, isNot(contains('sku')), reason: '${banner.contentKey}: no catalogue size');
      expect(copy, isNot(contains('₹')), reason: '${banner.contentKey}: no delivery threshold');
    }
  });

  test('maps allowlisted icon keys and falls back safely', () {
    expect(categoryIconFor('construction'), Icons.construction_outlined);
    expect(categoryIconFor('bathroom-plumbing'), Icons.bathtub_outlined);
    expect(categoryIconFor('<script>'), Icons.category_outlined);
    expect(categoryIconFor(''), Icons.category_outlined);
  });

  testWidgets('campaign strip follows the backend banner action target',
      (tester) async {
    String? followed;
    const module = MerchandisingModule(
      type: MerchandisingModuleType.secondaryBanner,
      banner: MerchandisingBannerData(
        imageUrl: 'https://example.com/clearance.jpg',
        title: 'Clearance Sale',
        subtitle: 'Selected lines only',
        ctaLabel: 'Shop Now',
        actionUri: '/browse?tag=Clearance%20Sale',
      ),
    );

    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(
        body: MerchandisingModuleView(
          module: module,
          onBannerAction: (uri) => followed = uri,
        ),
      ),
    ));
    await tester.tap(find.text('Shop Now'));
    expect(followed, '/browse?tag=Clearance%20Sale');
  });

  test('governed fallback mirrors the shipped hero banners and categories', () {
    final hero = fallbackBanners.where((b) => b.placement == 'home.hero').toList();
    expect(hero, hasLength(3));
    expect(hero.map((b) => b.title), contains('Monsoon Ready'));
    expect(fallbackCategories, hasLength(6));
    expect(
      fallbackCategories.map((c) => c.iconKey),
      containsAll(<String>['construction', 'electrical']),
    );
  });
}
