import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('TradeProductCard renders trade data and dynamic CTA',
      (tester) async {
    await tester.pumpWidget(_wrap(TradeProductCard(
      title: 'Bib Cock 15mm Full Turn Chrome',
      brand: 'JAQUAR',
      stockLabel: 'In Stock (87)',
      savingsLabel: 'Save 11%',
      moqLabel: 'MOQ: 5',
      tiers: const <TradeTierOption>[
        TradeTierOption(quantity: 5, priceLabel: '₹432'),
        TradeTierOption(quantity: 10, priceLabel: '₹427'),
      ],
      selectedTierIndex: 0,
      unitPriceLabel: '₹432/pc',
      mrpLabel: '₹485',
      totalLabel: 'Total: ₹2,160 (5 pcs)',
      fulfilmentNote: 'Bhiwadi, Rajasthan',
      schemeNote: 'Scheme',
    )));

    // Single trust badge only (no separate stock pill).
    expect(find.text('In Stock (87)'), findsNothing);
    expect(find.text('Out of stock'), findsNothing);
    expect(find.text('Save 11%'), findsOneWidget);
    expect(find.text('MOQ: 5'), findsOneWidget);
    expect(find.text('₹432/pc'), findsOneWidget);
    expect(find.text('₹485'), findsOneWidget);
    expect(find.text('Add 5 pcs'), findsOneWidget); // dynamic label
    expect(find.text('RFQ'), findsOneWidget);
  });

  testWidgets('TradeQuantityTierSelector reports selection (core B2B)',
      (tester) async {
    int? selected;
    await tester.pumpWidget(_wrap(TradeQuantityTierSelector(
      tiers: const <TradeTierOption>[
        TradeTierOption(quantity: 5, priceLabel: '₹432'),
        TradeTierOption(quantity: 10, priceLabel: '₹427'),
        TradeTierOption(quantity: 25, priceLabel: '₹422'),
      ],
      selectedIndex: 0,
      onSelected: (i) => selected = i,
    )));

    await tester.tap(find.text('10 pcs'));
    expect(selected, 1);
  });

  testWidgets('TradeProductCard shows Added state', (tester) async {
    await tester.pumpWidget(_wrap(TradeProductCard(
      title: 'X',
      unitPriceLabel: '₹1',
      mrpLabel: '₹2',
      tiers: const <TradeTierOption>[
        TradeTierOption(quantity: 5, priceLabel: '₹1'),
      ],
      selectedTierIndex: 0,
      totalLabel: 'Total: ₹5',
      state: CommerceFixture.resolved,
    )));
    expect(find.text('Added ✓'), findsOneWidget);
  });

  testWidgets('TradeAccountSummary shows business, badges and credit',
      (tester) async {
    await tester.pumpWidget(_wrap(const TradeAccountSummary(
      businessName: "Rajesh Enterprise's Trade Account",
      gstinLabel: 'GSTIN 27ABCDE1234F1Z5',
      tradeDiscountLabel: '11% Trade Disc',
      creditAvailableLabel: '₹1.72L Free',
    )));

    expect(find.text("Rajesh Enterprise's Trade Account"), findsOneWidget);
    expect(find.text('Dealer'), findsOneWidget);
    expect(find.text('11% Trade Disc'), findsOneWidget);
    expect(find.text('₹1.72L Free'), findsOneWidget);
  });

  testWidgets('TradeSchemeCard renders each badge type', (tester) async {
    for (final badge in TradeSchemeBadge.values) {
      await tester.pumpWidget(_wrap(TradeSchemeCard(
        title: 'Scheme',
        detail: 'Detail',
        badge: badge,
      )));
      expect(find.text('Scheme'), findsOneWidget);
    }
  });

  testWidgets('AppBottomNavigation renders items', (tester) async {
    await tester.pumpWidget(_wrap(AppBottomNavigation(
      currentIndex: 0,
      items: const <BottomNavItem>[
        BottomNavItem(label: 'Trade', icon: Icons.storefront_outlined),
        BottomNavItem(label: 'Credit', icon: Icons.credit_card_outlined),
        BottomNavItem(label: 'Orders', icon: Icons.inventory_2_outlined),
        BottomNavItem(label: 'Account', icon: Icons.person_outline),
      ],
    )));
    expect(find.text('Trade'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('QuickOrderPanel renders rows and CTA', (tester) async {
    await tester.pumpWidget(_wrap(QuickOrderPanel(
      rows: const <QuickOrderLine>[
        QuickOrderLine(sku: 'SKU-001', name: 'x', quantity: 2),
      ],
    )));
    expect(find.text('Quick order'), findsOneWidget);
    expect(find.text('Add to Order'), findsOneWidget);
    expect(find.text('Saved List'), findsOneWidget);
    expect(find.text('Upload List'), findsOneWidget);
  });

  testWidgets('ProcurementListCard renders title, count, source and action',
      (tester) async {
    await tester.pumpWidget(_wrap(const SizedBox(
      width: 165,
      height: 132,
      child: ProcurementListCard(
        title: 'Seasonal Essentials',
        itemCountLabel: '18 SKUs',
        icon: Icons.wb_sunny_outlined,
        sourceLabel: 'Seasonal',
        accent: Color(0xFFFF6B35),
        actionLabel: 'View / Add →',
      ),
    )));
    expect(find.text('Seasonal Essentials'), findsOneWidget);
    expect(find.text('18 SKUs'), findsOneWidget);
    expect(find.text('Seasonal'), findsOneWidget);
    expect(find.text('View / Add →'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
