import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/app_notification.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/presentation.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/notifications_providers.dart';
import 'package:prototype_app/screens/product_list_screen.dart';
import 'package:prototype_app/widgets/home_banner_carousel.dart';
import 'package:prototype_app/widgets/home_pinned_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeExperienceApi extends ExperienceApi {
  _FakeExperienceApi() : super(Dio());

  @override
  Future<List<Product>> getComposedProducts({
    int limit = 50,
    int offset = 0,
    String? collectionId,
    String channel = 'b2c',
    String? catalogueImport,
  }) async =>
      demoProducts;

  @override
  Future<List<Product>> getAllComposedProducts({
    String channel = 'b2c',
    String? catalogueImport,
    int pageSize = 250,
    int maxPages = 20,
  }) async =>
      demoProducts;

  @override
  Future<List<StorefrontSection>> getLayoutSections(
          {String locale = 'en-IN', String channel = 'b2c'}) async =>
      const <StorefrontSection>[];

  @override
  Future<Cart> createCart() async => const Cart(id: 'cart_test');
}

class _EmptyNotifications extends NotificationsNotifier {
  @override
  List<AppNotification> build() => const <AppNotification>[];
}

/// Reads the colour the bar merges into its title row.
Color? _titleColor(WidgetTester tester) =>
    DefaultTextStyle.of(tester.element(find.text('BuildKart'))).style.color;

double _barAlpha(WidgetTester tester) {
  final container = tester.widget<Container>(
    find.byKey(const ValueKey<String>('home-bar-surface')),
  );
  return (container.decoration! as BoxDecoration).color!.a;
}

Future<void> _pumpHome(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();

  await tester.pumpWidget(ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      experienceApiProvider.overrideWithValue(_FakeExperienceApi()),
      notificationsProvider.overrideWith(_EmptyNotifications.new),
    ],
    child: MaterialApp(
      theme: AgencyTheme.light(),
      home: const ProductListScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('pinned bar', () {
    testWidgets('flips from white to ink at exactly t = 0.5', (tester) async {
      final progress = ValueNotifier<double>(0);
      addTearDown(progress.dispose);

      await tester.pumpWidget(ProviderScope(
        overrides: [
          notificationsProvider.overrideWith(_EmptyNotifications.new),
        ],
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: Scaffold(
            body: HomePinnedBar(
              progress: progress,
              cartCount: 0,
              onSearch: () {},
              onCart: () {},
              onTrade: () {},
            ),
          ),
        ),
      ));

      final ink = AgencyHomePalette.light.ink;
      expect(_titleColor(tester), Colors.white);
      expect(find.byKey(const ValueKey<String>('home-bar-progress-line')),
          findsNothing);

      progress.value = 0.49;
      await tester.pump();
      expect(_titleColor(tester), Colors.white,
          reason: 'below the threshold the bar is still over the navy gradient');

      progress.value = 0.5;
      await tester.pump();
      expect(_titleColor(tester), ink,
          reason: 'at the threshold the bar has become light');

      progress.value = 0.9;
      await tester.pump();
      expect(find.byKey(const ValueKey<String>('home-bar-progress-line')),
          findsNothing,
          reason: 'the progress line appears only above 0.9');

      progress.value = 1;
      await tester.pump();
      expect(find.byKey(const ValueKey<String>('home-bar-progress-line')),
          findsOneWidget);
      expect(_barAlpha(tester), 1.0,
          reason: 'at the end the bar is the page surface');
    });

    testWidgets('search keeps a white fill in both states', (tester) async {
      final progress = ValueNotifier<double>(1);
      addTearDown(progress.dispose);

      await tester.pumpWidget(ProviderScope(
        overrides: [
          notificationsProvider.overrideWith(_EmptyNotifications.new),
        ],
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: Scaffold(
            body: HomePinnedBar(
              progress: progress,
              cartCount: 3,
              onSearch: () {},
              onCart: () {},
              onTrade: () {},
            ),
          ),
        ),
      ));

      final field = tester.widget<Material>(
        find
            .ancestor(
              of: find.text('Search products or ask what you need'),
              matching: find.byType(Material),
            )
            .first,
      );
      expect(field.color, Colors.white);
    });
  });

  testWidgets('scrolling Home flips the bar and scrolling back restores it',
      (tester) async {
    await _pumpHome(tester);

    final ink = AgencyHomePalette.light.ink;
    expect(_titleColor(tester), Colors.white);
    expect(_barAlpha(tester), 0);
    expect(
      tester.getSize(find.byType(PageView)).height,
      greaterThan(HomeBannerCarousel.defaultCardHeight),
      reason: 'the header awards its leftover height to the banner, not a blank band',
    );

    await tester.drag(
        find.byKey(const ValueKey<String>('home-scroll')), const Offset(0, -600));
    await tester.pumpAndSettle();

    expect(_titleColor(tester), ink,
        reason: 'the products sheet has arrived, so the bar is light');
    expect(_barAlpha(tester), 1.0);
    expect(find.byKey(const ValueKey<String>('home-bar-progress-line')),
        findsOneWidget);

    await tester.drag(
        find.byKey(const ValueKey<String>('home-scroll')), const Offset(0, 900));
    await tester.pumpAndSettle();

    expect(_titleColor(tester), Colors.white);
    expect(find.byKey(const ValueKey<String>('home-bar-progress-line')),
        findsNothing);
  });
}
