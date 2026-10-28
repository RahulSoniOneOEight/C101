import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/orders_providers.dart';
import 'package:prototype_app/screens/return_flow_screens.dart';

Map<String, dynamic> _returnFixture({required bool simulated}) {
  return <String, dynamic>{
    'return': <String, dynamic>{
      'id': 'ret_layout_qc',
      'status': simulated ? 'closed' : 'inspection_complete',
      'resolution': 'refund',
      'lines': <Map<String, dynamic>>[
        <String, dynamic>{
          'sku': 'BK-QC-DRILL-01',
          'requestedQty': 1,
          'approvedQty': 1,
          'condition': 'damaged',
          'disposition': 'quarantine',
        },
        <String, dynamic>{
          'sku': 'BK-QC-BITS-02',
          'requestedQty': 1,
          'approvedQty': 1,
          'condition': 'incomplete',
          'disposition': 'repair',
        },
      ],
      if (simulated)
        'refundSimulation': <String, dynamic>{
          'status': 'simulated_completed',
          'amountMinor': 304700,
          'simulationReference': 'SIM-REFUND-LAYOUT',
        },
    },
  };
}

Future<void> _pumpReturnStatus(
  WidgetTester tester, {
  required Size size,
  required Map<String, dynamic> data,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        returnByIdProvider.overrideWith((ref, id) async => data),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const ReturnStatusScreen(returnId: 'ret_layout_qc'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('return status with simulated refund fits a mobile viewport',
      (tester) async {
    await _pumpReturnStatus(
      tester,
      size: const Size(390, 844),
      data: _returnFixture(simulated: true),
    );

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Refund simulation: simulated_completed'), findsOneWidget);
    expect(find.textContaining('₹3047.00'), findsOneWidget);
    expect(find.textContaining('SIM-REFUND-LAYOUT'), findsOneWidget);
    expect(
      find.text(
        'This is simulated evidence only. No real money moved and no stock was posted.',
      ),
      findsOneWidget,
    );
    expect(find.byType(ListView), findsOneWidget);
  });

  testWidgets('return status with simulated refund fits a desktop viewport',
      (tester) async {
    await _pumpReturnStatus(
      tester,
      size: const Size(1440, 900),
      data: _returnFixture(simulated: true),
    );

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Refund simulation: simulated_completed'), findsOneWidget);
    expect(find.textContaining('₹3047.00'), findsOneWidget);
    expect(find.byType(ListView), findsOneWidget);
  });

  testWidgets('completed inspection without a refund shows the pending boundary',
      (tester) async {
    await _pumpReturnStatus(
      tester,
      size: const Size(390, 844),
      data: _returnFixture(simulated: false),
    );

    expect(tester.takeException(), isNull);
    expect(
      find.text(
        'Inspection evidence is complete. Admin may now record a simulated refund; no real money or stock moves.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Refund simulation:'), findsNothing);
  });
}
