import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/medusa_api.dart';
import '../data/payment_gateway.dart';
import '../domain/models.dart';
import '../domain/payment_models.dart';
import '../providers/cart_providers.dart';

/// Checkout form: contact + shipping address + payment method.
///
/// Payment goes through the governed [PaymentGateway]. In staging this is the
/// mock gateway; the live Razorpay/Cashfree gateways are swapped in once a
/// payment backend exists.
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
  PaymentProvider _paymentMethod = PaymentProvider.razorpay;
  bool _submitting = false;

  Future<void> _placeOrder() async {
    final cart = ref.read(cartProvider).value;
    if (cart == null) {
      _show('Your cart is empty');
      return;
    }
    setState(() => _submitting = true);
    try {
      final client = ref.read(medusaClientProvider);
      await client.setEmail(cart.id, _email.trim());
      await client.setShippingAddress(
        cart.id,
        Address(
          firstName: _firstName.trim(),
          lastName: _lastName.trim(),
          address1: _address1.trim(),
          city: _city.trim(),
          postalCode: _postalCode.trim(),
          countryCode: 'IN',
        ),
      );

      PaymentResult? payment;
      if (_paymentMethod != PaymentProvider.cod) {
        payment = await ref.read(paymentGatewayProvider).createAndCapture(
              amount: cart.total ?? const Money(amount: 0, currencyCode: 'INR'),
              orderRef: cart.id,
            );
      }

      if (!mounted) return;
      await ref.read(cartProvider.notifier).clear();
      if (!mounted) return;
      final note = payment != null ? ' · ${payment.id}' : ' · pay on delivery';
      _show('Order placed$note');
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

  String _paymentLabel(PaymentProvider provider) => switch (provider) {
        PaymentProvider.razorpay => 'Card — Razorpay (mock in staging)',
        PaymentProvider.cashfree => 'Cashfree (mock in staging)',
        PaymentProvider.cod => 'Pay on delivery',
        PaymentProvider.mock => 'Mock payment',
      };

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider).value;
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          CheckoutSummary(
            subtotal: cart?.total?.formatted ?? '—',
            shipping: 'Free',
            total: cart?.total?.formatted ?? '—',
          ),
          const SizedBox(height: AgencySpacing.md),
          Text('Payment method', style: AgencyText.title),
          const SizedBox(height: AgencySpacing.sm),
          RadioGroup<PaymentProvider>(
            groupValue: _paymentMethod,
            onChanged: (v) =>
                setState(() => _paymentMethod = v ?? _paymentMethod),
            child: Column(
              children: [
                for (final provider in const <PaymentProvider>[
                  PaymentProvider.razorpay,
                  PaymentProvider.cashfree,
                  PaymentProvider.cod,
                ])
                  RadioListTile<PaymentProvider>(
                    value: provider,
                    title: Text(_paymentLabel(provider)),
                  ),
              ],
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
