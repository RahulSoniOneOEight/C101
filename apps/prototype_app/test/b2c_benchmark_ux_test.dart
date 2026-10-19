import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/order_models.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/domain/storefront_ux.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/account_providers.dart';
import 'package:prototype_app/providers/storefront_ux_providers.dart';
import 'package:prototype_app/screens/b2c_flow_screens.dart';
import 'package:prototype_app/screens/checkout_screen.dart';
import 'package:prototype_app/screens/d2c_shell.dart';
import 'package:prototype_app/screens/discovery_screen.dart';
import 'package:prototype_app/widgets/order_progress_timeline.dart';
import 'package:prototype_app/widgets/quick_add_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<SharedPreferences> _prefs(
    [Map<String, Object> values = const {}]) async {
  SharedPreferences.setMockInitialValues(values);
  return SharedPreferences.getInstance();
}

Widget _host(SharedPreferences prefs, Widget child,
    {List<Override> overrides = const <Override>[]}) {
  return ProviderScope(
    overrides: <Override>[
      sharedPreferencesProvider.overrideWithValue(prefs),
      ...overrides,
    ],
    child: MaterialApp(theme: AgencyTheme.light(), home: child),
  );
}

void main() {
  testWidgets('AI search is disclosed and shows its interpretation',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final prefs = await _prefs();
    const products = <Product>[
      Product(
        id: 'paint',
        title: 'Bathroom Waterproof Primer',
        categoryLabel: 'Paints & Finishes',
        price: Money(amount: 99900, currencyCode: 'INR'),
      ),
      Product(
        id: 'pipe',
        title: 'CPVC Pipe',
        categoryLabel: 'Bathroom & Plumbing',
        price: Money(amount: 50000, currencyCode: 'INR'),
      ),
    ];
    await tester.pumpWidget(_host(
      prefs,
      const SearchScreen(
        initialQuery: 'Paint a damp bathroom',
        initialMode: StorefrontSearchMode.aiDemo,
      ),
      overrides: <Override>[
        productsProvider.overrideWith((ref) async => products),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey<String>('ai-search-disclosure')),
        findsOneWidget);
    expect(find.text('Bathroom waterproofing and finishes'), findsOneWidget);
    expect(find.text('Bathroom Waterproof Primer'), findsOneWidget);
  });

  testWidgets('discovery hub exposes live categories and brands',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final prefs = await _prefs();
    const presentation = StorefrontPresentation(
      banners: <StorefrontBanner>[],
      categories: <StorefrontCategory>[
        StorefrontCategory(
          id: 'paint',
          name: 'Paints & Finishes',
          label: 'Paints & Finishes',
          iconKey: 'paint',
        ),
        StorefrontCategory(
          id: 'tools',
          name: 'Tools & Hardware',
          label: 'Tools & Hardware',
          iconKey: 'tools',
        ),
      ],
    );
    const products = <Product>[
      Product(
        id: 'paint-1',
        title: 'Interior Paint',
        brand: 'ColourCo',
        categoryLabel: 'Paints & Finishes',
      ),
      Product(
        id: 'tool-1',
        title: 'Cordless Drill',
        brand: 'ToolCo',
        categoryLabel: 'Tools & Hardware',
      ),
    ];
    await tester.pumpWidget(_host(
      prefs,
      const DiscoveryHubScreen(),
      overrides: <Override>[
        productsProvider.overrideWith((ref) async => products),
        presentationProvider.overrideWithValue(presentation),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.text('Paints & Finishes'), findsOneWidget);
    expect(find.text('1 products'), findsWidgets);
    await tester.tap(find.text('Brands'));
    await tester.pumpAndSettle();
    expect(find.text('Find a brand'), findsOneWidget);
    expect(find.text('ColourCo'), findsOneWidget);
    expect(find.text('ToolCo'), findsOneWidget);
  });

  testWidgets('brand storefront opens Browse with the brand applied',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final prefs = await _prefs();
    const products = <Product>[
      Product(
        id: 'paint-1',
        title: 'Interior Paint',
        brand: 'ColourCo',
        categoryLabel: 'Paints & Finishes',
        price: Money(amount: 50000, currencyCode: 'INR'),
      ),
      Product(
        id: 'tool-1',
        title: 'Cordless Drill',
        brand: 'ToolCo',
        categoryLabel: 'Tools & Hardware',
        price: Money(amount: 150000, currencyCode: 'INR'),
      ),
    ];
    await tester.pumpWidget(_host(
      prefs,
      const BrowseScreen(initialBrand: 'ToolCo'),
      overrides: <Override>[
        productsProvider.overrideWith((ref) async => products),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.text('1 result'), findsOneWidget);
    expect(find.text('ToolCo'), findsWidgets);
    expect(find.text('Cordless Drill'), findsWidgets);
    expect(find.text('Interior Paint'), findsNothing);
  });

  testWidgets('multi-SKU quick add requires an explicit variant',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final prefs = await _prefs();
    const product = Product(
      id: 'grouped',
      title: 'Grouped product',
      variants: <ProductVariant>[
        ProductVariant(
          id: 'sku-1',
          label: 'Small',
          sku: 'SKU-S',
          offerId: 'offer-1',
          price: Money(amount: 10000, currencyCode: 'INR'),
        ),
        ProductVariant(
          id: 'sku-2',
          label: 'Large',
          sku: 'SKU-L',
          offerId: 'offer-2',
          price: Money(amount: 20000, currencyCode: 'INR'),
        ),
      ],
    );
    await tester.pumpWidget(_host(
        prefs, const Scaffold(body: VariantQuickAddSheet(product: product))));
    await tester.pumpAndSettle();

    expect(find.text('Choose a variant'), findsOneWidget);
    expect(find.text('Small'), findsOneWidget);
    expect(find.text('Large'), findsOneWidget);
    expect(find.text('Add selected variant'), findsOneWidget);
  });

  test('a grouped product still requires selection with one sellable SKU', () {
    const product = Product(
      id: 'grouped-one-live',
      title: 'Grouped product',
      variants: <ProductVariant>[
        ProductVariant(
          id: 'live',
          label: 'Live',
          offerId: 'offer-live',
          price: Money(amount: 10000, currencyCode: 'INR'),
        ),
        ProductVariant(id: 'unavailable', label: 'Unavailable'),
      ],
    );

    expect(requiresVariantSelection(product), isTrue);
    expect(purchasableQuickAddVariants(product), hasLength(1));
  });

  testWidgets('pickup preference is visible and checkout stays gated',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final prefs = await _prefs(<String, Object>{
      'fulfilment_preference_v1':
          '{"mode":"pickup","pickup_point_id":"pickup_staging_bhiwadi"}',
    });
    await tester.pumpWidget(_host(prefs, const CheckoutScreen()));
    await tester.pumpAndSettle();

    expect(find.text('BuildKart staging collection desk'), findsOneWidget);
    expect(find.text('Switch to delivery to place order'), findsOneWidget);
    expect(find.textContaining('No order will be submitted as delivery'),
        findsOneWidget);
  });

  testWidgets('order timeline exposes current status semantics',
      (tester) async {
    final prefs = await _prefs();
    await tester.pumpWidget(_host(
      prefs,
      const Scaffold(
        body: OrderProgressTimeline(events: <OrderEvent>[
          OrderEvent(label: 'Order placed', timeLabel: 'Yesterday', done: true),
          OrderEvent(label: 'Packed', timeLabel: 'In progress', active: true),
          OrderEvent(label: 'Shipped', timeLabel: 'Pending'),
        ]),
      ),
    ));

    expect(
        find.bySemanticsLabel('Packed, current, In progress'), findsOneWidget);
  });

  test('pickup and WhatsApp preferences persist locally', () async {
    final prefs = await _prefs();
    final first = ProviderContainer(
      overrides: <Override>[
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
    await first.read(fulfilmentPreferenceProvider.notifier).selectPickup();
    final settings = first.read(settingsProvider);
    await first
        .read(settingsProvider.notifier)
        .update(settings.copyWith(whatsappOrderUpdates: true));
    first.dispose();

    final restored = ProviderContainer(
      overrides: <Override>[
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
    addTearDown(restored.dispose);
    expect(restored.read(fulfilmentPreferenceProvider).mode,
        FulfilmentMode.pickup);
    expect(restored.read(settingsProvider).whatsappOrderUpdates, isTrue);
  });
}
