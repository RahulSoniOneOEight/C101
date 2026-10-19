import 'dart:async';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';
import 'notifications/push_notification_coordinator.dart';
import 'data/experience_api.dart';
import 'core/app_config.dart';
import 'core/session_route_policy.dart';
import 'providers/notifications_providers.dart';
import 'widgets/staging_strip.dart';

/// Root widget of the PinCommerce storefront.
class PinCommerceApp extends ConsumerStatefulWidget {
  const PinCommerceApp({super.key});

  @override
  ConsumerState<PinCommerceApp> createState() => _PinCommerceAppState();
}

class _PinCommerceAppState extends ConsumerState<PinCommerceApp> {
  StreamSubscription<String>? _deepLinkSubscription;
  StreamSubscription<void>? _refreshSubscription;

  @override
  void initState() {
    super.initState();
    final push = ref.read(pushNotificationCoordinatorProvider);
    _deepLinkSubscription = push.deepLinks.listen((location) {
      ref.read(appRouterProvider).go(location);
    });
    _refreshSubscription = push.inboxRefreshes.listen((_) {
      ref.read(notificationsProvider.notifier).refresh().catchError((_) {});
    });
    Future<void>.microtask(() async {
      try {
        final api = ref.read(experienceApiProvider);
        final restored = await api.restoreSession();
        if (!restored) return;
        await push.activate();
        await ref.read(notificationsProvider.notifier).refresh();
        final contexts = await api.getMyContexts();
        final roles = contexts
            .expand(
                (context) => (context['roles'] as List? ?? const <dynamic>[]))
            .map((role) => role.toString())
            .toSet();
        final router = ref.read(appRouterProvider);
        final redirect = restoredSessionRedirect(
          currentPath: router.routeInformationProvider.value.uri.path,
          roles: roles,
        );
        if (redirect != null) router.go(redirect);
      } catch (_) {
        // Startup stays usable when secure storage, FCM or the staging API is unavailable.
      }
    });
  }

  @override
  void dispose() {
    _deepLinkSubscription?.cancel();
    _refreshSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'BuildKart Staging',
      theme: AgencyTheme.light(),
      routerConfig: router,
      builder: (context, child) {
        final body = child ?? const SizedBox.shrink();
        if (AppConfig.environment != 'staging') return body;

        // A corner ribbon always sits on top of a control (here, the cart). A full-width strip can
        // never cover a tap target, and it disappears outside staging.
        return Column(
          children: <Widget>[
            const StagingStrip(),
            Expanded(child: body),
          ],
        );
      },
    );
  }
}
