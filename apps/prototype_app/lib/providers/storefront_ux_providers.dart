import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local_store.dart';
import '../domain/storefront_ux.dart';

class FulfilmentPreferenceNotifier extends Notifier<FulfilmentPreference> {
  @override
  FulfilmentPreference build() =>
      ref.read(localStoreProvider).readFulfilmentPreference();

  Future<void> selectDelivery({String? addressId}) async {
    state = FulfilmentPreference(
      mode: FulfilmentMode.delivery,
      addressId: addressId ?? state.addressId,
    );
    await ref.read(localStoreProvider).writeFulfilmentPreference(state);
  }

  Future<void> selectPickup(
      {String pickupPointId = 'pickup_staging_bhiwadi'}) async {
    state = FulfilmentPreference(
      mode: FulfilmentMode.pickup,
      addressId: state.addressId,
      pickupPointId: pickupPointId,
    );
    await ref.read(localStoreProvider).writeFulfilmentPreference(state);
  }
}

final fulfilmentPreferenceProvider =
    NotifierProvider<FulfilmentPreferenceNotifier, FulfilmentPreference>(
  FulfilmentPreferenceNotifier.new,
);
