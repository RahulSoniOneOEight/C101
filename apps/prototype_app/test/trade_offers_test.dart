import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/trade_offers_providers.dart';
import 'package:prototype_app/screens/b2b_offers_screen.dart';

void main() {
  test('collections are backend-configurable with 3 featured on home', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final all = container.read(tradeOfferCollectionsProvider);
    final featured = container.read(featuredTradeOffersProvider);
    expect(all.length, greaterThanOrEqualTo(6));
    expect(featured.length, 3);
    expect(featured.map((c) => c.title).toList(),
        <String>['Seasonal', 'Best Deals', 'Schemes']);
  });

  testWidgets('Trade Offers page selector switches collections in place',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const TradeOffersPage(),
      ),
    ));

    expect(find.text('Trade Offers & Deals'), findsOneWidget);
    expect(find.text('OFFER & DEAL COLLECTIONS'), findsOneWidget);
    // Default = Seasonal.
    expect(find.textContaining('Selected Collection: Seasonal'), findsOneWidget);
    expect(find.byType(TradeProductCardCompact), findsWidgets);

    // Switch to Best Deals — grid refreshes in place.
    await tester.tap(find.text('Best Deals'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Selected Collection: Best Deals'), findsOneWidget);
    expect(find.byType(TradeProductCardCompact), findsWidgets);

    expect(tester.takeException(), isNull);
  });

  testWidgets('empty collection param falls back to the first collection',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const TradeOffersPage(initialCollectionId: ''),
      ),
    ));
    expect(find.textContaining('Selected Collection: Seasonal'), findsOneWidget);
    expect(find.byType(TradeProductCardCompact), findsWidgets);
    expect(find.text('0 Products'), findsNothing);
  });
}
