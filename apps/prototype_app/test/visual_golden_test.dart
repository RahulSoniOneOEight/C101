// Golden renders are generated per-platform; run locally with:
//   flutter test test/visual_golden_test.dart --update-goldens
// They are excluded from CI (see .github/workflows/flutter.yml) because CI runs on Linux.
@Tags(['golden'])
library;

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/domain/app_notification.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/notifications_providers.dart';
import 'package:prototype_app/screens/b2b_home_screen.dart';
import 'package:prototype_app/screens/b2c_flow_screens.dart';
import 'package:prototype_app/screens/notifications_screen.dart';
import 'package:prototype_app/screens/product_detail_screen.dart';
import 'package:prototype_app/screens/product_list_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeExperienceApi extends ExperienceApi {
  _FakeExperienceApi() : super(Dio());

  @override
  Future<List<Product>> getComposedProducts({int limit = 50, int offset = 0}) async =>
      demoProducts;

  @override
  Future<Product> getComposedProduct(String productId) async =>
      demoProducts.firstWhere((p) => p.id == productId);

  /// Detail-shaped payload: best offer nested under `commercial.selected_seller`
  /// (the contract the product page consumes).
  @override
  Future<Map<String, dynamic>> getProduct(String productId) async {
    final p = demoProducts.firstWhere((x) => x.id == productId);
    final best = <String, dynamic>{
      'id': p.offerId ?? 'offer_best',
      'seller_name': 'BuildMaster Supplies',
      'variant_id': p.variantId ?? p.id,
      'currency_code': 'INR',
      'unit_amount_minor': p.price?.amount ?? 71190,
      'list_amount_minor': p.mrp?.amount ?? 79100,
      'in_stock': true,
    };
    return <String, dynamic>{
      'id': p.id,
      'title': p.title,
      'thumbnail': p.thumbnail,
      'variants': <dynamic>[
        <String, dynamic>{'id': p.variantId ?? p.id},
      ],
      'offers': <dynamic>[
        best,
        <String, dynamic>{
          'id': 'offer_2',
          'seller_name': 'BuildMart Supplies',
          'variant_id': p.variantId ?? p.id,
          'currency_code': 'INR',
          'unit_amount_minor': ((p.price?.amount ?? 71190) * 1.04).round(),
          'list_amount_minor': ((p.price?.amount ?? 71190) * 1.04).round(),
          'in_stock': true,
        },
      ],
      'commercial': <String, dynamic>{'selected_seller': best},
    };
  }
}

class _GoldenNotifications extends NotificationsNotifier {
  @override
  List<AppNotification> build() => const <AppNotification>[
        AppNotification(
          id: 'n1',
          audience: NotificationAudience.b2b,
          title: 'Quotation received',
          body: '3 sellers responded to RFQ-2841 (bathroom fittings, 5 items).',
          timeLabel: '1h',
          kind: NotificationKind.order,
        ),
        AppNotification(
          id: 'n2',
          audience: NotificationAudience.b2b,
          title: 'Credit limit updated',
          body: 'Your available trade credit is now 4.2L.',
          timeLabel: '6h',
          kind: NotificationKind.credit,
        ),
        AppNotification(
          id: 'n3',
          audience: NotificationAudience.b2b,
          title: 'Monsoon scheme is live',
          body: 'Buy 100 Get 5 Free on select plumbing and paints.',
          timeLabel: '1d',
          kind: NotificationKind.offer,
          read: true,
        ),
      ];
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  await tester.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
}

void main() {
  testWidgets('onboarding', (t) async {
    await t.pumpWidget(MaterialApp(theme: AgencyTheme.light(), home: const OnboardingScreen()));
    await _capture(t, 'onboarding');
  });

  testWidgets('login', (t) async {
    await t.pumpWidget(
      ProviderScope(child: MaterialApp(theme: AgencyTheme.light(), home: const LoginScreen())),
    );
    await _capture(t, 'login');
  });

  testWidgets('notifications b2b', (t) async {
    await t.pumpWidget(ProviderScope(
      overrides: [notificationsProvider.overrideWith(_GoldenNotifications.new)],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const NotificationsScreen(audience: NotificationAudience.b2b, loadOnOpen: false),
      ),
    ));
    await _capture(t, 'notifications_b2b');
  });

  testWidgets('home product list', (t) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    await t.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        experienceApiProvider.overrideWithValue(_FakeExperienceApi()),
      ],
      child: MaterialApp(theme: AgencyTheme.light(), home: const ProductListScreen()),
    ));
    await _capture(t, 'home');
  });

  testWidgets('product detail', (t) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    await t.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        experienceApiProvider.overrideWithValue(_FakeExperienceApi()),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: ProductDetailScreen(productId: demoProducts.first.id),
      ),
    ));
    await _capture(t, 'product_detail');
  });

  testWidgets('b2b home', (t) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();
    await t.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        experienceApiProvider.overrideWithValue(_FakeExperienceApi()),
      ],
      child: MaterialApp(theme: AgencyTheme.light(), home: const B2BHomeScreen()),
    ));
    await _capture(t, 'b2b_home');
  });
}
