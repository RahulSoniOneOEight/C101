import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget host(Widget child) => MaterialApp(
      theme: AgencyTheme.light(),
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('PinSearch renders and exposes the filter action',
      (tester) async {
    var filtered = false;
    await tester.pumpWidget(host(PinSearch(onFilterTap: () => filtered = true)));
    expect(find.byIcon(Icons.search), findsOneWidget);
    await tester.tap(find.byIcon(Icons.tune));
    await tester.pump();
    expect(filtered, isTrue);
  });

  testWidgets('PinCartLine renders and emits quantity changes', (tester) async {
    var inc = 0;
    var dec = 0;
    await tester.pumpWidget(host(PinCartLine(
      title: '18V Drill Kit',
      subtitle: 'BuildPro',
      unitPriceLabel: '₹6,499',
      quantity: 2,
      onIncrement: () => inc++,
      onDecrement: () => dec++,
    )));
    expect(find.text('18V Drill Kit'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(inc, 1);
    await tester.tap(find.byIcon(Icons.remove));
    await tester.pump();
    expect(dec, 1);
  });

  testWidgets('PinOrderCard renders order fields', (tester) async {
    await tester.pumpWidget(host(const PinOrderCard(
      orderRef: 'Order #12345',
      status: 'Delivered',
      meta: 'Placed 24 Sep · 3 items',
      totalLabel: '₹4,999',
      tone: PinOrderTone.success,
    )));
    expect(find.text('Order #12345'), findsOneWidget);
    expect(find.text('Delivered'), findsOneWidget);
    expect(find.text('₹4,999'), findsOneWidget);
  });

  testWidgets('PinShipmentStatus covers all states', (tester) async {
    for (final s in PinShipmentState.values) {
      await tester.pumpWidget(host(PinShipmentStatus(state: s)));
      expect(find.byType(PinShipmentStatus), findsOneWidget);
    }
  });

  testWidgets('PinReturnStatus covers all states', (tester) async {
    for (final s in PinReturnState.values) {
      await tester.pumpWidget(host(PinReturnStatus(state: s)));
      expect(find.byType(PinReturnStatus), findsOneWidget);
    }
  });

  testWidgets('PinApprovalStatus covers all states', (tester) async {
    for (final s in PinApprovalState.values) {
      await tester.pumpWidget(host(PinApprovalStatus(state: s)));
      expect(find.byType(PinApprovalStatus), findsOneWidget);
    }
  });

  testWidgets('PinCreditLimit renders available credit', (tester) async {
    await tester.pumpWidget(host(const PinCreditLimit(
      availableLabel: '₹1.72L',
      limitLabel: 'Sanctioned ₹2L',
      usedFraction: 0.14,
    )));
    expect(find.text('₹1.72L'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });

  testWidgets('PinWorkflowAction hierarchies are tappable', (tester) async {
    var taps = 0;
    for (final h in PinWorkflowHierarchy.values) {
      await tester.pumpWidget(host(
          PinWorkflowAction(label: 'Go', hierarchy: h, onPressed: () => taps++)));
      await tester.tap(find.text('Go'));
      await tester.pump();
    }
    expect(taps, 3);
  });

  testWidgets('PinReorderAction renders', (tester) async {
    await tester.pumpWidget(host(const PinReorderAction(detailed: true)));
    expect(find.byType(PinReorderAction), findsOneWidget);
  });

  testWidgets('PinForm renders fields and submits', (tester) async {
    var submitted = false;
    await tester.pumpWidget(host(PinForm(
      fields: const <PinFormField>[
        PinFormField(label: 'Email'),
        PinFormField(label: 'City'),
      ],
      onSubmit: () => submitted = true,
    )));
    expect(find.text('Email'), findsOneWidget);
    await tester.tap(find.text('Submit'));
    await tester.pump();
    expect(submitted, isTrue);
  });

  testWidgets('PinRFQForm submits captured values', (tester) async {
    String? material;
    await tester.pumpWidget(host(PinRFQForm(
      onSubmit: (m, q, t) => material = m,
    )));
    await tester.enterText(find.byType(TextFormField).first, 'CPVC Pipe');
    await tester.tap(find.text('Submit RFQ'));
    await tester.pump();
    expect(material, 'CPVC Pipe');
  });

  testWidgets('PinChart renders for every kind', (tester) async {
    for (final k in PinChartKind.values) {
      await tester.pumpWidget(
          host(PinChart(kind: k, values: const <double>[2, 5, 3, 8, 4])));
      expect(find.byType(PinChart), findsOneWidget);
    }
  });

  testWidgets('PinCarousel renders children and dots', (tester) async {
    await tester.pumpWidget(host(PinCarousel(children: <Widget>[
      Container(color: Colors.red),
      Container(color: Colors.blue),
    ])));
    expect(find.byType(PageView), findsOneWidget);
  });

  testWidgets('PinResponsiveGrid renders children', (tester) async {
    await tester.pumpWidget(host(PinResponsiveGrid(children: <Widget>[
      for (var i = 0; i < 4; i++) Container(height: 40, color: Colors.grey),
    ])));
    expect(find.byType(PinResponsiveGrid), findsOneWidget);
  });

  testWidgets('PinMasonryGrid renders children', (tester) async {
    await tester.pumpWidget(host(PinMasonryGrid(children: <Widget>[
      for (var i = 0; i < 4; i++) Container(height: 40, color: Colors.grey),
    ])));
    expect(find.byType(PinMasonryGrid), findsOneWidget);
  });

  testWidgets('PinToast shows a snackbar', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () =>
                  PinToast.show(context, 'Saved', tone: PinToastTone.success),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('go'));
    await tester.pump();
    expect(find.text('Saved'), findsOneWidget);
  });

  testWidgets('PinTabs selects and reports index', (tester) async {
    int? selected;
    await tester.pumpWidget(host(PinTabs(
      tabs: const <String>['All', 'Shipped'],
      index: 0,
      onChanged: (i) => selected = i,
    )));
    await tester.tap(find.text('Shipped'));
    await tester.pump();
    expect(selected, 1);
  });

  testWidgets('PinDialog.confirm returns a value', (tester) async {
    bool? result;
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async {
                result = await PinDialog.confirm(context, title: 'Delete?');
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Delete?'), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });

  testWidgets('PinDateTimeField renders placeholder', (tester) async {
    await tester.pumpWidget(host(PinDateTimeField(label: 'Required by')));
    expect(find.text('Select date'), findsOneWidget);
  });
}
