// U-011 evidence captures: Browse at 360 / 390 / 414 and the Home grid.
//
// Regenerate with:
//   flutter test test/u011_capture_test.dart --update-goldens
// The PNGs are copied into client-projects/client101/evidence/U-011/screenshots.
@Tags(<String>['golden'])
library;

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

Future<void> _capture(
  WidgetTester tester,
  Widget home,
  Size size,
  String name,
) async {
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
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/u011/$name.png'),
  );
}

void main() {
  for (final width in <double>[360, 390, 414]) {
    testWidgets('capture browse ${width.toInt()}', (tester) async {
      await _capture(
        tester,
        const BrowseScreen(),
        Size(width, 844),
        'browse_${width.toInt()}',
      );
    });
  }

  testWidgets('capture home grid 390', (tester) async {
    // Tall surface so the Home product grid is inside the capture.
    await _capture(
      tester,
      const ProductListScreen(),
      const Size(390, 1800),
      'home_grid_390',
    );
  });
}
