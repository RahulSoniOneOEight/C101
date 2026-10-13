import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/presentation.dart';

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

  test('maps allowlisted icon keys and falls back safely', () {
    expect(categoryIconFor('construction'), Icons.construction_outlined);
    expect(categoryIconFor('bathroom-plumbing'), Icons.bathtub_outlined);
    expect(categoryIconFor('<script>'), Icons.category_outlined);
    expect(categoryIconFor(''), Icons.category_outlined);
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
