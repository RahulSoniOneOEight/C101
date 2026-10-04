import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_browse_screens.dart';

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

  testWidgets('catalogue screen filters by category chip', (tester) async {
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

    // Tap the Plumbing chip to filter.
    await tester.tap(find.text('Plumbing'));
    await tester.pumpAndSettle();

    // Plumbing products remain; a hardware product is filtered out.
    expect(find.text('Bib Cock 15mm Full Turn Chrome'), findsOneWidget);
    expect(find.text('CPVC Pipe 3/4 in'), findsOneWidget);
    expect(find.text('Cordless Drill Kit 18V'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
