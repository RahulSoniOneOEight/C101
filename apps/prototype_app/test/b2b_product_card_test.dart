import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/screens/b2b_browse_screens.dart';

/// Validates the corrected B2B catalogue product tile across the required
/// widths: no overflow, and the card ends shortly after the final action (no
/// large blank area beneath the RFQ row).
const List<double> _widths = <double>[320, 334, 360, 390, 400, 430];

Future<void> _pump(WidgetTester tester, double width) async {
  tester.view.physicalSize = Size(width, 900);
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
}

void main() {
  for (final width in _widths) {
    testWidgets('catalogue tile has no overflow at ${width.toInt()}px',
        (tester) async {
      await _pump(tester, width);
      expect(tester.takeException(), isNull);
      expect(find.byType(TradeProductCardCompact), findsWidgets);
    });

    testWidgets(
        'catalogue tile ends near the last action at ${width.toInt()}px',
        (tester) async {
      await _pump(tester, width);
      // The final action (RFQ-Plus) sits within a small, consistent bottom
      // padding of the card — proving the excess blank space below the controls
      // is gone.
      final cardRect =
          tester.getRect(find.byType(TradeProductCardCompact).first);
      final actionsRect =
          tester.getRect(find.byKey(const Key('tradeCardActions')).first);
      final trailingGap = cardRect.bottom - actionsRect.bottom;
      expect(trailingGap, lessThan(20),
          reason: 'card should end shortly after the last action');
      expect(trailingGap, greaterThan(0));

      final imageRect =
          tester.getRect(find.byKey(const Key('tradeCardImage')).first);
      final detailsRect =
          tester.getRect(find.byKey(const Key('tradeCardDetails')).first);
      expect((imageRect.height - detailsRect.height).abs(), lessThan(1),
          reason: 'image and details should each use half the card body');
    });

    testWidgets(
        'catalogue tile shows Cart-Plus and no RFQ control at ${width.toInt()}px',
        (tester) async {
      await _pump(tester, width);
      expect(find.byType(CartPlusIconButton), findsWidgets);
      // RFQ lives on the PDP and in the standalone Request-Quotation journey,
      // not on the compact product tile.
      expect(find.byType(RFQPlusIconButton), findsNothing);
    });
  }
}
