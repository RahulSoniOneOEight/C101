import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/account_providers.dart';
import '../widgets/notification_bell.dart';

/// D2C (consumer) account hub. Every entry navigates to a working screen; the
/// profile header opens Profile. There are no role restrictions here — the
/// consumer account owns all of these journeys.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final profile = ref.watch(profileProvider);
    final wishlistCount = ref.watch(wishlistProvider).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
        actions: const <Widget>[NotificationBell()],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
            child: InkWell(
              onTap: () => context.push('/profile'),
              borderRadius: BorderRadius.circular(AgencyRadius.lg),
              child: Container(
                padding: const EdgeInsets.all(AgencySpacing.md),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(AgencyRadius.lg),
                  border: Border.all(color: colors.borderDefault),
                ),
                child: Row(
                  children: <Widget>[
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: colors.surfaceInteractive,
                      child: Text(profile.initials,
                          style: TextStyle(
                              color: colors.actionPrimary,
                              fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: AgencySpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(profile.name,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: colors.contentPrimary)),
                          const SizedBox(height: 2),
                          Text(
                              profile.phone.isEmpty
                                  ? profile.email
                                  : profile.phone,
                              style: TextStyle(
                                  fontSize: 12,
                                  color: colors.contentSecondary)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, size: 18),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AgencySpacing.md),
          for (final item in const <(IconData, String, String)>[
            (Icons.receipt_long_outlined, 'My Orders', '/orders'),
            (Icons.favorite_border, 'Wishlist', '/wishlist'),
            (Icons.location_on_outlined, 'Saved Addresses', '/addresses'),
            (Icons.payment_outlined, 'Payment Methods', '/payments'),
            (Icons.description_outlined, 'GST & Invoices', '/gst-invoices'),
            (Icons.help_outline, 'Help & Support', '/help'),
            (Icons.settings_outlined, 'Settings', '/settings'),
          ])
            ListTile(
              leading: Icon(item.$1, color: colors.actionPrimary),
              title: Text(item.$2,
                  style: TextStyle(
                      fontSize: 13, color: colors.contentPrimary)),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  if (item.$2 == 'Wishlist' && wishlistCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: AgencySpacing.xs),
                      child: Text('$wishlistCount',
                          style: TextStyle(
                              fontSize: 12, color: colors.contentSecondary)),
                    ),
                  const Icon(Icons.chevron_right, size: 18),
                ],
              ),
              onTap: () => context.push(item.$3),
            ),
        ],
      ),
    );
  }
}
