import 'dart:ui' show Tristate;

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/screens/d2c_shell.dart';
import 'package:shared_preferences/shared_preferences.dart';

Product _product({
  required String id,
  required String title,
  required int price,
  required double rating,
  List<String> badges = const <String>[],
  bool inStock = true,
}) =>
    Product(
      id: id,
      title: title,
      price: Money(amount: price, currencyCode: 'INR'),
      rating: rating,
      badges: badges,
      variants: <ProductVariant>[
        ProductVariant(id: '${id}_v', label: 'Default', inStock: inStock),
      ],
    );

final _products = <Product>[
  _product(
    id: 'p_alpha',
    title: 'Alpha',
    price: 10000,
    rating: 4.6,
    badges: <String>['Limited Deal'],
  ),
  _product(
    id: 'p_beta',
    title: 'Beta',
    price: 50000,
    rating: 3.2,
    inStock: false,
  ),
  _product(
    id: 'p_gamma',
    title: 'Gamma',
    price: 90000,
    rating: 4.2,
    badges: <String>['Clearance'],
  ),
];

Future<void> _pumpBrowse(WidgetTester tester) async {
  tester.view.physicalSize = const Size(600, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        productsProvider.overrideWith((ref) async => _products),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const BrowseScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

bool _selected(WidgetTester tester, String label) {
  final node = tester.getSemantics(find.text(label));
  return node.flagsCollection.isSelected == Tristate.isTrue;
}

void main() {
  testWidgets('sort chips are always visible with Relevance selected',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await _pumpBrowse(tester);

    expect(find.text('Relevance'), findsOneWidget);
    expect(find.text('Price ↑'), findsOneWidget);
    expect(find.text('Price ↓'), findsOneWidget);
    expect(find.text('Rating'), findsOneWidget);
    expect(_selected(tester, 'Relevance'), isTrue);
    expect(_selected(tester, 'Price ↑'), isFalse);

    final header = tester
        .widget<SliverPersistentHeader>(find.byType(SliverPersistentHeader));
    expect(header.pinned, isTrue);
    semantics.dispose();
  });

  testWidgets('tapping a sort chip reorders without opening a menu',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await _pumpBrowse(tester);

    await tester.tap(find.text('Price ↓'));
    await tester.pumpAndSettle();
    expect(_selected(tester, 'Price ↓'), isTrue);
    expect(_selected(tester, 'Relevance'), isFalse);
    // Gamma (900) now leads Alpha (100). The recommended strip is unsorted,
    // so compare the large grid cards by title.
    List<String> gridTitles() => tester
        .widgetList<ProductCard>(find.byType(ProductCard))
        .where((card) => card.variant == ProductCardVariant.large)
        .map((card) => card.title)
        .toList();
    expect(gridTitles().first, 'Gamma');

    await tester.tap(find.text('Price ↑'));
    await tester.pumpAndSettle();
    expect(gridTitles().first, 'Alpha');
    semantics.dispose();
  });

  testWidgets('quick chips apply instantly and Clear all resets filters only',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await _pumpBrowse(tester);

    expect(find.text('Clear all'), findsNothing);
    await tester.tap(find.text('Flash Deal'));
    await tester.pumpAndSettle();
    expect(_selected(tester, 'Flash Deal'), isTrue);
    expect(find.text('1 result'), findsOneWidget);
    expect(find.text('Clear all'), findsOneWidget);

    await tester.tap(find.text('Clear all'));
    await tester.pumpAndSettle();
    expect(find.text('3 results'), findsOneWidget);
    expect(find.text('Clear all'), findsNothing);
    expect(_selected(tester, 'Relevance'), isTrue);
    semantics.dispose();
  });

  testWidgets('filter sheet shows a live count and Reset restores it',
      (tester) async {
    await _pumpBrowse(tester);

    await tester.tap(find.text('Filters'));
    await tester.pumpAndSettle();
    expect(find.text('Reset'), findsOneWidget);
    expect(find.text('Show 3 results'), findsOneWidget);

    await tester.tap(find.text('4★ & up'));
    await tester.pumpAndSettle();
    expect(find.text('Show 2 results'), findsOneWidget);

    await tester.tap(find.text('Reset'));
    await tester.pumpAndSettle();
    expect(find.text('Show 3 results'), findsOneWidget);

    await tester.tap(find.text('Show 3 results'));
    await tester.pumpAndSettle();
    expect(find.text('Show 3 results'), findsNothing);
  });
}
