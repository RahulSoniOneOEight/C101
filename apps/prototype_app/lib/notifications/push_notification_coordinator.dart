import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/experience_api.dart';
import '../data/local_store.dart';

class PushNotificationCoordinator {
  PushNotificationCoordinator(this._api, this._preferences);

  static const _deviceIdKey = 'pilot_fcm_device_id_v1';
  static const _tokenKey = 'pilot_fcm_token_v1';

  final ExperienceApi _api;
  final SharedPreferences _preferences;
  final StreamController<String> _deepLinks =
      StreamController<String>.broadcast();
  final StreamController<void> _inboxRefreshes =
      StreamController<void>.broadcast();
  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;

  Stream<String> get deepLinks => _deepLinks.stream;
  Stream<void> get inboxRefreshes => _inboxRefreshes.stream;
  String? get deviceId => _preferences.getString(_deviceIdKey);

  Future<void> activate() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    final messaging = FirebaseMessaging.instance;
    final settings =
        await messaging.requestPermission(alert: true, badge: true, sound: true);
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;
    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) await _register(token);

    await _tokenSubscription?.cancel();
    await _messageSubscription?.cancel();
    await _openedSubscription?.cancel();
    _tokenSubscription = messaging.onTokenRefresh.listen((value) {
      _register(value).catchError((Object error) {
        debugPrint('FCM token refresh registration failed: $error');
      });
    });
    _messageSubscription = FirebaseMessaging.onMessage.listen((_) {
      _inboxRefreshes.add(null);
    });
    _openedSubscription =
        FirebaseMessaging.onMessageOpenedApp.listen(_openMessage);
    final initial = await messaging.getInitialMessage();
    if (initial != null) _openMessage(initial);
  }

  Future<void> clearLocalRegistration() async {
    await _tokenSubscription?.cancel();
    await _messageSubscription?.cancel();
    await _openedSubscription?.cancel();
    _tokenSubscription = null;
    _messageSubscription = null;
    _openedSubscription = null;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      await FirebaseMessaging.instance.deleteToken().catchError((_) {});
    }
    await _preferences.remove(_deviceIdKey);
    await _preferences.remove(_tokenKey);
  }

  Future<void> _register(String token) async {
    final id = await _api.registerDevice(token);
    await _preferences.setString(_deviceIdKey, id);
    await _preferences.setString(_tokenKey, token);
  }

  void _openMessage(RemoteMessage message) {
    _inboxRefreshes.add(null);
    final value = message.data['deep_link'];
    if (value is String && _isAllowedDeepLink(value)) _deepLinks.add(value);
  }

  bool _isAllowedDeepLink(String value) =>
      value == '/notifications' ||
      value.startsWith('/orders/') ||
      value.startsWith('/track?') ||
      value.startsWith('/product/');
}

final pushNotificationCoordinatorProvider =
    Provider<PushNotificationCoordinator>((ref) {
  return PushNotificationCoordinator(
    ref.watch(experienceApiProvider),
    ref.watch(sharedPreferencesProvider),
  );
});
