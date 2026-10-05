import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/experience_api.dart';
import '../domain/models.dart';
import '../providers/cart_providers.dart';

/// Checkout form: contact + shipping address + payment method.
///
/// Success is shown only after the Experience API returns a canonical order group.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String _email = '';
  String _firstName = '';
  String _lastName = '';
  String _address1 = '';
  String _city = '';
  String _postalCode = '';
  bool _submitting = false;
  bool _loadingShipping = true;
  String? _shippingError;
  List<ShippingOption> _shippingOptions = const [];
  Map<String, ShippingOption> _selectedShippingBySeller = const {};
  Cart? _preparedCart;

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadShippingOptions());
  }

  Future<void> _loadShippingOptions() async {
    final cart = ref.read(cartProvider).value;
    if (cart == null) {
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
        _selectedShippingBySeller = {
          for (final entry in _selectedShippingBySeller.entries)
            if (eligibleIds.contains(entry.value.id)) entry.key: entry.value,
        };
        if (_selectedShippingBySeller.length != _sellerIds.length) {
          _preparedCart = null;
        }
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
        _selectedShippingBySeller = {
          ..._selectedShippingBySeller,
          option.sellerId: option,
        };
        _preparedCart = updated;
      });
    } catch (error) {
      if (mounted) _show('Could not select delivery: $error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _placeOrder() async {
    final cart = ref.read(cartProvider).value;
    if (cart == null) {
      _show('Your cart is empty');
      return;
    }
    if (_email.trim().isEmpty ||
        _firstName.trim().isEmpty ||
        _lastName.trim().isEmpty ||
        _address1.trim().isEmpty ||
        _city.trim().isEmpty ||
        !RegExp(r'^\d{6}$').hasMatch(_postalCode.trim())) {
      _show('Enter complete contact details and a six-digit postal code');
      return;
    }
    if (_sellerIds.isEmpty ||
        _sellerIds.any(
            (sellerId) => !_selectedShippingBySeller.containsKey(sellerId))) {
      _show('Select a delivery method for every seller');
      return;
    }
    setState(() => _submitting = true);
    try {
      final client = ref.read(experienceApiProvider);
      final address = Address(
        firstName: _firstName.trim(),
        lastName: _lastName.trim(),
        address1: _address1.trim(),
        city: _city.trim(),
        postalCode: _postalCode.trim(),
        countryCode: 'IN',
      );
      await client.updateCartCustomerDetails(
        cart.id,
        email: _email.trim(),
        shippingAddress: address,
      );
      final eligible = await client.listShippingOptions(cart.id);
      final eligibleIds = eligible.map((option) => option.id).toSet();
      if (_selectedShippingBySeller.values
          .any((option) => !eligibleIds.contains(option.id))) {
        throw StateError('A selected delivery method is no longer available.');
      }
      var prepared = cart;
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
      final orderGroup = result['order_group'] as Map<String, dynamic>;
      final orderGroupId = orderGroup['id'] as String?;

      if (!mounted) return;
      await ref.read(cartProvider.notifier).clearAfterOrder();
      if (!mounted) return;
      _show('Order placed · ${orderGroupId ?? 'confirmed'}');
      context.go('/order-confirmed');
    } catch (error) {
      if (!mounted) return;
      _show('Checkout failed: $error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _show(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          CheckoutSummary(
            subtotal: _preparedCart?.subtotal?.formatted ??
                cart?.subtotal?.formatted ??
                cart?.total?.formatted ??
                '—',
            shipping: _preparedCart?.shippingTotal?.formatted ??
                _selectedShippingTotal?.formatted ??
                'Select delivery',
            total: _preparedCart?.total?.formatted ??
                cart?.total?.formatted ??
                '—',
          ),
          const SizedBox(height: AgencySpacing.md),
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
          FormSection(
              label: 'Email', value: _email, onChanged: (v) => _email = v),
          FormSection(
              label: 'First name',
              value: _firstName,
              onChanged: (v) => _firstName = v),
          FormSection(
              label: 'Last name',
              value: _lastName,
              onChanged: (v) => _lastName = v),
          FormSection(
              label: 'Address',
              value: _address1,
              onChanged: (v) => _address1 = v),
          FormSection(label: 'City', value: _city, onChanged: (v) => _city = v),
          FormSection(
              label: 'Postal code',
              value: _postalCode,
              onChanged: (v) => _postalCode = v),
          const SizedBox(height: AgencySpacing.md),
          Row(
            children: [
              Expanded(child: Text('Delivery method', style: AgencyText.title)),
              TextButton(
                onPressed: _loadingShipping ? null : _loadShippingOptions,
                child: const Text('Refresh'),
              ),
            ],
          ),
          if (_loadingShipping)
            const Center(child: CircularProgressIndicator())
          else if (_shippingError != null)
            Text(
              'Delivery options unavailable. Use Refresh to retry.',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            )
          else if (_shippingOptions.isEmpty)
            const Text('No delivery method is available for this cart.')
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var sellerIndex = 0;
                    sellerIndex < _sellerIds.length;
                    sellerIndex++) ...[
                  if (_sellerIds.length > 1)
                    Text(
                      'Seller delivery ${sellerIndex + 1}',
                      style: AgencyText.label,
                    ),
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
                      children: [
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
              ],
            ),
          const SizedBox(height: AgencySpacing.lg),
          FilledButton(
            onPressed: _submitting ? null : _placeOrder,
            child: _submitting
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Place order'),
          ),
        ],
      ),
    );
  }
}
