import 'models.dart';

/// Account-domain models for the B2C (consumer) account section.
///
/// These intentionally live alongside the storefront [Address] model rather
/// than changing it: the account needs richer, *savable* records (id, label,
/// phone, default flag) that the checkout [Address] does not carry.
///
/// NOTE: no account APIs are wired in this repo yet. Each model documents the
/// integration contract it is a client-side stand-in for.

/// A saved delivery address.
///
/// Integration contract: `GET/POST/PATCH/DELETE /store/customers/me/addresses`.
class SavedAddress {
  const SavedAddress({
    required this.id,
    required this.label,
    required this.fullName,
    required this.phone,
    required this.line1,
    this.line2,
    required this.city,
    this.state,
    required this.pincode,
    this.isDefault = false,
  });

  final String id;
  final String label; // Home / Office / Site …
  final String fullName;
  final String phone;
  final String line1;
  final String? line2;
  final String city;
  final String? state;
  final String pincode;
  final bool isDefault;

  String get singleLine => <String>[
        line1,
        if (line2 != null && line2!.isNotEmpty) line2!,
        city,
        if (state != null && state!.isNotEmpty) state!,
        pincode,
      ].join(', ');

  SavedAddress copyWith({
    String? label,
    String? fullName,
    String? phone,
    String? line1,
    String? line2,
    String? city,
    String? state,
    String? pincode,
    bool? isDefault,
  }) =>
      SavedAddress(
        id: id,
        label: label ?? this.label,
        fullName: fullName ?? this.fullName,
        phone: phone ?? this.phone,
        line1: line1 ?? this.line1,
        line2: line2 ?? this.line2,
        city: city ?? this.city,
        state: state ?? this.state,
        pincode: pincode ?? this.pincode,
        isDefault: isDefault ?? this.isDefault,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'label': label,
        'full_name': fullName,
        'phone': phone,
        'line1': line1,
        'line2': line2,
        'city': city,
        'state': state,
        'pincode': pincode,
        'is_default': isDefault,
      };

  factory SavedAddress.fromJson(Map<String, dynamic> j) => SavedAddress(
        id: j['id'] as String? ?? '',
        label: j['label'] as String? ?? 'Home',
        fullName: j['full_name'] as String? ?? '',
        phone: j['phone'] as String? ?? '',
        line1: j['line1'] as String? ?? '',
        line2: j['line2'] as String?,
        city: j['city'] as String? ?? '',
        state: j['state'] as String?,
        pincode: j['pincode'] as String? ?? '',
        isDefault: j['is_default'] as bool? ?? false,
      );
}

enum PaymentMethodKind { upi, card, netbanking, wallet, cod }

/// A supported or saved payment method.
///
/// Integration contract: a payment-provider tokenization flow
/// (`POST /store/payment-collections` + provider SDK). This model only holds
/// display metadata — **no transaction is executed here**.
class PaymentMethod {
  const PaymentMethod({
    required this.id,
    required this.kind,
    required this.label,
    required this.detail,
    this.isDefault = false,
    this.removable = true,
  });

  final String id;
  final PaymentMethodKind kind;
  final String label;
  final String detail;
  final bool isDefault;

  /// Supported (network) methods are not removable by the buyer.
  final bool removable;

  PaymentMethod copyWith({bool? isDefault}) => PaymentMethod(
        id: id,
        kind: kind,
        label: label,
        detail: detail,
        isDefault: isDefault ?? this.isDefault,
        removable: removable,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'kind': kind.name,
        'label': label,
        'detail': detail,
        'is_default': isDefault,
        'removable': removable,
      };

  factory PaymentMethod.fromJson(Map<String, dynamic> j) => PaymentMethod(
        id: j['id'] as String? ?? '',
        kind: PaymentMethodKind.values.firstWhere(
            (k) => k.name == j['kind'],
            orElse: () => PaymentMethodKind.upi),
        label: j['label'] as String? ?? '',
        detail: j['detail'] as String? ?? '',
        isDefault: j['is_default'] as bool? ?? false,
        removable: j['removable'] as bool? ?? true,
      );
}

/// The buyer's GST details used on invoices.
///
/// Integration contract: `PATCH /store/customers/me` (metadata) — tax identity
/// is validated server-side; this stores the captured form.
class GstDetails {
  const GstDetails({
    this.gstin = '',
    this.legalName = '',
    this.registeredAddress = '',
    this.state = '',
  });

  final String gstin;
  final String legalName;
  final String registeredAddress;
  final String state;

  bool get isEmpty =>
      gstin.isEmpty &&
      legalName.isEmpty &&
      registeredAddress.isEmpty &&
      state.isEmpty;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'gstin': gstin,
        'legal_name': legalName,
        'registered_address': registeredAddress,
        'state': state,
      };

  factory GstDetails.fromJson(Map<String, dynamic> j) => GstDetails(
        gstin: j['gstin'] as String? ?? '',
        legalName: j['legal_name'] as String? ?? '',
        registeredAddress: j['registered_address'] as String? ?? '',
        state: j['state'] as String? ?? '',
      );
}

enum InvoiceStatus { paid, pending, refunded }

/// An order invoice.
///
/// Integration contract: `GET /store/customers/me/invoices` (PDF via a signed
/// `download_url`). Dev fixtures stand in until the endpoint exists.
class Invoice {
  const Invoice({
    required this.id,
    required this.number,
    required this.orderRef,
    required this.dateLabel,
    required this.amountMinor,
    this.status = InvoiceStatus.paid,
    this.gstin = '',
  });

  final String id;
  final String number;
  final String orderRef;
  final String dateLabel;
  final int amountMinor;
  final InvoiceStatus status;
  final String gstin;

  Money get amount => Money(amount: amountMinor, currencyCode: 'INR');

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'number': number,
        'order_ref': orderRef,
        'date_label': dateLabel,
        'amount_minor': amountMinor,
        'status': status.name,
        'gstin': gstin,
      };

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: j['id'] as String? ?? '',
        number: j['number'] as String? ?? '',
        orderRef: j['order_ref'] as String? ?? '',
        dateLabel: j['date_label'] as String? ?? '',
        amountMinor: (j['amount_minor'] as num?)?.toInt() ?? 0,
        status: InvoiceStatus.values
            .firstWhere((s) => s.name == j['status'], orElse: () => InvoiceStatus.paid),
        gstin: j['gstin'] as String? ?? '',
      );
}

enum TicketStatus { open, inProgress, resolved, closed }

extension TicketStatusX on TicketStatus {
  String get label => switch (this) {
        TicketStatus.open => 'Open',
        TicketStatus.inProgress => 'In progress',
        TicketStatus.resolved => 'Resolved',
        TicketStatus.closed => 'Closed',
      };
}

/// A support ticket raised from Help & Support.
///
/// Integration contract: `POST /store/support/tickets` +
/// `GET /store/support/tickets` (status feed).
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.subject,
    required this.category,
    required this.message,
    required this.createdLabel,
    this.status = TicketStatus.open,
  });

  final String id;
  final String subject;
  final String category;
  final String message;
  final String createdLabel;
  final TicketStatus status;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'subject': subject,
        'category': category,
        'message': message,
        'created_label': createdLabel,
        'status': status.name,
      };

  factory SupportTicket.fromJson(Map<String, dynamic> j) => SupportTicket(
        id: j['id'] as String? ?? '',
        subject: j['subject'] as String? ?? '',
        category: j['category'] as String? ?? 'Other',
        message: j['message'] as String? ?? '',
        createdLabel: j['created_label'] as String? ?? '',
        status: TicketStatus.values.firstWhere((s) => s.name == j['status'],
            orElse: () => TicketStatus.open),
      );
}

/// The buyer's profile.
///
/// Integration contract: `GET/PATCH /store/customers/me`.
class AccountProfile {
  const AccountProfile({
    this.name = '',
    this.email = '',
    this.phone = '',
  });

  final String name;
  final String email;
  final String phone;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'BK';
    final first = parts.first[0];
    final last = parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '';
    return (first + last).toUpperCase();
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'name': name,
        'email': email,
        'phone': phone,
      };

  factory AccountProfile.fromJson(Map<String, dynamic> j) => AccountProfile(
        name: j['name'] as String? ?? '',
        email: j['email'] as String? ?? '',
        phone: j['phone'] as String? ?? '',
      );
}

enum AppLanguage { english, hindi }

extension AppLanguageX on AppLanguage {
  String get label => switch (this) {
        AppLanguage.english => 'English',
        AppLanguage.hindi => 'हिन्दी (Hindi)',
      };
  String get code => switch (this) {
        AppLanguage.english => 'en',
        AppLanguage.hindi => 'hi',
      };
}

/// Buyer app preferences.
///
/// Integration contract: local device settings (no server round-trip).
class AppSettings {
  const AppSettings({
    this.language = AppLanguage.english,
    this.notificationsEnabled = true,
    this.promotionalOptIn = true,
  });

  final AppLanguage language;
  final bool notificationsEnabled;
  final bool promotionalOptIn;

  AppSettings copyWith({
    AppLanguage? language,
    bool? notificationsEnabled,
    bool? promotionalOptIn,
  }) =>
      AppSettings(
        language: language ?? this.language,
        notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
        promotionalOptIn: promotionalOptIn ?? this.promotionalOptIn,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'language': language.code,
        'notifications': notificationsEnabled,
        'promotional': promotionalOptIn,
      };

  factory AppSettings.fromJson(Map<String, dynamic> j) => AppSettings(
        language: AppLanguage.values.firstWhere(
            (l) => l.code == j['language'],
            orElse: () => AppLanguage.english),
        notificationsEnabled: j['notifications'] as bool? ?? true,
        promotionalOptIn: j['promotional'] as bool? ?? true,
      );
}
