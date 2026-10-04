import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:prototype_app/app.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/data/medusa_api.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fakes the Medusa client so the smoke test runs without a backend.
class _FakeMedusaStoreClient extends MedusaStoreClient {
  _FakeMedusaStoreClient() : super(Dio());

  @override
  Future<List<Product>> listProducts({int limit = 20, int offset = 0}) async {
    return const <Product>[];
  }

  @override
  Future<Cart> createCart() async => const Cart(id: 'cart_test');
}

void main() {
  testWidgets('app renders the empty catalog', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          medusaClientProvider.overrideWithValue(_FakeMedusaStoreClient()),
        ],
        child: const PinCommerceApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Onboarding → Login (Consumer D2C) → Home
    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign In'));
    await tester.pumpAndSettle();

    expect(find.text('BuildKart'), findsOneWidget);
    expect(find.text('No products yet — seed your Medusa catalog.'),
        findsOneWidget);
  });
}
