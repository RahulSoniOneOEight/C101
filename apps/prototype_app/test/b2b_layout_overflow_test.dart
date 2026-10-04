import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_browse_screens.dart';
import 'package:prototype_app/screens/b2b_home_screen.dart';
import 'package:prototype_app/screens/b2b_quick_order_screen.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:prototype_app/screens/b2b_shell.dart';

/// Regression guard for RenderFlex overflows reported on device. The emulator
/// runs at 1080x2400 @ 2.625 dpr (411x914 logical), which is narrower than the
/// 800x600 default test surface and exposes tight fixed-height rails.
void _phoneSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.reset);
}

Future<void> _pumpPhone(WidgetTester tester, Widget child) async {
  _phoneSurface(tester);
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(theme: AgencyTheme.light(), home: child),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('B2B home has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BHomeScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('B2B catalogue has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BCatalogueScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('B2B schemes has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BSchemesScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('quick order center has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BQuickOrderCenterScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('procurement list detail has no overflow at 411x914',
      (tester) async {
    await _pumpPhone(
        tester, const ProcurementListDetailScreen(listId: 'pl_seasonal'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('credit account has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BCreditScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('trade PDP has no overflow at 411x914', (tester) async {
    await _pumpPhone(tester, const B2BTradePdpScreen());
    expect(tester.takeException(), isNull);
  });

  testWidgets('populated quotation cart has no overflow at 411x914',
      (tester) async {
    _phoneSurface(tester);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    for (final p in container.read(tradeCatalogueProvider).take(3)) {
      container.read(b2bQuotationCartProvider.notifier).addTradeProduct(p);
    }
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BQuotationCartScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
