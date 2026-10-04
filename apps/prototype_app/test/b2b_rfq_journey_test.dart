import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/b2b_trade_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:shared_preferences/shared_preferences.dart';

Money _inr(int rupees) => Money(amount: rupees * 100, currencyCode: 'INR');

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('RFQ basket merges duplicate SKUs and preserves the buyer target price',
      () async {
    final container = await _container();
    final notifier = container.read(b2bQuotationCartProvider.notifier);

    notifier.addSku(
      sku: 'p1',
      name: 'Ceramic Floor Tiles',
      quantity: 200,
      unitPrice: _inr(320),
    );
    // Identical SKU is merged, not duplicated.
    notifier.addSku(
      sku: 'p1',
      name: 'Ceramic Floor Tiles',
      quantity: 150,
      unitPrice: _inr(320),
    );

    var cart = container.read(b2bQuotationCartProvider);
    expect(cart.skuCount, 1);
    expect(cart.lines.first.quantity, 350);

    notifier.setTargetPrice('p1', _inr(295));
    cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines.first.targetUnitPrice, isNotNull);
    expect(cart.estimatedTargetTotal.amount, 295 * 100 * 350);

    // A later merge keeps the target price already entered.
    notifier.addSku(
      sku: 'p1',
      name: 'Ceramic Floor Tiles',
      quantity: 50,
      unitPrice: _inr(320),
    );
    cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines.first.quantity, 400);
    expect(cart.lines.first.targetUnitPrice, isNotNull);
  });

  test('removing a line drops it from the RFQ basket', () async {
    final container = await _container();
    final notifier = container.read(b2bQuotationCartProvider.notifier);
    notifier.addSku(sku: 'a', name: 'A', quantity: 1, unitPrice: _inr(10));
    notifier.addSku(sku: 'b', name: 'B', quantity: 1, unitPrice: _inr(10));
    notifier.remove('a');
    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.skuCount, 1);
    expect(cart.lines.first.sku, 'b');
  });

  test('RFQ draft persists across containers; submit assigns a reference',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    final c1 = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    final notifier = c1.read(b2bQuotationCartProvider.notifier);
    notifier.addSku(
      sku: 'p2',
      name: 'Vitrified Tiles',
      quantity: 150,
      unitPrice: _inr(480),
    );
    notifier.setDeliveryLocation('Site A, Pune');
    notifier.setRemarks('Deliver before monsoon');
    notifier.setTargetPrice('p2', _inr(450));
    notifier.saveDraft();

    expect(prefs.getString('b2b_rfq_draft_v1'), isNotNull);

    final reference = notifier.submit();
    expect(reference, startsWith('RFQ-'));
    expect(c1.read(b2bQuotationCartProvider).status, RfqStatus.submitted);
    // Submitting never creates an order in this layer.
    expect(c1.read(b2bQuotationCartProvider).reference, reference);
    c1.dispose();

    // A fresh container restores the persisted draft (development fixture).
    final c2 = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    final restored = c2.read(b2bQuotationCartProvider);
    expect(restored.skuCount, 1);
    expect(restored.deliveryLocation, 'Site A, Pune');
    expect(restored.remarks, 'Deliver before monsoon');
    expect(restored.lines.first.targetUnitPrice, isNotNull);
    c2.dispose();
  });

  testWidgets('RFQ workspace renders the multi-SKU basket and both actions',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    container.read(b2bQuotationCartProvider.notifier).addSku(
          sku: 'p1',
          name: 'Ceramic Floor Tiles',
          quantity: 200,
          unitPrice: _inr(320),
        );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BRfqWorkspaceScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('RFQ Basket · 1 SKUs'), findsOneWidget);
    expect(find.textContaining('Current Dealer Price'), findsWidgets);
    expect(find.text('Qty'), findsOneWidget);
    expect(find.text('Target Price ₹'), findsOneWidget);
    expect(find.text('Add Another SKU'), findsOneWidget);
    expect(find.text('Save Draft'), findsOneWidget);
    expect(find.text('Submit RFQ'), findsOneWidget);
    expect(find.text('Estimated Target Value'), findsOneWidget);
  });

  testWidgets('RFQ workspace searches the catalogue and adds a SKU',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final catalogue = container.read(tradeCatalogueProvider);
    expect(catalogue, isNotEmpty);
    final first = catalogue.first;

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BRfqWorkspaceScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The RFQ basket starts empty but is still searchable (cart entry point).
    expect(find.text('Your RFQ basket is empty'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, first.product.title);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add_circle_outline).first);
    await tester.pumpAndSettle();

    expect(container.read(b2bQuotationCartProvider).skuCount, 1);
    expect(find.text('RFQ Basket · 1 SKUs'), findsOneWidget);
  });

  testWidgets('B2B cart exposes an independent Request Quotation journey',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    container.read(b2bQuotationCartProvider.notifier).addSku(
          sku: 'p1',
          name: 'Ceramic Floor Tiles',
          quantity: 10,
          unitPrice: _inr(320),
        );

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

    expect(find.text('Request Quotation'), findsOneWidget);
    expect(find.text('Start Request Quotation'), findsOneWidget);
  });

  testWidgets('populated product tile omits the RFQ control',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AgencyTheme.light(),
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 180,
              child: TradeProductCardCompact(
                title: 'Ceramic Floor Tiles',
                unitPriceLabel: '₹320/pc',
                quantity: 5,
                onQuantityChanged: (_) {},
                onAdd: () {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(CartPlusIconButton), findsOneWidget);
    expect(find.byType(RFQPlusIconButton), findsNothing);
  });
}
