import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/data/local_store.dart';
import 'package:prototype_app/widgets/fulfilment_promise_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _ServiceabilityApi extends ExperienceApi {
  _ServiceabilityApi(this.result) : super(Dio());

  final Future<Map<String, dynamic>> Function(String postcode) result;

  @override
  Future<Map<String, dynamic>> checkServiceability(String postcode) =>
      result(postcode);
}

void main() {
  Future<void> pumpCard(
    WidgetTester tester, {
    required Size size,
    required Future<Map<String, dynamic>> Function(String postcode) result,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        experienceApiProvider.overrideWithValue(_ServiceabilityApi(result)),
      ],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: FulfilmentPromiseCard(),
          ),
        ),
      ),
    ));
  }

  for (final size in <Size>[
    const Size(390, 844),
    const Size(360, 800),
  ]) {
    testWidgets('fulfilment promise fits ${size.width.toInt()}px mobile',
        (tester) async {
      addTearDown(tester.view.reset);
      await pumpCard(
        tester,
        size: size,
        result: (_) async {
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return <String, dynamic>{
            'serviceable': true,
            'eta_days': 3,
            'reason': null,
          };
        },
      );
      await tester.pump();
      expect(find.textContaining('Checking delivery'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpAndSettle();

      expect(find.textContaining('Delivery available'), findsOneWidget);
      expect(find.textContaining('Estimated in 3 days'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('unserviceable result does not invent an ETA', (tester) async {
    addTearDown(tester.view.reset);
    await pumpCard(
      tester,
      size: const Size(360, 800),
      result: (_) async => <String, dynamic>{
        'serviceable': false,
        'eta_days': 9,
        'reason': 'invalid_postcode',
      },
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Delivery unavailable'), findsOneWidget);
    expect(find.textContaining('Estimated in'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('serviceability failure stays explicit without an ETA',
      (tester) async {
    addTearDown(tester.view.reset);
    await pumpCard(
      tester,
      size: const Size(360, 800),
      result: (_) async => throw Exception('offline'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Delivery check unavailable. Confirm at checkout.'),
        findsOneWidget);
    expect(find.textContaining('Estimated in'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
