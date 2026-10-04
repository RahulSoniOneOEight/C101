import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  testWidgets('CartPlusIconButton renders all five states',
      (WidgetTester tester) async {
    for (final state in CartPlusState.values) {
      await tester.pumpWidget(_host(CartPlusIconButton(state: state)));
      expect(find.byType(CartPlusIconButton), findsOneWidget);
    }
  });

  testWidgets('CartPlusIconButton disables tap when unavailable',
      (WidgetTester tester) async {
    var taps = 0;
    await tester.pumpWidget(_host(CartPlusIconButton(
      state: CartPlusState.unavailable,
      onPressed: () => taps++,
    )));
    await tester.tap(find.byType(CartPlusIconButton));
    await tester.pump();
    expect(taps, 0);
  });

  testWidgets('RFQPlusIconButton renders all five states',
      (WidgetTester tester) async {
    for (final state in RFQPlusState.values) {
      await tester.pumpWidget(_host(RFQPlusIconButton(state: state)));
      expect(find.byType(RFQPlusIconButton), findsOneWidget);
    }
  });

  testWidgets(
      'RFQPlusIconButton taps when normal and is disabled when unavailable',
      (WidgetTester tester) async {
    var taps = 0;
    await tester.pumpWidget(_host(RFQPlusIconButton(
      onPressed: () => taps++,
    )));
    await tester.tap(find.byType(RFQPlusIconButton));
    await tester.pump();
    expect(taps, 1);

    await tester.pumpWidget(_host(RFQPlusIconButton(
      state: RFQPlusState.unavailable,
      onPressed: () => taps++,
    )));
    await tester.tap(find.byType(RFQPlusIconButton));
    await tester.pump();
    expect(taps, 1, reason: 'unavailable RFQ-Plus must not fire');
  });

  testWidgets('QuantityStepper dense mode fits a narrow row',
      (WidgetTester tester) async {
    await tester.pumpWidget(_host(QuantityStepper(
      value: 200,
      compact: true,
      dense: true,
      onChanged: (_) {},
    )));
    final size = tester.getSize(find.byType(QuantityStepper));
    expect(size.width, lessThanOrEqualTo(66));
  });

  testWidgets('QuantityStepper reports increments and decrements',
      (WidgetTester tester) async {
    int? value;
    await tester.pumpWidget(_host(QuantityStepper(
      value: 5,
      onChanged: (v) => value = v,
    )));
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(value, 6);
    await tester.tap(find.byIcon(Icons.remove));
    await tester.pump();
    expect(value, 4);
  });

  testWidgets('TradeFilterChip shows a check only when selected',
      (WidgetTester tester) async {
    await tester.pumpWidget(
        _host(const TradeFilterChip(label: 'Seasonal', selected: false)));
    expect(find.byIcon(Icons.check), findsNothing);

    await tester.pumpWidget(
        _host(const TradeFilterChip(label: 'Seasonal', selected: true)));
    expect(find.byIcon(Icons.check), findsOneWidget);
  });

  testWidgets('ProcurementListFilterBar toggles a filter',
      (WidgetTester tester) async {
    String? toggled;
    await tester.pumpWidget(_host(ProcurementListFilterBar(
      filters: const <String>['Saved list', 'Seasonal'],
      selected: const <String>{'Saved list'},
      onToggle: (f) => toggled = f,
    )));
    expect(find.text('Saved list'), findsOneWidget);
    await tester.tap(find.text('Seasonal'));
    await tester.pump();
    expect(toggled, 'Seasonal');
  });

  testWidgets('CompactQuickOrderSkuCard renders product data and adds',
      (WidgetTester tester) async {
    var added = false;
    await tester.pumpWidget(_host(CompactQuickOrderSkuCard(
      title: 'Bib Cock 15mm',
      sku: 'SKU JQ-4415',
      priceLabel: '₹432',
      quantity: 5,
      onAdd: () => added = true,
    )));
    expect(find.text('Bib Cock 15mm'), findsOneWidget);
    expect(find.text('SKU JQ-4415'), findsOneWidget);
    expect(find.text('₹432'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    await tester.tap(find.byType(CartPlusIconButton));
    await tester.pump();
    expect(added, isTrue);
  });

  testWidgets('TradeProductCardCompact renders tiers and price',
      (WidgetTester tester) async {
    await tester.pumpWidget(_host(TradeProductCardCompact(
      title: 'Ceramic Floor Tiles',
      brand: 'CERAMICA',
      moqLabel: 'MOQ 5',
      unitPriceLabel: '₹3,738/pc',
      mrpLabel: '₹4,200',
      stockLabel: 'In Stock (240)',
      savingsLabel: 'Save 11%',
      tiers: const <TradeTierOption>[
        TradeTierOption(quantity: 5, priceLabel: '₹3,738'),
        TradeTierOption(quantity: 10, priceLabel: '₹3,610'),
      ],
      selectedTierIndex: 0,
      quantity: 5,
    )));
    expect(find.text('Ceramic Floor Tiles'), findsOneWidget);
    expect(find.text('CERAMICA'), findsOneWidget);
    expect(find.text('₹3,738/pc'), findsOneWidget);
    expect(find.text('Save 11%'), findsOneWidget);
    expect(find.text('5'), findsWidgets);
    expect(find.byType(QuantityStepper), findsOneWidget);
    expect(find.byType(CartPlusIconButton), findsOneWidget);
  });
}
