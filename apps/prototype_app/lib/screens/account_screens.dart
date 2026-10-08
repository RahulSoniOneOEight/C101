import 'dart:io';

import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/account_models.dart';
import '../providers/account_providers.dart';
import '../providers/pilot_providers.dart';
import '../widgets/status_views.dart';

AgencyColors _colors(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _email;
  late final TextEditingController _phone;

  @override
  void initState() {
    super.initState();
    final p = ref.read(profileProvider);
    _name = TextEditingController(text: p.name);
    _email = TextEditingController(text: p.email);
    _phone = TextEditingController(text: p.phone);
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    await ref.read(profileProvider.notifier).save(AccountProfile(
          name: _name.text.trim(),
          email: _email.text.trim(),
          phone: _phone.text.trim(),
        ));
    if (mounted) {
      PinToast.show(context, 'Profile updated', tone: PinToastTone.success);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AgencySpacing.md),
          children: <Widget>[
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                  labelText: 'Full name', border: OutlineInputBorder()),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
            ),
            const SizedBox(height: AgencySpacing.md),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                  labelText: 'Email', border: OutlineInputBorder()),
              validator: (v) {
                final value = v?.trim() ?? '';
                if (value.isEmpty) return 'Enter your email';
                if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value)) {
                  return 'Enter a valid email';
                }
                return null;
              },
            ),
            const SizedBox(height: AgencySpacing.md),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                  labelText: 'Mobile', border: OutlineInputBorder()),
              validator: (v) {
                final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                if (digits.length < 10) return 'Enter a valid 10-digit mobile';
                return null;
              },
            ),
            const SizedBox(height: AgencySpacing.lg),
            SizedBox(
              width: double.infinity,
              child: PinWorkflowAction(
                label: 'Save changes',
                onPressed: _save,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Saved addresses
// ---------------------------------------------------------------------------

class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _colors(context);
    final addresses = ref.watch(addressesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Saved Addresses')),
      body: addresses.isEmpty
          ? const EmptyView(message: 'No saved addresses yet')
          : ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                for (final a in addresses)
                  Container(
                    margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
                    padding: const EdgeInsets.all(AgencySpacing.md),
                    decoration: BoxDecoration(
                      color: colors.surfaceRaised,
                      borderRadius: BorderRadius.circular(AgencyRadius.lg),
                      border: Border.all(
                          color: a.isDefault
                              ? colors.actionPrimary
                              : colors.borderDefault),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Text(a.label,
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: colors.contentPrimary)),
                            const SizedBox(width: AgencySpacing.xs),
                            if (a.isDefault) _pill(context, 'Default'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('${a.fullName} · ${a.phone}',
                            style: TextStyle(
                                fontSize: 12, color: colors.contentSecondary)),
                        Text(a.singleLine,
                            style: TextStyle(
                                fontSize: 12, color: colors.contentSecondary)),
                        const SizedBox(height: AgencySpacing.sm),
                        Row(
                          children: <Widget>[
                            if (!a.isDefault)
                              TextButton(
                                onPressed: () => ref
                                    .read(addressesProvider.notifier)
                                    .setDefault(a.id),
                                child: const Text('Set default'),
                              ),
                            TextButton(
                              onPressed: () => _edit(context, ref, a),
                              child: const Text('Edit'),
                            ),
                            TextButton(
                              onPressed: () => _delete(context, ref, a),
                              child: Text('Delete',
                                  style:
                                      TextStyle(color: colors.feedbackError)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: AgencySpacing.sm),
                PinWorkflowAction(
                  label: 'Add address',
                  icon: Icons.add,
                  hierarchy: PinWorkflowHierarchy.secondary,
                  onPressed: () => _edit(context, ref, null),
                ),
              ],
            ),
    );
  }

  Widget _pill(BuildContext context, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: _colors(context).surfaceInteractive,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text,
            style:
                TextStyle(fontSize: 10, color: _colors(context).actionPrimary)),
      );

  Future<void> _delete(
      BuildContext context, WidgetRef ref, SavedAddress a) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Delete this address?',
      message: '"${a.label}" will be removed from your saved addresses.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!(ok ?? false) || !context.mounted) return;
    await ref.read(addressesProvider.notifier).remove(a.id);
    if (context.mounted) {
      PinToast.show(context, 'Address deleted', tone: PinToastTone.info);
    }
  }

  Future<void> _edit(
      BuildContext context, WidgetRef ref, SavedAddress? existing) async {
    final result = await showModalBottomSheet<SavedAddress>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddressForm(existing: existing),
    );
    if (result == null || !context.mounted) return;
    final notifier = ref.read(addressesProvider.notifier);
    if (existing == null) {
      await notifier.add(result);
    } else {
      await notifier.update(result);
    }
    if (context.mounted) {
      PinToast.show(
          context, existing == null ? 'Address added' : 'Address updated',
          tone: PinToastTone.success);
    }
  }
}

class _AddressForm extends StatefulWidget {
  const _AddressForm({this.existing});

  final SavedAddress? existing;

  @override
  State<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<_AddressForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _label;
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _line1;
  late final TextEditingController _line2;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _pin;
  late bool _default;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _label = TextEditingController(text: e?.label ?? 'Home');
    _name = TextEditingController(text: e?.fullName ?? '');
    _phone = TextEditingController(text: e?.phone ?? '');
    _line1 = TextEditingController(text: e?.line1 ?? '');
    _line2 = TextEditingController(text: e?.line2 ?? '');
    _city = TextEditingController(text: e?.city ?? '');
    _state = TextEditingController(text: e?.state ?? '');
    _pin = TextEditingController(text: e?.pincode ?? '');
    _default = e?.isDefault ?? false;
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _label,
      _name,
      _phone,
      _line1,
      _line2,
      _city,
      _state,
      _pin,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    final e = widget.existing;
    Navigator.of(context).pop(SavedAddress(
      id: e?.id ?? 'addr_${DateTime.now().microsecondsSinceEpoch}',
      label: _label.text.trim(),
      fullName: _name.text.trim(),
      phone: _phone.text.trim(),
      line1: _line1.text.trim(),
      line2: _line2.text.trim().isEmpty ? null : _line2.text.trim(),
      city: _city.text.trim(),
      state: _state.text.trim().isEmpty ? null : _state.text.trim(),
      pincode: _pin.text.trim(),
      isDefault: _default,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AgencySpacing.md,
        right: AgencySpacing.md,
        bottom: MediaQuery.of(context).viewInsets.bottom + AgencySpacing.md,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(widget.existing == null ? 'Add address' : 'Edit address',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AgencySpacing.sm),
              _field(_label, 'Label (Home / Office / Site)', required: true),
              _field(_name, 'Full name', required: true),
              _field(_phone, 'Phone', required: true, phone: true),
              _field(_line1, 'Address line 1', required: true),
              _field(_line2, 'Address line 2'),
              _field(_city, 'City', required: true),
              _field(_state, 'State'),
              _field(_pin, 'Pincode', required: true, pin: true),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _default,
                onChanged: (v) => setState(() => _default = v),
                title: const Text('Set as default address',
                    style: TextStyle(fontSize: 13)),
              ),
              const SizedBox(height: AgencySpacing.sm),
              SizedBox(
                width: double.infinity,
                child: PinWorkflowAction(
                  label:
                      widget.existing == null ? 'Add address' : 'Save address',
                  onPressed: _submit,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label,
      {bool required = false, bool phone = false, bool pin = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: TextFormField(
        controller: c,
        keyboardType: phone
            ? TextInputType.phone
            : (pin ? TextInputType.number : TextInputType.text),
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder()),
        validator: (v) {
          final value = v?.trim() ?? '';
          if (required && value.isEmpty) return 'Required';
          if (phone && value.replaceAll(RegExp(r'\D'), '').length < 10) {
            return 'Enter a valid 10-digit phone';
          }
          if (pin && value.replaceAll(RegExp(r'\D'), '').length != 6) {
            return 'Enter a valid 6-digit pincode';
          }
          return null;
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

class PaymentsScreen extends ConsumerWidget {
  const PaymentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _colors(context);
    final methods = ref.watch(paymentMethodsProvider);
    final supported = methods.where((m) => !m.removable).toList();
    final saved = methods.where((m) => m.removable).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Payment Methods')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('Saved methods',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          if (saved.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Text('No saved cards yet.',
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
            )
          else
            for (final m in saved) _savedTile(context, ref, m),
          const SizedBox(height: AgencySpacing.sm),
          PinWorkflowAction(
            label: 'Add card',
            icon: Icons.add,
            hierarchy: PinWorkflowHierarchy.secondary,
            onPressed: () => _addCard(context, ref),
          ),
          const SizedBox(height: AgencySpacing.lg),
          Text('Supported methods',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          for (final m in supported) _supportedTile(context, m),
          const SizedBox(height: AgencySpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(Icons.lock_outline, size: 14, color: colors.trust),
              const SizedBox(width: AgencySpacing.xs),
              Expanded(
                child: Text(
                    'Payments are processed by the payment provider. Card '
                    'details are tokenised and never stored in the app.',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _savedTile(BuildContext context, WidgetRef ref, PaymentMethod m) {
    final colors = _colors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(
            color: m.isDefault ? colors.actionPrimary : colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Icon(_kindIcon(m.kind), color: colors.actionPrimary),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Text(m.label,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: colors.contentPrimary)),
                    if (m.isDefault) ...<Widget>[
                      const SizedBox(width: AgencySpacing.xs),
                      Text('· Default',
                          style: TextStyle(
                              fontSize: 11, color: colors.actionPrimary)),
                    ],
                  ],
                ),
                Text(m.detail,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'default') {
                ref.read(paymentMethodsProvider.notifier).setDefault(m.id);
              } else if (v == 'remove') {
                _remove(context, ref, m);
              }
            },
            itemBuilder: (_) => <PopupMenuEntry<String>>[
              if (!m.isDefault)
                const PopupMenuItem(
                    value: 'default', child: Text('Set default')),
              const PopupMenuItem(value: 'remove', child: Text('Remove')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _supportedTile(BuildContext context, PaymentMethod m) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Icon(_kindIcon(m.kind), size: 20, color: colors.contentSecondary),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(m.label,
                    style:
                        TextStyle(fontSize: 13, color: colors.contentPrimary)),
                Text(m.detail,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _kindIcon(PaymentMethodKind k) => switch (k) {
        PaymentMethodKind.upi => Icons.qr_code_2,
        PaymentMethodKind.card => Icons.credit_card,
        PaymentMethodKind.netbanking => Icons.account_balance,
        PaymentMethodKind.wallet => Icons.account_balance_wallet_outlined,
        PaymentMethodKind.cod => Icons.payments_outlined,
      };

  Future<void> _remove(
      BuildContext context, WidgetRef ref, PaymentMethod m) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Remove card?',
      message: '${m.label} will be removed from your saved methods.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!(ok ?? false) || !context.mounted) return;
    await ref.read(paymentMethodsProvider.notifier).remove(m.id);
    if (context.mounted) {
      PinToast.show(context, 'Card removed', tone: PinToastTone.info);
    }
  }

  Future<void> _addCard(BuildContext context, WidgetRef ref) async {
    final result = await showModalBottomSheet<PaymentMethod>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _AddCardForm(),
    );
    if (result == null || !context.mounted) return;
    await ref.read(paymentMethodsProvider.notifier).addSaved(result);
    if (context.mounted) {
      PinToast.show(context, 'Card saved (tokenised by provider)',
          tone: PinToastTone.success);
    }
  }
}

class _AddCardForm extends StatefulWidget {
  const _AddCardForm();

  @override
  State<_AddCardForm> createState() => _AddCardFormState();
}

class _AddCardFormState extends State<_AddCardForm> {
  final _form = GlobalKey<FormState>();
  final _number = TextEditingController();
  final _name = TextEditingController();
  final _expiry = TextEditingController();
  bool _default = false;

  @override
  void dispose() {
    _number.dispose();
    _name.dispose();
    _expiry.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    final digits = _number.text.replaceAll(RegExp(r'\D'), '');
    final last4 = digits.substring(digits.length - 4);
    Navigator.of(context).pop(PaymentMethod(
      id: 'pm_card_${DateTime.now().microsecondsSinceEpoch}',
      kind: PaymentMethodKind.card,
      label: '$last4 •••• $last4',
      detail: 'Expires ${_expiry.text.trim()}',
      isDefault: _default,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AgencySpacing.md,
        right: AgencySpacing.md,
        bottom: MediaQuery.of(context).viewInsets.bottom + AgencySpacing.md,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text('Add card',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AgencySpacing.sm),
              TextFormField(
                controller: _number,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Card number', border: OutlineInputBorder()),
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  if (digits.length < 12 || digits.length > 19) {
                    return 'Enter a valid card number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: AgencySpacing.sm),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                    labelText: 'Name on card', border: OutlineInputBorder()),
                validator: (v) =>
                    (v == null || v.trim().length < 3) ? 'Required' : null,
              ),
              const SizedBox(height: AgencySpacing.sm),
              TextFormField(
                controller: _expiry,
                decoration: const InputDecoration(
                    labelText: 'Expiry (MM/YY)', border: OutlineInputBorder()),
                validator: (v) =>
                    RegExp(r'^\d{2}/\d{2}$').hasMatch(v?.trim() ?? '')
                        ? null
                        : 'Use MM/YY',
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _default,
                onChanged: (v) => setState(() => _default = v),
                title: const Text('Set as default',
                    style: TextStyle(fontSize: 13)),
              ),
              SizedBox(
                width: double.infinity,
                child: PinWorkflowAction(
                  label: 'Save card',
                  onPressed: _submit,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// GST & Invoices
// ---------------------------------------------------------------------------

class GstInvoicesScreen extends ConsumerStatefulWidget {
  const GstInvoicesScreen({super.key});

  @override
  ConsumerState<GstInvoicesScreen> createState() => _GstInvoicesScreenState();
}

class _GstInvoicesScreenState extends ConsumerState<GstInvoicesScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _gstin;
  late final TextEditingController _legalName;
  late final TextEditingController _address;
  late final TextEditingController _state;

  @override
  void initState() {
    super.initState();
    final g = ref.read(gstProvider);
    _gstin = TextEditingController(text: g.gstin);
    _legalName = TextEditingController(text: g.legalName);
    _address = TextEditingController(text: g.registeredAddress);
    _state = TextEditingController(text: g.state);
  }

  @override
  void dispose() {
    _gstin.dispose();
    _legalName.dispose();
    _address.dispose();
    _state.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    await ref.read(gstProvider.notifier).save(GstDetails(
          gstin: _gstin.text.trim().toUpperCase(),
          legalName: _legalName.text.trim(),
          registeredAddress: _address.text.trim(),
          state: _state.text.trim(),
        ));
    if (mounted) {
      PinToast.show(context, 'GST details saved', tone: PinToastTone.success);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final invoices = ref.watch(invoicesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('GST & Invoices')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('GST details',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          Form(
            key: _form,
            child: Column(
              children: <Widget>[
                TextFormField(
                  controller: _gstin,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                      labelText: 'GSTIN', border: OutlineInputBorder()),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.isEmpty) return 'Enter your GSTIN';
                    if (!RegExp(r'^[0-9]{2}[A-Z0-9]{13}$').hasMatch(value)) {
                      return 'GSTIN must be 15 characters (e.g. 08AAICS1234F1Z5)';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AgencySpacing.sm),
                TextFormField(
                  controller: _legalName,
                  decoration: const InputDecoration(
                      labelText: 'Registered business name',
                      border: OutlineInputBorder()),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: AgencySpacing.sm),
                TextFormField(
                  controller: _address,
                  decoration: const InputDecoration(
                      labelText: 'Registered address',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: AgencySpacing.sm),
                TextFormField(
                  controller: _state,
                  decoration: const InputDecoration(
                      labelText: 'State', border: OutlineInputBorder()),
                ),
                const SizedBox(height: AgencySpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: PinWorkflowAction(
                    label: 'Save GST details',
                    onPressed: _save,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AgencySpacing.lg),
          Text('Invoices',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          if (invoices.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Text('No invoices yet.',
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
            )
          else
            for (final inv in invoices) _invoiceTile(context, inv),
        ],
      ),
    );
  }

  Widget _invoiceTile(BuildContext context, Invoice inv) {
    final colors = _colors(context);
    final (tone, label) = switch (inv.status) {
      InvoiceStatus.paid => (colors.feedbackSuccess, 'Paid'),
      InvoiceStatus.pending => (colors.feedbackWarning, 'Pending'),
      InvoiceStatus.refunded => (colors.feedbackInfo, 'Refunded'),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(inv.number,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text('${inv.orderRef} · ${inv.dateLabel}',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
                const SizedBox(height: 4),
                Row(
                  children: <Widget>[
                    Text(inv.amount.formatted,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                    const SizedBox(width: AgencySpacing.sm),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: tone.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(label,
                          style: TextStyle(fontSize: 10, color: tone)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Download invoice',
            onPressed: () => _download(context, inv),
            icon: Icon(Icons.download_outlined, color: colors.actionPrimary),
          ),
        ],
      ),
    );
  }

  /// DEV-ONLY download: there is no invoices endpoint yet, so this writes a
  /// locally generated PDF of the invoice summary to the device temp dir and
  /// reports the path. Replace with the signed `download_url` when the
  /// `GET /store/customers/me/invoices` contract lands.
  Future<void> _download(BuildContext context, Invoice inv) async {
    final gst = ref.read(gstProvider);
    try {
      final file =
          File('${Directory.systemTemp.path}/buildkart_${inv.number}.pdf');
      await file.writeAsString(_buildInvoicePdf(inv, gst));
      if (context.mounted) {
        PinToast.show(context, 'Invoice saved to ${file.path}',
            tone: PinToastTone.success);
      }
    } catch (e) {
      if (context.mounted) {
        PinToast.show(context, 'Download failed: $e',
            tone: PinToastTone.warning);
      }
    }
  }

  String _buildInvoicePdf(Invoice inv, GstDetails gst) {
    String esc(String s) =>
        s.replaceAll('\\', r'\\').replaceAll('(', r'\(').replaceAll(')', r'\)');
    final lines = <String>[
      'BuildKart Tax Invoice',
      'Invoice: ${inv.number}',
      'Order: ${inv.orderRef}',
      'Date: ${inv.dateLabel}',
      'Amount: ${inv.amount.formatted}',
      'Status: ${inv.status.name}',
      if (gst.gstin.isNotEmpty) 'Buyer GSTIN: ${gst.gstin}',
      if (gst.legalName.isNotEmpty) 'Buyer: ${gst.legalName}',
    ];
    final content = StringBuffer('BT /F1 12 Tf 72 780 Td 18 TL\n');
    for (final l in lines) {
      content.write('(${esc(l)}) Tj T*\n');
    }
    content.write('ET');
    final stream = content.toString();
    final objects = <String>[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R '
          '/Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ${stream.length} >>\nstream\n$stream\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    final buf = StringBuffer('%PDF-1.4\n');
    final offsets = <int>[];
    for (var i = 0; i < objects.length; i++) {
      offsets.add(buf.length);
      buf.write('${i + 1} 0 obj\n${objects[i]}\nendobj\n');
    }
    final xref = buf.length;
    buf.write('xref\n0 ${objects.length + 1}\n');
    buf.write('0000000000 65535 f \n');
    for (final o in offsets) {
      buf.write('${o.toString().padLeft(10, '0')} 00000 n \n');
    }
    buf.write('trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n');
    buf.write('startxref\n$xref\n%%EOF');
    return buf.toString();
  }
}

// ---------------------------------------------------------------------------
// Help & Support
// ---------------------------------------------------------------------------

class HelpSupportScreen extends ConsumerWidget {
  const HelpSupportScreen({super.key});

  static const List<(String, String)> _faqs = <(String, String)>[
    (
      'How do I track my order?',
      'Open My Orders, choose an order and tap Track to see live status.'
    ),
    (
      'What is the return window?',
      'Most items can be returned within 7 days of delivery. Eligibility is '
          'shown on the order detail page.'
    ),
    (
      'Do you provide GST invoices?',
      'Yes. Add your GSTIN under GST & Invoices and every invoice will carry it.'
    ),
    (
      'How do I change my delivery address?',
      'Manage addresses under Saved Addresses; the default one is used at checkout.'
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _colors(context);
    final tickets = ref.watch(ticketsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Help & Support')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('FAQs',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          for (final f in _faqs)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: AgencySpacing.sm),
              title: Text(f.$1,
                  style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
              children: <Widget>[
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(f.$2,
                      style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: colors.contentSecondary)),
                ),
              ],
            ),
          const Divider(),
          Text('Contact support',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.mail_outline, color: colors.actionPrimary),
            title: const Text('support@buildkart.example',
                style: TextStyle(fontSize: 13)),
            onTap: () => PinToast.show(context, 'Email client not available',
                tone: PinToastTone.info),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.call_outlined, color: colors.actionPrimary),
            title: const Text('1800 000 000 (9am–7pm)',
                style: TextStyle(fontSize: 13)),
            onTap: () => PinToast.show(context, 'Dialer not available',
                tone: PinToastTone.info),
          ),
          const SizedBox(height: AgencySpacing.sm),
          PinWorkflowAction(
            label: 'Raise a ticket',
            icon: Icons.add_comment_outlined,
            onPressed: () => _raiseTicket(context, ref),
          ),
          const SizedBox(height: AgencySpacing.lg),
          Text('Your tickets',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.xs),
          if (tickets.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Text('No tickets raised yet.',
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
            )
          else
            for (final t in tickets) _ticketTile(context, t),
        ],
      ),
    );
  }

  Widget _ticketTile(BuildContext context, SupportTicket t) {
    final colors = _colors(context);
    final (tone, _) = _statusTone(t.status, colors);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
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
              Expanded(
                child: Text(t.subject,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(t.status.label,
                    style: TextStyle(fontSize: 10, color: tone)),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text('${t.category} · ${t.createdLabel} · ${t.id}',
              style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
          const SizedBox(height: 4),
          Text(t.message,
              style: TextStyle(
                  fontSize: 12, height: 1.35, color: colors.contentSecondary)),
        ],
      ),
    );
  }

  (Color, String) _statusTone(TicketStatus s, AgencyColors colors) =>
      switch (s) {
        TicketStatus.open => (colors.feedbackWarning, s.label),
        TicketStatus.inProgress => (colors.feedbackInfo, s.label),
        TicketStatus.resolved => (colors.feedbackSuccess, s.label),
        TicketStatus.closed => (colors.contentSecondary, s.label),
      };

  Future<void> _raiseTicket(BuildContext context, WidgetRef ref) async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _TicketForm(),
    );
    if (result == null || !context.mounted) return;
    await ref.read(ticketsProvider.notifier).add(
          subject: result['subject']!,
          category: result['category']!,
          message: result['message']!,
        );
    if (context.mounted) {
      PinToast.show(context, 'Ticket raised', tone: PinToastTone.success);
    }
  }
}

class _TicketForm extends StatefulWidget {
  const _TicketForm();

  @override
  State<_TicketForm> createState() => _TicketFormState();
}

class _TicketFormState extends State<_TicketForm> {
  static const List<String> _categories = <String>[
    'Order',
    'Delivery',
    'Payment',
    'Returns',
    'Invoice / GST',
    'Other',
  ];

  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String _category = 'Order';

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(<String, String>{
      'subject': _subject.text.trim(),
      'category': _category,
      'message': _message.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AgencySpacing.md,
        right: AgencySpacing.md,
        bottom: MediaQuery.of(context).viewInsets.bottom + AgencySpacing.md,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text('Raise a ticket',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AgencySpacing.sm),
              DropdownButtonFormField<String>(
                initialValue: _category,
                decoration: const InputDecoration(
                    labelText: 'Category', border: OutlineInputBorder()),
                items: <DropdownMenuItem<String>>[
                  for (final c in _categories)
                    DropdownMenuItem<String>(value: c, child: Text(c)),
                ],
                onChanged: (v) => setState(() => _category = v ?? 'Order'),
              ),
              const SizedBox(height: AgencySpacing.sm),
              TextFormField(
                controller: _subject,
                decoration: const InputDecoration(
                    labelText: 'Subject', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().length < 4)
                    ? 'Enter a short subject'
                    : null,
              ),
              const SizedBox(height: AgencySpacing.sm),
              TextFormField(
                controller: _message,
                maxLines: 4,
                decoration: const InputDecoration(
                    labelText: 'Describe the issue',
                    alignLabelWithHint: true,
                    border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().length < 10)
                    ? 'Please add at least 10 characters'
                    : null,
              ),
              const SizedBox(height: AgencySpacing.md),
              SizedBox(
                width: double.infinity,
                child: PinWorkflowAction(
                  label: 'Submit ticket',
                  onPressed: _submit,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _colors(context);
    final settings = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('Language',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          for (final lang in AppLanguage.values)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(lang.label, style: const TextStyle(fontSize: 13)),
              trailing: Icon(
                settings.language == lang
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 20,
                color: settings.language == lang
                    ? colors.actionPrimary
                    : colors.contentSecondary,
              ),
              onTap: () => ref
                  .read(settingsProvider.notifier)
                  .update(settings.copyWith(language: lang)),
            ),
          const Divider(),
          Text('Notifications',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: settings.notificationsEnabled,
            onChanged: (v) => ref
                .read(settingsProvider.notifier)
                .update(settings.copyWith(notificationsEnabled: v)),
            title: const Text('Order & account updates',
                style: TextStyle(fontSize: 13)),
            subtitle: const Text('Delivery, payments and account alerts',
                style: TextStyle(fontSize: 11)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: settings.promotionalOptIn,
            onChanged: (v) => ref
                .read(settingsProvider.notifier)
                .update(settings.copyWith(promotionalOptIn: v)),
            title: const Text('Deals & promotions',
                style: TextStyle(fontSize: 13)),
            subtitle: const Text('Offers from BuildKart and sellers',
                style: TextStyle(fontSize: 11)),
          ),
          const Divider(),
          Text('Privacy',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading:
                Icon(Icons.privacy_tip_outlined, color: colors.actionPrimary),
            title: const Text('Privacy policy', style: TextStyle(fontSize: 13)),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => _privacy(context),
          ),
          const SizedBox(height: AgencySpacing.md),
          PinWorkflowAction(
            label: 'Log out',
            hierarchy: PinWorkflowHierarchy.destructive,
            onPressed: () => _logout(context, ref),
          ),
        ],
      ),
    );
  }

  void _privacy(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const Padding(
        padding: EdgeInsets.all(AgencySpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Privacy policy',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            SizedBox(height: AgencySpacing.sm),
            Text(
              'BuildKart processes your name, contact details and delivery '
              'address to fulfil orders and issue GST invoices. Payment card '
              'details are tokenised by the payment provider and never stored '
              'in the app. You can request data export or deletion from '
              'Help & Support.',
              style: TextStyle(fontSize: 13, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Log out?',
      message: 'You will be signed out on this device.',
      confirmLabel: 'Log out',
      destructive: true,
    );
    if (!(ok ?? false) || !context.mounted) return;
    try {
      await ref.read(pilotOtpProvider.notifier).logout();
    } catch (_) {
      // Local session and device state are still cleared by the notifier.
    }
    if (context.mounted) context.go('/login');
  }
}
