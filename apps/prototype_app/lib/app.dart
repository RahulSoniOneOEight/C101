import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';

/// Root widget of the PinCommerce storefront.
class PinCommerceApp extends ConsumerWidget {
  const PinCommerceApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'PinCommerce',
      theme: AgencyTheme.light(),
      routerConfig: router,
    );
  }
}
