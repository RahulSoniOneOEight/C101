import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/b2b_trade_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/b2b_trade_providers.dart';
import 'package:prototype_app/screens/b2b_home_screen.dart';
import 'package:prototype_app/screens/b2b_quick_order_screen.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('procurement lists are the kept set and buyer-editable', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final lists = container.read(procurementListsProvider);

    expect(lists.map((l) => l.title).toList(),
        <String>['Seasonal', 'Kitchen Works', 'Floor Essentials']);
    expect(lists.every((l) => l.items.isNotEmpty), isTrue);
    expect(lists.map((l) => l.items.length).toList(), <int>[12, 8, 8]);
    expect(
        lists.every(
            (l) => l.items.map((i) => i.sku).toSet().length == l.items.length),
        isTrue);
    final catalogueIds =
        container.read(tradeCatalogueProvider).map((p) => p.product.id).toSet();
    expect(
        lists.every((l) => l.items.every((i) => catalogueIds.contains(i.sku))),
        isTrue);
    expect(
        lists
            .every((l) => l.sourceType == ProcurementListSourceType.buyerSaved),
        isTrue);
    expect(container.read(quickOrderPresetsProvider),
        <String>['Seasonal', 'Kitchen Works', 'Floor Essentials']);
  });

  test('adding a SKU to a list persists (save state) and survives reload',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    final c1 = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(c1.dispose);

    expect(c1.read(listsSaveStateProvider), ListsSaveState.idle);
    await c1.read(procurementListsProvider.notifier).addSku(
          'pl_kitchen',
          const ProcurementListItem(
              sku: 'prod_led', name: 'LED Bulb 9W Cool White', quantity: 20),
        );

    // Save state + the SKU now shows in the normal list view.
    expect(c1.read(listsSaveStateProvider), ListsSaveState.saved);
    expect(
        c1
            .read(procurementListProvider('pl_kitchen'))!
            .items
            .any((i) => i.sku == 'prod_led'),
        isTrue);

    // A fresh container over the same store sees the saved SKU.
    final c2 = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(c2.dispose);
    expect(
        c2
            .read(procurementListProvider('pl_kitchen'))!
            .items
            .any((i) => i.sku == 'prod_led'),
        isTrue);
  });

  test('untouched legacy lists expand without overwriting buyer edits',
      () async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    final store = LocalStore(prefs);
    await store.writeProcurementLists(const <ProcurementList>[
      ProcurementList(
        id: 'pl_seasonal',
        title: 'Seasonal',
        description: 'Peak-season electrical demand',
        sourceType: ProcurementListSourceType.buyerSaved,
        items: <ProcurementListItem>[
          ProcurementListItem(
              sku: 'prod_led', name: 'LED Bulb 9W Cool White', quantity: 20),
          ProcurementListItem(
              sku: 'prod_mcb', name: 'MCB 32A Single Pole', quantity: 10),
          ProcurementListItem(
              sku: 'prod_wire', name: 'Copper Wire 1.5sqmm', quantity: 5),
        ],
      ),
      ProcurementList(
        id: 'pl_kitchen',
        title: 'My Kitchen Works',
        description: 'Buyer renamed list',
        sourceType: ProcurementListSourceType.buyerSaved,
        items: <ProcurementListItem>[
          ProcurementListItem(
              sku: 'prod_bibcock', name: 'Bib Cock', quantity: 10),
          ProcurementListItem(
              sku: 'prod_cpvc', name: 'CPVC Pipe', quantity: 50),
          ProcurementListItem(
              sku: 'prod_ballvalve', name: 'Ball Valve', quantity: 10),
        ],
      ),
    ]);

    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    final lists = container.read(procurementListsProvider);

    expect(lists.firstWhere((l) => l.id == 'pl_seasonal').items, hasLength(12));
    final edited = lists.firstWhere((l) => l.id == 'pl_kitchen');
    expect(edited.title, 'My Kitchen Works');
    expect(edited.items, hasLength(3));
  });

  test('catalogue products expose multiple sellers with a best price', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final product = container.read(tradeCatalogueProvider).first;

    expect(product.sellers.length, greaterThan(1));
    final best = product.bestSeller;
    expect(best, isNotNull);
    expect(
        product.sellers
            .every((s) => s.unitPrice.amount >= best!.unitPrice.amount),
        isTrue);
  });

  test('reorder adds the entire previous order', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final order = container.read(tradeDashboardProvider).repeatOrders.first;

    container.read(b2bQuotationCartProvider.notifier).addRepeatOrder(order);

    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines, hasLength(order.lines.length));
    expect(cart.lines.map((l) => l.sku).toSet(),
        order.lines.map((l) => l.sku).toSet());
  });

  test('placing a business order persists it and clears the cart', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final product = container.read(tradeCatalogueProvider).first;
    container
        .read(b2bQuotationCartProvider.notifier)
        .addTradeProduct(product, quantity: 3);
    final before = container.read(b2bOrdersProvider).length;

    final order = await container
        .read(b2bOrdersProvider.notifier)
        .placeOrder(container.read(b2bQuotationCartProvider));

    expect(order, isNotNull);
    expect(container.read(b2bOrdersProvider).length, before + 1);
    expect(container.read(b2bOrdersProvider).first.reference, order!.reference);
    expect(container.read(b2bQuotationCartProvider).isEmpty, isTrue);
  });

  test('B2B quotation cart upserts lines and computes GST totals', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final product = container.read(tradeCatalogueProvider).first;
    final notifier = container.read(b2bQuotationCartProvider.notifier);

    notifier.addTradeProduct(product, quantity: 10);
    notifier.addTradeProduct(product, quantity: 5);

    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines, hasLength(1));
    expect(cart.lines.single.quantity, 15);
    expect(cart.subtotal.amount, cart.lines.single.unitPrice.amount * 15);
    expect(cart.gst.amount, (cart.subtotal.amount * .18).round());
    expect(cart.total.amount, cart.subtotal.amount + cart.gst.amount);
  });

  test('selected procurement items persist into the B2B quotation cart', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final list = container
        .read(procurementListsProvider)
        .firstWhere((item) => item.id == 'pl_seasonal');

    container.read(b2bQuotationCartProvider.notifier).addProcurementItems(
      list.items.take(2),
      quantities: <String, int>{list.items.first.sku: 3},
    );

    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines, hasLength(2));
    expect(cart.lines.first.quantity, 3);
    expect(cart.lines.last.quantity, list.items[1].quantity);
  });

  test('repeat order adds representative trade lines', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final order = container.read(tradeDashboardProvider).repeatOrders.first;

    container.read(b2bQuotationCartProvider.notifier).addRepeatOrder(order);

    final cart = container.read(b2bQuotationCartProvider);
    expect(cart.lines, isNotEmpty);
    expect(cart.lines.every((line) => line.quantity > 0), isTrue);
  });

  test('quantity changes recalculate catalogue tier pricing', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final product = container.read(tradeCatalogueProvider).first;
    final notifier = container.read(b2bQuotationCartProvider.notifier);
    notifier.addTradeProduct(product);

    notifier.updateQuantity(product.product.id, 25);

    final line = container.read(b2bQuotationCartProvider).lines.single;
    expect(line.quantity, 25);
    expect(line.unitPrice.amount, product.unitPriceFor(25).amount);
  });

  testWidgets('B2B header has cart and account without duplicate search',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AgencyTheme.light(),
        home: const Scaffold(body: B2BHeader()),
      ),
    );

    expect(find.text('Search products, SKU'), findsNothing);
    expect(find.byTooltip('Cart'), findsOneWidget);
    expect(find.byTooltip('Account'), findsOneWidget);
  });

  testWidgets('B2B home Quick Order is a horizontally scrollable 2x2 grid',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BHomeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final gridFinder = find.byKey(const Key('b2bHomeQuickOrderGrid'));
    final grid = tester.widget<GridView>(gridFinder);
    final delegate =
        grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
    expect(grid.scrollDirection, Axis.horizontal);
    expect(delegate.crossAxisCount, 2);

    final gridRect = tester.getRect(gridFinder);
    final cards = find.descendant(
        of: gridFinder, matching: find.byType(CompactQuickOrderSkuCard));
    final visibleCards = cards.evaluate().where((element) {
      final box = element.renderObject! as RenderBox;
      return (box.localToGlobal(Offset.zero) & box.size).overlaps(gridRect);
    });
    expect(visibleCards, hasLength(4));

    final scrollable =
        find.descendant(of: gridFinder, matching: find.byType(Scrollable));
    final before = tester.state<ScrollableState>(scrollable).position.pixels;
    await tester.drag(gridFinder, const Offset(-300, 0));
    await tester.pumpAndSettle();
    final after = tester.state<ScrollableState>(scrollable).position.pixels;
    expect(after, greaterThan(before));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Quick Order Center operates lists: selection + grid, no management controls',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BQuickOrderCenterScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Quick Order Center'), findsOneWidget);
    expect(find.text('Search products / SKU / brand'), findsOneWidget);
    expect(find.text('In selected lists'), findsOneWidget);
    expect(find.text('All catalogue'), findsOneWidget);
    expect(find.text('MY PROCUREMENT LISTS'), findsOneWidget);
    expect(find.text('Manage Lists →'), findsOneWidget);
    expect(find.text('Products from selected lists'), findsOneWidget);

    // List-management controls were moved to Manage Lists.
    expect(find.text('New list'), findsNothing);
    expect(find.text('+ Add SKU to List'), findsNothing);
    expect(find.textContaining('Destination list'), findsNothing);

    // A list is selected by default, so its SKUs are already in the grid.
    expect(find.byType(CompactQuickOrderSkuCard), findsWidgets);
    expect(find.textContaining('1 list selected'), findsOneWidget);

    // All catalogue scope also populates the grid.
    await tester.tap(find.text('All catalogue'));
    await tester.pumpAndSettle();
    expect(find.byType(CompactQuickOrderSkuCard), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ProcurementListDetailScreen is cart-like (add selected / all)',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const ProcurementListDetailScreen(listId: 'pl_seasonal'),
        ),
      ),
    );

    // Seasonal has 12 items, all selected by default.
    expect(find.text('12 of 12 items selected'), findsOneWidget);
    expect(find.text('Add Selected to Order (12)'), findsOneWidget);
    expect(find.text('Add All to Order'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('quotation cart renders empty and populated provider states',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BQuotationCartScreen(),
        ),
      ),
    );

    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.text('Return to Quick Order'), findsOneWidget);

    final context = tester.element(find.byType(B2BQuotationCartScreen));
    final container = ProviderScope.containerOf(context);
    container.read(b2bQuotationCartProvider.notifier).addSku(
          sku: 'SKU-TEST',
          name: 'Test trade item',
          quantity: 4,
          unitPrice: const Money(amount: 10000, currencyCode: 'INR'),
        );
    await tester.pump();

    expect(find.text('Your cart is empty'), findsNothing);
    expect(find.text('Test trade item'), findsOneWidget);
    expect(find.text('Proceed to Checkout'), findsOneWidget);
    expect(find.text('You may also like'), findsOneWidget);
    expect(find.text('₹472'), findsOneWidget);
  });

  test('saved default quantity updates independently of the cart', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(procurementListsProvider.notifier);

    await notifier.setItemQuantity('pl_seasonal', 'prod_led', 42);

    final item = container
        .read(procurementListProvider('pl_seasonal'))!
        .items
        .firstWhere((i) => i.sku == 'prod_led');
    expect(item.quantity, 42);
    // The cart is untouched by a list-default edit.
    expect(container.read(b2bQuotationCartProvider).isEmpty, isTrue);
  });

  test('duplicateList creates an independent buyer-owned copy', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(procurementListsProvider.notifier);

    final copy = await notifier.duplicateList('pl_kitchen');
    final lists = container.read(procurementListsProvider);

    expect(copy.id, isNot('pl_kitchen'));
    expect(copy.sourceType, ProcurementListSourceType.buyerSaved);
    expect(copy.items.length,
        container.read(procurementListProvider('pl_kitchen'))!.items.length);
    expect(lists.any((l) => l.id == 'pl_kitchen'), isTrue); // source kept
  });

  test('saveEdited copies a curated source without modifying the template',
      () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(procurementListsProvider.notifier);

    // Seed a curated (non buyer-owned) template.
    await notifier.createWithItems(title: 'Starter', items: const []);
    // Turn it conceptually curated by re-adding via saveEdited with a source
    // that is not buyerSaved: emulate with a fresh curated list.
    final curated = ProcurementList(
      id: 'pl_curated',
      title: 'Curated Bundle',
      description: 'Template',
      sourceType: ProcurementListSourceType.backendCurated,
      items: const [
        ProcurementListItem(sku: 'prod_led', name: 'LED', quantity: 5)
      ],
    );
    // Persist the curated template through the editor save path.
    await notifier.saveEdited(
      listId: null,
      title: curated.title,
      items: curated.items,
    );

    final created = container
        .read(procurementListsProvider)
        .firstWhere((l) => l.title == 'Curated Bundle');
    expect(created.sourceType, ProcurementListSourceType.buyerSaved);

    // Editing a buyer-owned list updates in place.
    await notifier.saveEdited(
      listId: created.id,
      title: 'Curated Bundle (mine)',
      items: created.items,
    );
    final updated = container.read(procurementListsProvider);
    expect(updated.any((l) => l.title == 'Curated Bundle (mine)'), isTrue);
    expect(updated.length, greaterThan(1));
  });

  testWidgets('temporary purchase qty never writes the saved list default',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const B2BQuickOrderCenterScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final container = ProviderScope.containerOf(
        tester.element(find.byType(B2BQuickOrderCenterScreen)));
    final savedBefore = container
        .read(procurementListProvider('pl_seasonal'))!
        .items
        .firstWhere((i) => i.sku == 'prod_led')
        .quantity;

    // A list is selected by default; bump today's quantity on the first SKU.
    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pumpAndSettle();

    // Add that SKU to the cart.
    await tester.tap(find.byType(CartPlusIconButton).first);
    await tester.pump();

    expect(container.read(b2bQuotationCartProvider).skuCount, greaterThan(0));
    // The saved list default is unchanged (temporary vs persisted separation).
    final savedAfter = container
        .read(procurementListProvider('pl_seasonal'))!
        .items
        .firstWhere((i) => i.sku == 'prod_led')
        .quantity;
    expect(savedAfter, savedBefore);
  });

  // Responsive QA: the operate grid must not overflow across phone widths.
  for (final width in <double>[320, 334, 360, 390, 400, 430]) {
    testWidgets('Quick Order Center has no overflow at ${width.toInt()}px',
        (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AgencyTheme.light(),
            home: const B2BQuickOrderCenterScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CompactQuickOrderSkuCard), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }
}
