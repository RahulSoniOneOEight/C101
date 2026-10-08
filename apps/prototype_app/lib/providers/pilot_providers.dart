import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../notifications/push_notification_coordinator.dart';
import 'notifications_providers.dart';

/// Riverpod wiring for the shared Experience API. These providers connect the Flutter state layer
/// to the canonical backend (composed products/collections, dummy OTP, logistics, notifications).
/// Screens consume these instead of manufacturing business decisions locally.

/// New-arrivals collection from the Experience API.
final pilotNewArrivalsProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(experienceApiProvider).getCollection('new_arrivals');
});

/// A single composed product (Medusa product + Mercur offers + commercial eligibility).
final pilotProductProvider =
    FutureProvider.family<Map<String, dynamic>, String>(
  (ref, productId) async {
    return ref.watch(experienceApiProvider).getProduct(productId);
  },
);

/// Dummy delivery serviceability for a postcode.
final pilotServiceabilityProvider =
    FutureProvider.family<Map<String, dynamic>, String>(
  (ref, postcode) async {
    return ref.watch(experienceApiProvider).checkServiceability(postcode);
  },
);

/// Dummy notification feed.
final pilotNotificationsProvider = FutureProvider<List<dynamic>>((ref) async {
  return ref.watch(experienceApiProvider).getNotifications();
});

/// OTP challenge/verify state. Holds the current challenge (after request), then
/// the session (after verify). `null` until the user starts the flow.
class PilotOtpNotifier extends Notifier<Map<String, dynamic>?> {
  @override
  Map<String, dynamic>? build() => null;

  Future<Map<String, dynamic>> requestChallenge(String identifier) async {
    final api = ref.read(experienceApiProvider);
    final challenge = await api.requestOtp(identifier);
    state = challenge;
    return challenge;
  }

  Future<Map<String, dynamic>> verify(String code) async {
    final challengeId = state?['challenge_id'] as String?;
    if (challengeId == null) {
      throw StateError('No OTP challenge issued yet');
    }
    final api = ref.read(experienceApiProvider);
    final result = await api.verifyOtp(challengeId, code);
    state = result;
    try {
      await ref.read(pushNotificationCoordinatorProvider).activate();
    } catch (_) {
      // Push setup is best-effort and must never invalidate a successful login.
    }
    try {
      await ref.read(notificationsProvider.notifier).refresh();
    } catch (_) {
      // Inbox availability must never invalidate a successful login.
    }
    return result;
  }

  Future<void> reset() async {
    await ref.read(experienceApiProvider).clearSession();
    state = null;
  }

  Future<void> logout() async {
    final push = ref.read(pushNotificationCoordinatorProvider);
    try {
      await ref.read(experienceApiProvider).logout(deviceId: push.deviceId);
    } finally {
      try {
        await push.clearLocalRegistration();
      } catch (_) {
        // Local session cleanup below must still complete.
      }
      ref.invalidate(notificationsProvider);
      state = null;
    }
  }
}

final pilotOtpProvider =
    NotifierProvider<PilotOtpNotifier, Map<String, dynamic>?>(
        PilotOtpNotifier.new);
