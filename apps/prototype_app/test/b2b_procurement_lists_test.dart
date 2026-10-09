import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_procurement_lists_screen.dart';

Widget _host(Widget child) => ProviderScope(
      child: MaterialApp(theme: AgencyTheme.light(), home: child),
    );

Future<void> _tall(WidgetTester tester) async {
  tester.view.physicalSize = const Size(420, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

void main() {
  test('deleteList removes a list without touching the cart', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container
        .read(procurementListsProvider.notifier)
        .deleteList('pl_floor');

    expect(
        container.read(procurementListsProvider).any((l) => l.id == 'pl_floor'),
        isFalse);
    expect(container.read(b2bQuotationCartProvider).isEmpty, isTrue);
  });

  testWidgets('Manage Lists shows buyer lists and a create action',
      (tester) async {
    await _tall(tester);
    await tester.pumpWidget(_host(const ProcurementListsManagerScreen()));
    await tester.pumpAndSettle();

    expect(find.text('My Procurement Lists'), findsOneWidget);
    expect(find.text('Create New List'), findsOneWidget);
    expect(find.text('Seasonal'), findsOneWidget);
    expect(find.text('Kitchen Works'), findsOneWidget);
    expect(find.text('Floor Essentials'), findsOneWidget);
    expect(find.textContaining('SKUs'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('List editor creates a list and saves', (tester) async {
    await _tall(tester);
    await tester.pumpWidget(_host(const ProcurementListEditorScreen()));
    await tester.pumpAndSettle();

    expect(find.text('New Procurement List'), findsOneWidget);
    expect(find.text('List Name'), findsOneWidget);
    expect(find.text('ADD PRODUCTS'), findsOneWidget);
    expect(find.text('Scan'), findsNothing);
    expect(find.text('Upload list'), findsOneWidget);
    expect(find.text('Save Changes'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'Monsoon Essentials');
    await tester.pumpAndSettle();

    // Search the catalogue and add the first result.
    await tester.enterText(find.byType(TextField).at(1), 'Bib');
    await tester.pumpAndSettle();
    final addIcon = find.byIcon(Icons.add_circle_outline);
    expect(addIcon, findsWidgets);
    await tester.tap(addIcon.first);
    await tester.pumpAndSettle();
    expect(find.text('SKUS IN THIS LIST'), findsOneWidget);

    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(ProcurementListEditorScreen));
    final container = ProviderScope.containerOf(context);
    final created = container
        .read(procurementListsProvider)
        .firstWhere((l) => l.title == 'Monsoon Essentials');
    expect(created.items, isNotEmpty);
  });

  testWidgets('List editor edits a saved default quantity and persists it',
      (tester) async {
    await _tall(tester);
    await tester.pumpWidget(
        _host(const ProcurementListEditorScreen(listId: 'pl_seasonal')));
    await tester.pumpAndSettle();

    expect(find.text('Edit Procurement List'), findsOneWidget);
    expect(find.text('LED Bulb 9W Cool White'), findsOneWidget);
    expect(find.text('Default Qty'), findsWidgets);

    final context = tester.element(find.byType(ProcurementListEditorScreen));
    final container = ProviderScope.containerOf(context);
    final before = container
        .read(procurementListProvider('pl_seasonal'))!
        .items
        .firstWhere((i) => i.sku == 'prod_led')
        .quantity;

    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    final after = container
        .read(procurementListProvider('pl_seasonal'))!
        .items
        .firstWhere((i) => i.sku == 'prod_led')
        .quantity;
    expect(after, before + 1);
  });

  testWidgets('List editor blocks a duplicate list name', (tester) async {
    await _tall(tester);
    await tester.pumpWidget(_host(const ProcurementListEditorScreen()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'Seasonal');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Changes'));
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(ProcurementListEditorScreen));
    final container = ProviderScope.containerOf(context);
    // No second "Seasonal" list was created.
    expect(
        container
            .read(procurementListsProvider)
            .where((l) => l.title == 'Seasonal')
            .length,
        1);
  });
}
