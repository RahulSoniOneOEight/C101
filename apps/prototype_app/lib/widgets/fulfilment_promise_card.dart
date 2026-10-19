import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/account_models.dart';
import '../domain/storefront_ux.dart';
import '../providers/account_providers.dart';
import '../providers/pilot_providers.dart';
import '../providers/storefront_ux_providers.dart';

/// PDP fulfilment selector backed by the saved address and staging logistics.
class FulfilmentPromiseCard extends ConsumerWidget {
  const FulfilmentPromiseCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final preference = ref.watch(fulfilmentPreferenceProvider);
    final address =
        _selectedAddress(ref, preference) ?? ref.watch(defaultAddressProvider);

    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(Icons.local_shipping_outlined,
                  size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.xs),
              Expanded(
                child: Text('How would you like to get it?',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary)),
              ),
              _tag(colors, 'STAGING'),
            ],
          ),
          const SizedBox(height: AgencySpacing.sm),
          FulfilmentModeSelector(
            mode: preference.mode,
            onChanged: (mode) {
              if (mode == FulfilmentMode.delivery) {
                ref
                    .read(fulfilmentPreferenceProvider.notifier)
                    .selectDelivery(addressId: address?.id);
              } else {
                ref.read(fulfilmentPreferenceProvider.notifier).selectPickup();
              }
            },
          ),
          const SizedBox(height: AgencySpacing.sm),
          if (preference.mode == FulfilmentMode.delivery)
            _delivery(context, ref, colors, address)
          else
            _pickup(colors),
        ],
      ),
    );
  }

  SavedAddress? _selectedAddress(
      WidgetRef ref, FulfilmentPreference preference) {
    for (final address in ref.watch(addressesProvider)) {
      if (address.id == preference.addressId) return address;
    }
    return null;
  }

  Widget _delivery(BuildContext context, WidgetRef ref, AgencyColors colors,
      SavedAddress? address) {
    if (address == null) {
      return ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.add_location_alt_outlined),
        title: const Text('Add an address to check delivery'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/addresses'),
      );
    }
    final state = ref.watch(pilotServiceabilityProvider(address.pincode));
    return state.when(
      loading: () => Row(
        children: <Widget>[
          const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Text('Checking delivery to ${address.pincode}…',
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          ),
        ],
      ),
      error: (_, __) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(Icons.info_outline, size: 18, color: colors.feedbackWarning),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: Text('Delivery check unavailable. Confirm at checkout.',
                    style: TextStyle(
                        fontSize: 12, color: colors.contentSecondary)),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () =>
                  ref.invalidate(pilotServiceabilityProvider(address.pincode)),
              child: const Text('Retry'),
            ),
          ),
        ],
      ),
      data: (result) {
        final serviceable = result['serviceable'] == true;
        final eta = (result['eta_days'] as num?)?.toInt();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  serviceable
                      ? Icons.check_circle_outline
                      : Icons.error_outline,
                  size: 19,
                  color: serviceable
                      ? colors.feedbackSuccess
                      : colors.actionDestructive,
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        serviceable
                            ? 'Delivery available to ${address.label} · ${address.pincode}'
                            : 'Delivery unavailable for ${address.pincode}',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: colors.contentPrimary),
                      ),
                      if (serviceable && eta != null && eta > 0)
                        Text(
                            'Estimated in $eta days · simulated staging promise',
                            style: TextStyle(
                                fontSize: 11, color: colors.contentSecondary)),
                    ],
                  ),
                ),
              ],
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push('/addresses'),
                child: const Text('Change address'),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _pickup(AgencyColors colors) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.storefront_outlined, size: 19, color: colors.trust),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(stagingPickupPoint.name,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                Text(
                    '${stagingPickupPoint.location} · ${stagingPickupPoint.hours}',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
                const SizedBox(height: 2),
                Text(
                  'Fixture location only. Pickup ordering is gated until a canonical shipping option exists.',
                  style: TextStyle(
                      fontSize: 10,
                      height: 1.3,
                      color: colors.actionDestructive),
                ),
              ],
            ),
          ),
        ],
      );

  Widget _tag(AgencyColors colors, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: colors.actionPrimary)),
      );
}

/// Compact, mobile-safe delivery/pickup selector with explicit selected
/// semantics. Custom buttons avoid the minimum-width overflow of a segmented
/// control at narrow widths.
class FulfilmentModeSelector extends StatelessWidget {
  const FulfilmentModeSelector({
    required this.mode,
    required this.onChanged,
    super.key,
  });

  final FulfilmentMode mode;
  final ValueChanged<FulfilmentMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(child: _button(context, FulfilmentMode.delivery)),
        const SizedBox(width: AgencySpacing.sm),
        Expanded(child: _button(context, FulfilmentMode.pickup)),
      ],
    );
  }

  Widget _button(BuildContext context, FulfilmentMode value) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final selected = mode == value;
    return Semantics(
      button: true,
      selected: selected,
      child: OutlinedButton(
        onPressed: () => onChanged(value),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(44),
          backgroundColor:
              selected ? colors.surfaceInteractive : colors.surfaceRaised,
          foregroundColor:
              selected ? colors.actionPrimary : colors.contentPrimary,
          side: BorderSide(
              color: selected ? colors.actionPrimary : colors.borderDefault),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            if (selected) ...<Widget>[
              const Icon(Icons.check, size: 16),
              const SizedBox(width: 4),
            ],
            Flexible(child: Text(value.label)),
          ],
        ),
      ),
    );
  }
}
