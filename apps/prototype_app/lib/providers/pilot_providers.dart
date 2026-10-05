import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';

/// Riverpod wiring for the shared Experience API. These providers connect the Flutter state layer
/// to the canonical backend (composed products/collections, dummy OTP, logistics, notifications).
/// Screens consume these instead of manufacturing business decisions locally.

/// New-arrivals collection from the Experience API.
final pilotNewArrivalsProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(experienceApiProvider).getCollection('new_arrivals');
});

/// A single composed product (Medusa product + Mercur offers + commercial eligibility).
final pilotProductProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, productId) async {
    return ref.watch(experienceApiProvider).getProduct(productId);
  },
);

/// Dummy delivery serviceability for a postcode.
final pilotServiceabilityProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, postcode) async {
    return ref.watch(experienceApiProvider).checkServiceability(postcode);
  },
);

/// Dummy notification feed.
final pilotNotificationsProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(experienceApiProvider).getNotifications();
});

/// OTP challenge/verify result. `null` until the user completes the flow.
class PilotOtpNotifier extends Notifier<Map<String, dynamic>?> {
  @override
  Map<String, dynamic>? build() => null;

  Future<Map<String, dynamic>> requestChallenge(String identifier) async {
    final api = ref.read(experienceApiProvider);
    return api.requestOtp(identifier);
  }

  Future<Map<String, dynamic>> verify(String challengeId, String code) async {
    final api = ref.read(experienceApiProvider);
    final result = await api.verifyOtp(challengeId, code);
    state = result;
    return result;
  }
}

final pilotOtpProvider = NotifierProvider<PilotOtpNotifier, Map<String, dynamic>?>(PilotOtpNotifier.new);
