import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/experience_api.dart';
import '../domain/account_models.dart';
import '../domain/models.dart';
import '../providers/account_providers.dart';
import '../providers/cart_providers.dart';
import '../widgets/address_form_sheet.dart';
import '../widgets/promotion_panel.dart';

/// B2C checkout: delivery address, contact, delivery method, promo, summary.
///
/// The address is chosen first because delivery options depend on it. The
/// default (or last used) saved address is prefilled so a repeat buyer can place
/// an order without typing. Success is shown only after the Experience API
/// returns a canonical order group.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final TextEditingController _emailController = TextEditingController();

  String? _selectedAddressId;
  bool _submitting = false;
  bool _loadingShipping = false;
  bool _bootstrapped = false;
  bool _orderPlaced = false;
  String? _shippingError;
  String? _inlineError;
  List<ShippingOption> _shippingOptions = const <ShippingOption>[];
  Map<String, ShippingOption> _selectedShippingBySeller =
      const <String, ShippingOption>{};

  List<String> get _sellerIds =>
      _shippingOptions.map((option) => option.sellerId).toSet().toList();

  Money? get _selectedShippingTotal {
    if (_selectedShippingBySeller.isEmpty) return null;
    final options = _selectedShippingBySeller.values;
    return Money(
      amount: options.fold(0, (sum, option) => sum + option.price.amount),
      currencyCode: options.first.price.currencyCode,
    );
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    // Only the authenticated identity may prefill checkout. The demo profile is
    // not a valid checkout identity and made the BFF reject customer details.
    String? sessionEmail;
    try {
      sessionEmail =
          await ref.read(experienceApiProvider).currentSessionEmail();
    } catch (_) {
      sessionEmail = null;
    }
    _emailController.text = sessionEmail ?? '';
    await _alignSeedNames(ref.read(experienceApiProvider).sessionName);

    // Rehydrate from the server so totals and applied codes are authoritative.
    await ref.read(cartProvider.notifier).rehydrate();

    final start = ref.read(checkoutStartAddressProvider);
    if (start != null) {
      _selectedAddressId = start.id;
      await _applyAddress(start, saveLast: false);
    }
    if (mounted) setState(() => _bootstrapped = true);
  }

  /// Keeps the demonstration address book in step with the signed-in profile.
  ///
  /// Only the untouched seed records are renamed; an address the buyer added or
  /// edited is never rewritten.
  Future<void> _alignSeedNames(String? sessionName) async {
    final name = sessionName?.trim();
    if (name == null || name.isEmpty) return;
    const seedNames = <String>{
      'Rahul Sharma',
      'Rahul Sharma (Site office)',
    };
    const seedIds = <String>{'addr_home', 'addr_site', 'addr_office'};
    final notifier = ref.read(addressesProvider.notifier);
    for (final address in ref.read(addressesProvider)) {
      if (!seedIds.contains(address.id) ||
          !seedNames.contains(address.fullName)) {
        continue;
      }
      final suffix =
          address.fullName.contains('(Site office)') ? ' (Site office)' : '';
      await notifier.update(address.copyWith(fullName: '$name$suffix'));
    }
  }

  SavedAddress? _resolveAddress(List<SavedAddress> addresses) {
    for (final address in addresses) {
      if (address.id == _selectedAddressId) return address;
    }
    return null;
  }

  Future<void> _applyAddress(SavedAddress address,
      {bool saveLast = true}) async {
    setState(() {
      _selectedAddressId = address.id;
      _shippingOptions = const <ShippingOption>[];
      _selectedShippingBySeller = const <String, ShippingOption>{};
      _shippingError = null;
      _inlineError = null;
    });
    if (saveLast) {
      await ref.read(lastCheckoutAddressProvider.notifier).set(address.id);
    }
    await _syncCustomerDetails(address);
    await _loadShippingOptions();
  }

  Future<void> _syncCustomerDetails(SavedAddress? address) async {
    final cart = ref.read(cartProvider).value;
    if (cart == null || address == null) return;
    var email = _emailController.text.trim();
    if (email.isEmpty) {
      email =
          (await ref.read(experienceApiProvider).currentSessionEmail()) ?? '';
      if (email.isNotEmpty) _emailController.text = email;
    }
    if (email.isEmpty) {
      if (mounted) {
        setState(() => _shippingError = 'Sign in again to complete checkout.');
      }
      return;
    }
    try {
      final updated =
          await ref.read(experienceApiProvider).updateCartCustomerDetails(
                cart.id,
                email: email,
                shippingAddress: address.toCheckoutAddress(),
              );
      await ref.read(cartProvider.notifier).replaceFromServer(updated);
    } catch (_) {
      // The submit path surfaces a concrete error rather than blocking address
      // selection on a transient prefill failure.
    }
  }

  Future<void> _loadShippingOptions() async {
    final cart = ref.read(cartProvider).value;
    final address = _resolveAddress(ref.read(addressesProvider));
    if (cart == null || address == null) {
      if (mounted) setState(() => _loadingShipping = false);
      return;
    }
    setState(() {
      _loadingShipping = true;
      _shippingError = null;
    });
    try {
      final options =
          await ref.read(experienceApiProvider).listShippingOptions(cart.id);
      if (!mounted) return;
      setState(() {
        _shippingOptions = options;
        _loadingShipping = false;
        final eligibleIds = options.map((option) => option.id).toSet();
        _selectedShippingBySeller = <String, ShippingOption>{
          for (final entry in _selectedShippingBySeller.entries)
            if (eligibleIds.contains(entry.value.id)) entry.key: entry.value,
        };
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingShipping = false;
        _shippingError = error.toString();
      });
    }
  }

  Future<void> _selectShipping(ShippingOption option) async {
    final cart = ref.read(cartProvider).value;
    if (cart == null) return;
    setState(() => _submitting = true);
    try {
      final updated = await ref
          .read(experienceApiProvider)
          .selectShippingMethod(cart.id, option.id);
      await ref.read(cartProvider.notifier).replaceFromServer(updated);
      if (!mounted) return;
      setState(() {
        _selectedShippingBySeller = <String, ShippingOption>{
          ..._selectedShippingBySeller,
          option.sellerId: option,
        };
      });
    } catch (error) {
      if (mounted) setState(() => _inlineError = 'Could not select delivery.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _pickAddress() async {
    final addresses = ref.read(addressesProvider);
    if (addresses.isEmpty) {
      await _addAddress();
      return;
    }
    final picked = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddressPickerSheet(selectedId: _selectedAddressId),
    );
    if (picked == null || !mounted) return;
    if (picked == _AddressPickerSheet.addNew) {
      await _addAddress();
      return;
    }
    final address = ref
        .read(addressesProvider)
        .where((item) => item.id == picked)
        .firstOrNull;
    if (address != null) await _applyAddress(address);
  }

  Future<void> _addAddress() async {
    final saved = await showAddressFormSheet(
      context,
      defaultChecked: ref.read(addressesProvider).isEmpty,
    );
    if (saved == null || !mounted) return;
    await ref.read(addressesProvider.notifier).add(saved);
    final resolved = ref
        .read(addressesProvider)
        .where((address) => address.id == saved.id)
        .firstOrNull;
    await _applyAddress(resolved ?? saved);
  }

  Future<void> _editAddress(SavedAddress address) async {
    final saved = await showAddressFormSheet(context, existing: address);
    if (saved == null || !mounted) return;
    await ref.read(addressesProvider.notifier).update(saved);
    final resolved = ref
        .read(addressesProvider)
        .where((item) => item.id == saved.id)
        .firstOrNull;
    if (resolved != null) {
      if (resolved.id == _selectedAddressId) {
        await _applyAddress(resolved);
      } else {
        setState(() {});
      }
    }
  }

  String? _validate() {
    final address = _resolveAddress(ref.read(addressesProvider));
    if (address == null) return 'Select a delivery address to continue.';
    if (_emailController.text.trim().isEmpty) {
      return 'Sign in again to place an order.';
    }
    if (_sellerIds.isEmpty ||
        _sellerIds.any(
            (sellerId) => !_selectedShippingBySeller.containsKey(sellerId))) {
      return 'Select a delivery method for every seller.';
    }
    return null;
  }

  Future<void> _placeOrder() async {
    if (_submitting || _orderPlaced) return;
    final error = _validate();
    if (error != null) {
      setState(() => _inlineError = error);
      return;
    }
    final address = _resolveAddress(ref.read(addressesProvider))!;
    final cart = ref.read(cartProvider).value;
    setState(() {
      _submitting = true;
      _inlineError = null;
    });
    try {
      if (cart == null) {
        throw StateError('Your cart is empty.');
      }
      final client = ref.read(experienceApiProvider);
      final updated = await client.updateCartCustomerDetails(
        cart.id,
        email: _emailController.text.trim(),
        shippingAddress: address.toCheckoutAddress(),
      );
      await ref.read(cartProvider.notifier).replaceFromServer(updated);

      final eligible = await client.listShippingOptions(cart.id);
      final eligibleIds = eligible.map((option) => option.id).toSet();
      if (_selectedShippingBySeller.values
          .any((option) => !eligibleIds.contains(option.id))) {
        throw StateError(
            'A selected delivery method is no longer available. Choose again.');
      }
      if (_selectedShippingBySeller.length != _sellerIds.length) {
        throw StateError('Select a delivery method for every seller.');
      }

      var prepared = updated;
      for (final sellerId in _sellerIds) {
        prepared = await client.selectShippingMethod(
          cart.id,
          _selectedShippingBySeller[sellerId]!.id,
        );
      }
      await ref.read(cartProvider.notifier).replaceFromServer(prepared);

      final result = await client.completeCart(cart.id);
      if (result['type'] != 'order_group' ||
          result['order_group'] is! Map<String, dynamic> ||
          result['payment']?['payment_mode'] != 'simulated' ||
          result['payment']?['test_data'] != true) {
        throw StateError(
            'The server did not return a canonical simulated order.');
      }
      _orderPlaced = true;
      if (!mounted) return;
      await ref.read(cartProvider.notifier).clearAfterOrder();
      if (!mounted) return;
      context.go('/order-confirmed');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _inlineError =
            'Checkout failed. ${error.toString().replaceFirst('Bad state: ', '')}';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider).value;
    final addresses = ref.watch(addressesProvider);
    final address = _resolveAddress(addresses);
    // Always render the watched cart so a promo applied inside checkout updates
    // the summary immediately; shipping selections also replace this cart.
    final effectiveCart = cart;
    final discount = effectiveCart?.discountTotal;
    final cartShipping = effectiveCart?.shippingTotal;
    final shipping = _selectedShippingTotal?.formatted ??
        ((cartShipping?.amount ?? 0) > 0
            ? cartShipping!.formatted
            : 'Calculated at checkout');

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          _addressCard(address),
          const SizedBox(height: AgencySpacing.md),
          _contactCard(address),
          const SizedBox(height: AgencySpacing.lg),
          Text('Delivery method', style: AgencyText.title),
          const SizedBox(height: AgencySpacing.sm),
          if (address == null)
            const Text('Select an address first.')
          else if (_loadingShipping)
            const LinearProgressIndicator()
          else if (_shippingError != null)
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    'Delivery options unavailable.',
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
                TextButton(
                  onPressed: _loadShippingOptions,
                  child: const Text('Retry'),
                ),
              ],
            )
          else if (_shippingOptions.isEmpty)
            const Text('No delivery method is available for this cart.')
          else
            for (var sellerIndex = 0;
                sellerIndex < _sellerIds.length;
                sellerIndex++) ...<Widget>[
              if (_sellerIds.length > 1)
                Text('Seller delivery ${sellerIndex + 1}',
                    style: AgencyText.label),
              RadioGroup<String>(
                groupValue:
                    _selectedShippingBySeller[_sellerIds[sellerIndex]]?.id,
                onChanged: (id) {
                  if (id == null) return;
                  final option =
                      _shippingOptions.firstWhere((item) => item.id == id);
                  _selectShipping(option);
                },
                child: Column(
                  children: <Widget>[
                    for (final option in _shippingOptions.where(
                      (item) => item.sellerId == _sellerIds[sellerIndex],
                    ))
                      RadioListTile<String>(
                        value: option.id,
                        title: Text(option.name),
                        subtitle: Text(option.price.formatted),
                      ),
                  ],
                ),
              ),
            ],
          const SizedBox(height: AgencySpacing.lg),
          Text('Payment method', style: AgencyText.title),
          const SizedBox(height: AgencySpacing.sm),
          const Card(
            child: ListTile(
              leading: Icon(Icons.verified_user_outlined),
              title: Text('Simulated prepaid payment'),
              subtitle: Text(
                'Bounded staging pilot only · no real charge or payment gateway',
              ),
            ),
          ),
          const SizedBox(height: AgencySpacing.md),
          if (effectiveCart != null) PromotionPanel(cart: effectiveCart),
          const SizedBox(height: AgencySpacing.md),
          _summary(effectiveCart, discount, shipping),
          if (_inlineError != null) ...<Widget>[
            const SizedBox(height: AgencySpacing.md),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AgencySpacing.sm),
              decoration: BoxDecoration(
                color:
                    Theme.of(context).extension<AgencyColors>()?.surfaceRaised,
                borderRadius: BorderRadius.circular(AgencyRadius.md),
                border: Border.all(color: Theme.of(context).colorScheme.error),
              ),
              child: Text(
                _inlineError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ],
          const SizedBox(height: AgencySpacing.md),
          FilledButton(
            onPressed: _submitting || _orderPlaced ? null : _placeOrder,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: _submitting
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(_orderPlaced ? 'Order placed' : 'Place order'),
          ),
          const SizedBox(height: AgencySpacing.sm),
          Text(
            'Simulated prepaid payment · staging only',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 11,
                color: Theme.of(context)
                        .extension<AgencyColors>()
                        ?.contentSecondary ??
                    Colors.grey),
          ),
          const SizedBox(height: AgencySpacing.lg),
        ],
      ),
    );
  }

  /// Read-only contact summary taken from the signed-in pilot and the chosen
  /// address. Checkout must not ask the buyer to retype identity details.
  Widget _contactCard(SavedAddress? address) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final profile = ref.watch(profileProvider);
    final api = ref.read(experienceApiProvider);
    final sessionName = api.sessionName?.trim();
    final sessionEmail = api.sessionEmail?.trim();
    final name = (sessionName != null && sessionName.isNotEmpty)
        ? sessionName
        : profile.name;
    final email = (sessionEmail != null && sessionEmail.isNotEmpty)
        ? sessionEmail
        : profile.email;
    final phone = (address?.phone.trim().isNotEmpty ?? false)
        ? address!.phone.trim()
        : profile.phone;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.person_outline, size: 18, color: colors.actionPrimary),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(name,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text('$email · $phone',
                    style: TextStyle(
                        fontSize: 12, color: colors.contentSecondary)),
                Text('Contact details from your account',
                    style: TextStyle(
                        fontSize: 10, color: colors.contentSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _addressCard(SavedAddress? address) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
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
              Icon(Icons.location_on_outlined,
                  size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.xs),
              Text('Delivery address',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary)),
              const Spacer(),
              TextButton(
                onPressed: _pickAddress,
                child: Text(address == null ? 'Add' : 'Change'),
              ),
            ],
          ),
          if (address == null)
            Text(
              _bootstrapped
                  ? 'No saved addresses yet — add one to check out faster.'
                  : 'Loading saved addresses…',
              style: TextStyle(fontSize: 13, color: colors.contentSecondary),
            )
          else ...<Widget>[
            Row(
              children: <Widget>[
                Text(address.label,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                if (address.isDefault) ...<Widget>[
                  const SizedBox(width: AgencySpacing.xs),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: colors.trust,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('DEFAULT',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: colors.contentInverse)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 2),
            Text(address.singleLine,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
            const SizedBox(height: 2),
            Text(address.phone,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => _editAddress(address),
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Edit address'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _summary(Cart? cart, Money? discount, String shipping) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        children: <Widget>[
          _summaryRow('Subtotal', cart?.subtotal?.formatted ?? '—'),
          if ((discount?.amount ?? 0) > 0)
            _summaryRow('Discount', '-${discount!.formatted}',
                color: colors.feedbackSuccess),
          _summaryRow('Shipping', shipping),
          const Divider(),
          _summaryRow('Total', cart?.total?.formatted ?? '—', bold: true),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value,
      {bool bold = false, Color? color}) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final style = TextStyle(
      fontSize: bold ? 16 : 13,
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
      color: color ?? (bold ? colors.contentPrimary : colors.contentSecondary),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Text(label, style: style),
          Text(value, style: style)
        ],
      ),
    );
  }
}

/// Saved-address picker used at checkout.
///
/// Selection is immediate; add, edit and set-default are available without
/// leaving checkout. The sheet watches the provider so edits appear at once.
class _AddressPickerSheet extends ConsumerWidget {
  const _AddressPickerSheet({this.selectedId});

  static const String addNew = '__add_new__';

  final String? selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.only(bottom: AgencySpacing.md),
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AgencySpacing.md, 0, AgencySpacing.md, AgencySpacing.sm),
            child: Text('Delivery address',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
          ),
          if (addresses.isEmpty)
            const Padding(
              padding: EdgeInsets.all(AgencySpacing.md),
              child: Text('No saved addresses yet.'),
            ),
          for (final address in addresses)
            ListTile(
              leading: Icon(
                address.id == selectedId
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 20,
                color: address.id == selectedId
                    ? colors.actionPrimary
                    : colors.contentSecondary,
              ),
              title: Row(
                children: <Widget>[
                  Text(address.label,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (address.isDefault) ...<Widget>[
                    const SizedBox(width: AgencySpacing.xs),
                    Text('Default',
                        style: TextStyle(fontSize: 10, color: colors.trust)),
                  ],
                ],
              ),
              subtitle: Text('${address.singleLine}\n${address.phone}'),
              isThreeLine: true,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  if (!address.isDefault)
                    IconButton(
                      tooltip: 'Set as default',
                      icon: const Icon(Icons.star_border, size: 20),
                      onPressed: () => ref
                          .read(addressesProvider.notifier)
                          .setDefault(address.id),
                    ),
                  IconButton(
                    tooltip: 'Edit address',
                    icon: const Icon(Icons.edit_outlined, size: 20),
                    onPressed: () async {
                      final saved = await showAddressFormSheet(context,
                          existing: address);
                      if (saved == null) return;
                      await ref.read(addressesProvider.notifier).update(saved);
                    },
                  ),
                ],
              ),
              onTap: () => Navigator.of(context).pop(address.id),
            ),
          ListTile(
            leading: Icon(Icons.add, color: colors.actionPrimary),
            title: Text('Add a new address',
                style: TextStyle(color: colors.actionPrimary)),
            onTap: () => Navigator.of(context).pop(addNew),
          ),
        ],
      ),
    );
  }
}
