import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/storefront_collection.dart';
import 'package:prototype_app/screens/collection_screen.dart';

/// A collection URL must never look like a working page when it is not one. These pin the three states
/// apart: wrong link, a real collection with nothing in it, and a collection with products.
class _FakeApi extends ExperienceApi {
  _FakeApi(this._resolve) : super(Dio());

  final Future<StorefrontCollection> Function(String key) _resolve;

  @override
  Future<StorefrontCollection> getStorefrontCollection(String key) => _resolve(key);

  /// A registry-style key has no commerce id, so the provider falls back to the resolved item list.
  @override
  Future<List<dynamic>> getCollection(String key) async => const <dynamic>[];
}

Future<void> _pump(WidgetTester tester, ExperienceApi api, {String key = 'flash-deals'}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [experienceApiProvider.overrideWithValue(api)],
      child: MaterialApp(home: CollectionScreen(collectionKey: key)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('an unknown link says not found instead of showing products', (tester) async {
    await _pump(
      tester,
      _FakeApi((_) async => throw const CollectionNotFoundException('collection-not-found')),
    );

    expect(find.text('Collection not found'), findsOneWidget);
    expect(find.textContaining('renamed or removed'), findsOneWidget);
  });

  testWidgets('an empty collection is distinguished from a broken link', (tester) async {
    await _pump(
      tester,
      _FakeApi((_) async => throw const CollectionNotFoundException('collection-empty')),
    );

    expect(find.text('Nothing here yet'), findsOneWidget);
    expect(find.textContaining('no products available right now'), findsOneWidget);
  });

  testWidgets('a collection with no deliverable products says so', (tester) async {
    await _pump(
      tester,
      _FakeApi((key) async => StorefrontCollection(key: key, title: 'Flash Deals')),
    );

    expect(find.text('Flash Deals'), findsOneWidget);
    expect(find.text('No products yet'), findsOneWidget);
  });

  testWidgets('a key with no published title is humanised, not shown raw', (tester) async {
    await _pump(
      tester,
      _FakeApi((key) async => StorefrontCollection(key: key)),
      key: 'monsoon-site-essentials',
    );

    expect(find.text('Monsoon Site Essentials'), findsOneWidget);
    expect(find.text('monsoon-site-essentials'), findsNothing);
  });
}
