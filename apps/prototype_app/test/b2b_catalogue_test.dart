import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_browse_screens.dart';
import 'package:prototype_app/widgets/storefront_control_bar.dart';

void main() {
  test('trade catalogue is data-driven and category-tagged', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final catalogue = container.read(tradeCatalogueProvider);
    final categories = container.read(tradeDashboardProvider).categories;

    expect(catalogue, isNotEmpty);
    expect(catalogue.every((p) => p.product.title.isNotEmpty), isTrue);
    // Seasonal + category flags are present so the merchandising surfaces work.
    expect(catalogue.any((p) => p.seasonal), isTrue);
    expect(catalogue.any((p) => p.savingsPercent != null), isTrue);
    // Every product belongs to a known category (or the catch-all).
    final known = {'all', for (final c in categories) c.id};
    expect(catalogue.every((p) => known.contains(p.categoryId)), isTrue);
  });

  testWidgets('catalogue exposes compact sort and filter chips',
      (tester) async {
    tester.view.physicalSize = const Size(900, 1300);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BCatalogueScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Recommended'), findsOneWidget);
    expect(find.text('Price \u2191'), findsOneWidget);
    expect(find.text('Price \u2193'), findsOneWidget);
    expect(find.text('Discount'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(StorefrontControlBar),
        matching: find.text('Filters'),
      ),
      findsOneWidget,
    );
    expect(find.text('Best Deals'), findsOneWidget);
    expect(find.text('In stock'), findsOneWidget);

    String firstTitle() => tester
        .widgetList<TradeProductCardCompact>(
            find.byType(TradeProductCardCompact))
        .first
        .title;

    await tester.tap(find.text('Price \u2193'));
    await tester.pumpAndSettle();
    expect(firstTitle(), 'Cordless Drill Kit 18V');

    await tester.tap(find.text('Price \u2191'));
    await tester.pumpAndSettle();
    expect(firstTitle(), isNot('Cordless Drill Kit 18V'));

    await tester.tap(find.descendant(
      of: find.byType(StorefrontControlBar),
      matching: find.text('Filters'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Reset'), findsOneWidget);
    expect(find.textContaining('Show '), findsOneWidget);
  });

  testWidgets('catalogue screen filters by category chip', (tester) async {
    tester.view.physicalSize = const Size(900, 1300);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BCatalogueScreen(),
        ),
      ),
    );

    // First product is visible initially.
    expect(find.text('Bib Cock 15mm Full Turn Chrome'), findsOneWidget);

    // Tap the Bathroom & Plumbing chip to filter.
    await tester.tap(find.text('Bathroom & Plumbing'));
    await tester.pumpAndSettle();

    // Plumbing products remain; a hardware product is filtered out.
    expect(find.text('Bib Cock 15mm Full Turn Chrome'), findsOneWidget);
    expect(find.text('CPVC Pipe 3/4 in'), findsOneWidget);
    expect(find.text('Cordless Drill Kit 18V'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
