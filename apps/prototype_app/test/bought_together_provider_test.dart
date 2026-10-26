import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/bought_together.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';

class _BoughtTogetherApi extends ExperienceApi {
  _BoughtTogetherApi() : super(Dio());

  final Completer<BoughtTogether?> response = Completer<BoughtTogether?>();
  int calls = 0;
  String? requestedSku;

  @override
  Future<BoughtTogether?> getBoughtTogether(
    String productId, {
    String channel = 'b2c',
    String? sku,
  }) {
    calls += 1;
    requestedSku = sku;
    return response.future;
  }
}

void main() {
  test('SKU pair request survives a lazy PDP child going off-screen', () async {
    final api = _BoughtTogetherApi();
    final container = ProviderContainer(
      overrides: [
        experienceApiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(container.dispose);

    const key = (
      id: 'prod_socket_set',
      channel: 'b2c',
      sku: 'BAUM-237S1-SET-HEX',
    );
    final subscription = container.listen(
      boughtTogetherProvider(key),
      (_, __) {},
      fireImmediately: true,
    );
    await Future<void>.delayed(Duration.zero);

    expect(api.calls, 1);
    expect(api.requestedSku, key.sku);

    // The PDP is a lazy ListView. Its zero-height loading child can temporarily
    // leave the viewport; the in-flight response must remain cached so the
    // section can render when that child is rebuilt.
    subscription.close();
    await Future<void>.delayed(Duration.zero);
    api.response.complete(
      const BoughtTogether(
        pairId: 'btp_1',
        channel: 'b2c',
        pairedAvailability: 'in_stock',
        paired: Product(id: 'prod_pendant', title: 'Pendant'),
      ),
    );

    final pair = await container.read(boughtTogetherProvider(key).future);
    expect(api.calls, 1);
    expect(pair?.pairId, 'btp_1');
  });
}
