import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/account_models.dart';

/// Shared add/edit address sheet used by Account and Checkout.
///
/// Returns the saved record; the caller persists it through
/// `addressesProvider` so both surfaces stay on one address book.
Future<SavedAddress?> showAddressFormSheet(
  BuildContext context, {
  SavedAddress? existing,
  bool defaultChecked = false,
}) {
  return showModalBottomSheet<SavedAddress>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _AddressFormSheet(
      existing: existing,
      defaultChecked: defaultChecked,
    ),
  );
}

class _AddressFormSheet extends StatefulWidget {
  const _AddressFormSheet({this.existing, this.defaultChecked = false});

  final SavedAddress? existing;
  final bool defaultChecked;

  @override
  State<_AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends State<_AddressFormSheet> {
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
    _default = e?.isDefault ?? widget.defaultChecked;
  }

  @override
  void dispose() {
    for (final controller in <TextEditingController>[
      _label,
      _name,
      _phone,
      _line1,
      _line2,
      _city,
      _state,
      _pin,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    final existing = widget.existing;
    Navigator.of(context).pop(SavedAddress(
      id: existing?.id ?? 'addr_${DateTime.now().microsecondsSinceEpoch}',
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
              _field(_state, 'State', required: true),
              _field(_pin, 'Pincode', required: true, pin: true),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _default,
                onChanged: (value) => setState(() => _default = value),
                title: const Text('Set as default address',
                    style: TextStyle(fontSize: 13)),
              ),
              const SizedBox(height: AgencySpacing.sm),
              SizedBox(
                width: double.infinity,
                child: PinWorkflowAction(
                  label: widget.existing == null
                      ? 'Save this address'
                      : 'Save address',
                  onPressed: _submit,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController controller, String label,
      {bool required = false, bool phone = false, bool pin = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: TextFormField(
        controller: controller,
        keyboardType: phone
            ? TextInputType.phone
            : (pin ? TextInputType.number : TextInputType.text),
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder()),
        validator: (value) {
          final text = value?.trim() ?? '';
          if (required && text.isEmpty) return 'Required';
          if (phone && text.replaceAll(RegExp(r'\D'), '').length != 10) {
            return 'Enter a valid 10-digit phone';
          }
          if (pin && text.replaceAll(RegExp(r'\D'), '').length != 6) {
            return 'Enter a valid 6-digit pincode';
          }
          return null;
        },
      ),
    );
  }
}
