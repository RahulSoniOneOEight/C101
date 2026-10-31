// U-011 Browse geometry harness.
//
// Prints the measured geometry at 360 / 390 / 414 (quoted in the closeout) and
// asserts the acceptance band: 0.64 tiles, 8/8/16 section rhythm, no duplicate
// "Recommended for you" strip, 64 px Browse rail items vs 72 on Home.
//
// Run: flutter test test/browse_layout_u011_test.dart
import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/d2c_shell.dart';
import 'package:prototype_app/screens/product_list_screen.dart';
import 'package:prototype_app/widgets/storefront_control_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeApi extends ExperienceApi {
  _FakeApi() : super(Dio());

  @override
  Future<List<Product>> getComposedProducts({
    int limit = 50,
    int offset = 0,
    String? collectionId,
    String channel = 'b2c',
    String? catalogueImport,
  }) async =>
      demoProducts;

  @override
  Future<List<Product>> getAllComposedProducts({
    String channel = 'b2c',
    String? catalogueImport,
    int pageSize = 250,
    int maxPages = 20,
  }) async =>
      demoProducts;

  @override
  Future<List<StorefrontSection>> getLayoutSections(
          {String locale = 'en-IN', String channel = 'b2c'}) async =>
      const <StorefrontSection>[];
}

Future<void> _pump(WidgetTester tester, Widget home, Size size) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        sharedPreferencesProvider.overrideWithValue(prefs),
        experienceApiProvider.overrideWithValue(_FakeApi()),
      ],
      child: MaterialApp(theme: AgencyTheme.light(), home: home),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final width in <double>[360, 390, 414]) {
    testWidgets('browse geometry at ${width.toInt()}', (tester) async {
      await _pump(tester, const BrowseScreen(), Size(width, 844));

      final gridCard = find.descendant(
        of: find.byType(SliverGrid),
        matching: find.byType(ProductCard),
      );
      final card = tester.getRect(gridCard.first);
      final banner = tester.getRect(find.byType(MerchandisingBanner).first);
      final rail = tester.getRect(find.byType(CategoryIconRail).first);
      final bar = tester.getRect(find.byType(StorefrontControlBar).first);
      final railItem = tester.getRect(find.byType(CategoryIconItem).first);
      final railItem2 = tester.getRect(find.byType(CategoryIconItem).at(1));
      final aspect = card.width / card.height;

      // ignore: avoid_print
      print('BROWSE ${width.toInt()} card=${card.width.toStringAsFixed(1)}x'
          '${card.height.toStringAsFixed(1)} aspect=${aspect.toStringAsFixed(3)} '
          'top=${card.top.toStringAsFixed(1)} '
          'bannerToRail=${(rail.top - banner.bottom).toStringAsFixed(1)} '
          'railToBar=${(bar.top - rail.bottom).toStringAsFixed(1)} '
          'barToGrid=${(card.top - bar.bottom).toStringAsFixed(1)} '
          'railItem=${railItem.width.toStringAsFixed(1)} '
          'railGap=${(railItem2.left - railItem.right).toStringAsFixed(1)}');

      // R1 — 0.64 tiles (160x250 / 175x273 / 187x292, +/-2 px).
      expect(aspect, inInclusiveRange(0.62, 0.66));
      final expectedHeight = card.width / 0.64;
      expect((card.height - expectedHeight).abs(), lessThanOrEqualTo(2.0));
      expect(card.width, (width - 32 - 8) / 2);

      // R3 — the duplicate strip is gone from Browse.
      expect(find.text('Recommended for you'), findsNothing);

      // R5 — 8 px banner bottom + 8 px rail top, 16 px bar-to-grid.
      expect(rail.top - banner.bottom, closeTo(16.0, 0.01));
      expect(card.top - bar.bottom, closeTo(16.0, 0.01));

      // R7 — 64 px items with 8 px gaps at <=390, 72/16 above that.
      if (width <= 390) {
        expect(railItem.width, 64.0);
        expect(railItem2.left - railItem.right, closeTo(8.0, 0.01));
      } else {
        expect(railItem.width, 72.0);
        expect(railItem2.left - railItem.right, closeTo(16.0, 0.01));
      }

      // R4 — search header pinned, sort/filter bar not.
      final headers = tester
          .widgetList<SliverPersistentHeader>(
              find.byType(SliverPersistentHeader))
          .toList();
      expect(headers.first.pinned, isTrue);
      expect(headers.last.pinned, isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('home grid geometry at ${width.toInt()}', (tester) async {
      await _pump(tester, const ProductListScreen(), Size(width, 844));
      final gridCard = find.descendant(
        of: find.byType(GridView),
        matching: find.byType(ProductCard),
      );
      final card = tester.getRect(gridCard.first);
      final railItem = tester.getRect(find.byType(CategoryIconItem).first);
      final railItem2 = tester.getRect(find.byType(CategoryIconItem).at(1));

      // ignore: avoid_print
      print('HOME ${width.toInt()} card=${card.width.toStringAsFixed(1)}x'
          '${card.height.toStringAsFixed(1)} '
          'aspect=${(card.width / card.height).toStringAsFixed(3)} '
          'railItem=${railItem.width.toStringAsFixed(1)} '
          'railGap=${(railItem2.left - railItem.right).toStringAsFixed(1)}');

      // P1-2 — Home grids share the 0.64 proportion.
      expect(card.width / card.height, inInclusiveRange(0.62, 0.66));
      // P2-1 — Home keeps the 72 px rail item and 16 px gap.
      expect(railItem.width, 72.0);
      expect(railItem2.left - railItem.right, closeTo(16.0, 0.01));
      expect(tester.takeException(), isNull);
    });
  }
}
