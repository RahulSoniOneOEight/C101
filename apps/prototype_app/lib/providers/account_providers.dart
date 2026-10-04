import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local_store.dart';
import '../domain/account_models.dart';

/// Account-section state. Backed by [LocalStore] (SharedPreferences) as the
/// client-side stand-in for the not-yet-wired account APIs documented on each
/// model. Dev fixtures are seeded **once** and thereafter persist.

LocalStore _store(Ref ref) => ref.read(localStoreProvider);

String _newId(String prefix) =>
    '${prefix}_${DateTime.now().microsecondsSinceEpoch}';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

class ProfileNotifier extends Notifier<AccountProfile> {
  @override
  AccountProfile build() {
    return _store(ref).readProfile() ??
        const AccountProfile(
          name: 'Rahul Sharma',
          email: 'rahul.sharma@example.com',
          phone: '+91 98765 43210',
        );
  }

  Future<void> save(AccountProfile profile) async {
    state = profile;
    await _store(ref).writeProfile(profile);
  }
}

final profileProvider =
    NotifierProvider<ProfileNotifier, AccountProfile>(ProfileNotifier.new);

// ---------------------------------------------------------------------------
// Saved addresses
// ---------------------------------------------------------------------------

class AddressesNotifier extends Notifier<List<SavedAddress>> {
  @override
  List<SavedAddress> build() {
    final store = ref.read(localStoreProvider);
    if (!store.hasAddresses()) {
      final seed = _addressSeed();
      store.writeAddresses(seed); // fire-and-forget first-run seed
      return seed;
    }
    return store.readAddresses();
  }

  Future<void> _persist(List<SavedAddress> next) async {
    state = next;
    await _store(ref).writeAddresses(next);
  }

  Future<void> add(SavedAddress address) async {
    var next = <SavedAddress>[...state, address];
    if (address.isDefault || next.length == 1) {
      next = _withDefault(next, address.id);
    }
    await _persist(next);
  }

  Future<void> update(SavedAddress address) async {
    var next = <SavedAddress>[
      for (final a in state) a.id == address.id ? address : a,
    ];
    if (address.isDefault) next = _withDefault(next, address.id);
    if (next.isNotEmpty && next.every((a) => !a.isDefault)) {
      next = _withDefault(next, next.first.id);
    }
    await _persist(next);
  }

  Future<void> remove(String id) async {
    final wasDefault = state.any((a) => a.id == id && a.isDefault);
    var next = state.where((a) => a.id != id).toList();
    if (wasDefault && next.isNotEmpty) next = _withDefault(next, next.first.id);
    await _persist(next);
  }

  Future<void> setDefault(String id) async => _persist(_withDefault(state, id));

  List<SavedAddress> _withDefault(List<SavedAddress> list, String id) => <SavedAddress>[
        for (final a in list) a.copyWith(isDefault: a.id == id),
      ];
}

final addressesProvider =
    NotifierProvider<AddressesNotifier, List<SavedAddress>>(
        AddressesNotifier.new);

final defaultAddressProvider = Provider<SavedAddress?>((ref) {
  final list = ref.watch(addressesProvider);
  for (final a in list) {
    if (a.isDefault) return a;
  }
  return list.isEmpty ? null : list.first;
});

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

class WishlistNotifier extends Notifier<List<String>> {
  @override
  List<String> build() {
    final store = ref.read(localStoreProvider);
    if (!store.hasWishlist()) {
      const seed = <String>['prod_drill', 'prod_grinder', 'prod_tiles'];
      store.writeWishlist(seed);
      return seed;
    }
    return store.readWishlist();
  }

  bool contains(String id) => state.contains(id);

  Future<void> add(String id) async {
    if (state.contains(id)) return;
    final next = <String>[id, ...state];
    state = next;
    await _store(ref).writeWishlist(next);
  }

  Future<void> remove(String id) async {
    final next = state.where((s) => s != id).toList();
    state = next;
    await _store(ref).writeWishlist(next);
  }

  Future<void> toggle(String id) =>
      state.contains(id) ? remove(id) : add(id);
}

final wishlistProvider =
    NotifierProvider<WishlistNotifier, List<String>>(WishlistNotifier.new);

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

class PaymentMethodsNotifier extends Notifier<List<PaymentMethod>> {
  @override
  List<PaymentMethod> build() {
    final store = ref.read(localStoreProvider);
    final supported = _supportedMethods();
    if (!store.hasPaymentMethods()) {
      final seed = <PaymentMethod>[...supported, _savedCardSeed()];
      store.writePaymentMethods(seed);
      return seed;
    }
    final stored = store.readPaymentMethods();
    // Guard against a stale/partial store: keep supported methods always.
    final saved = stored.where((m) => m.removable).toList();
    return <PaymentMethod>[...supported, ...saved];
  }

  Future<void> _persistSaved(List<PaymentMethod> all) async {
    state = all;
    await _store(ref).writePaymentMethods(all);
  }

  Future<void> addSaved(PaymentMethod method) async {
    var next = <PaymentMethod>[...state, method];
    if (method.isDefault) {
      next = <PaymentMethod>[
        for (final m in next)
          m.copyWith(
              isDefault: m.removable ? m.id == method.id : false),
      ];
    }
    await _persistSaved(next);
  }

  Future<void> setDefault(String id) async {
    await _persistSaved(<PaymentMethod>[
      for (final m in state)
        m.copyWith(isDefault: m.removable ? m.id == id : false),
    ]);
  }

  Future<void> remove(String id) async {
    final next = state.where((m) => m.id != id || !m.removable).toList();
    await _persistSaved(next);
  }
}

final paymentMethodsProvider =
    NotifierProvider<PaymentMethodsNotifier, List<PaymentMethod>>(
        PaymentMethodsNotifier.new);

// ---------------------------------------------------------------------------
// GST details + invoices
// ---------------------------------------------------------------------------

class GstNotifier extends Notifier<GstDetails> {
  @override
  GstDetails build() => _store(ref).readGst() ?? const GstDetails();

  Future<void> save(GstDetails gst) async {
    state = gst;
    await _store(ref).writeGst(gst);
  }
}

final gstProvider = NotifierProvider<GstNotifier, GstDetails>(GstNotifier.new);

/// Invoices for the account.
///
/// Integration contract: `GET /store/customers/me/invoices`. Dev fixtures until
/// the endpoint exists; the buyer's GSTIN is stamped onto new invoices.
final invoicesProvider = Provider<List<Invoice>>((ref) {
  final gst = ref.watch(gstProvider);
  return <Invoice>[
    Invoice(
      id: 'inv_10428',
      number: 'INV-2026-10428',
      orderRef: 'Order #BK-10428',
      dateLabel: '24 Sep 2026',
      amountMinor: 649900,
      gstin: gst.gstin,
    ),
    Invoice(
      id: 'inv_10427',
      number: 'INV-2026-10427',
      orderRef: 'Order #BK-10427',
      dateLabel: '18 Sep 2026',
      amountMinor: 329900,
      status: InvoiceStatus.pending,
      gstin: gst.gstin,
    ),
    Invoice(
      id: 'inv_10419',
      number: 'INV-2026-10419',
      orderRef: 'Order #BK-10419',
      dateLabel: '02 Sep 2026',
      amountMinor: 115000,
      gstin: gst.gstin,
    ),
  ];
});

// ---------------------------------------------------------------------------
// Help & Support tickets
// ---------------------------------------------------------------------------

class TicketsNotifier extends Notifier<List<SupportTicket>> {
  @override
  List<SupportTicket> build() {
    final store = ref.read(localStoreProvider);
    if (!store.hasTickets()) return const <SupportTicket>[];
    return store.readTickets();
  }

  Future<void> add({
    required String subject,
    required String category,
    required String message,
  }) async {
    final next = <SupportTicket>[
      SupportTicket(
        id: _newId('tkt'),
        subject: subject,
        category: category,
        message: message,
        createdLabel: _todayLabel(),
      ),
      ...state,
    ];
    state = next;
    await _store(ref).writeTickets(next);
  }
}

final ticketsProvider =
    NotifierProvider<TicketsNotifier, List<SupportTicket>>(
        TicketsNotifier.new);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

class SettingsNotifier extends Notifier<AppSettings> {
  @override
  AppSettings build() => _store(ref).readSettings();

  Future<void> update(AppSettings settings) async {
    state = settings;
    await _store(ref).writeSettings(settings);
  }
}

final settingsProvider =
    NotifierProvider<SettingsNotifier, AppSettings>(SettingsNotifier.new);

// ---------------------------------------------------------------------------
// Dev fixtures
// ---------------------------------------------------------------------------

List<SavedAddress> _addressSeed() => <SavedAddress>[
      const SavedAddress(
        id: 'addr_home',
        label: 'Home',
        fullName: 'Rahul Sharma',
        phone: '+91 98765 43210',
        line1: 'B-24, Shanti Kunj',
        line2: 'Near City Mall',
        city: 'Bhiwadi',
        state: 'Rajasthan',
        pincode: '301019',
        isDefault: true,
      ),
      const SavedAddress(
        id: 'addr_site',
        label: 'Site',
        fullName: 'Rahul Sharma (Site office)',
        phone: '+91 98765 43210',
        line1: 'Plot 14, Industrial Area',
        city: 'Bhiwadi',
        state: 'Rajasthan',
        pincode: '301019',
      ),
    ];

List<PaymentMethod> _supportedMethods() => const <PaymentMethod>[
      PaymentMethod(
        id: 'pm_upi',
        kind: PaymentMethodKind.upi,
        label: 'UPI',
        detail: 'GPay, PhonePe, Paytm & more',
        removable: false,
      ),
      PaymentMethod(
        id: 'pm_card',
        kind: PaymentMethodKind.card,
        label: 'Credit / Debit card',
        detail: 'Visa, Mastercard, RuPay',
        removable: false,
      ),
      PaymentMethod(
        id: 'pm_nb',
        kind: PaymentMethodKind.netbanking,
        label: 'Net banking',
        detail: 'All major banks',
        removable: false,
      ),
      PaymentMethod(
        id: 'pm_cod',
        kind: PaymentMethodKind.cod,
        label: 'Cash on delivery',
        detail: 'Pay when your order arrives',
        removable: false,
      ),
    ];

PaymentMethod _savedCardSeed() => const PaymentMethod(
      id: 'pm_saved_hdfc',
      kind: PaymentMethodKind.card,
      label: 'HDFC •••• 4821',
      detail: 'Expires 08/29',
      isDefault: true,
    );

String _todayLabel() {
  const months = <String>[
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final now = DateTime.now();
  return '${now.day.toString().padLeft(2, '0')} ${months[now.month - 1]} ${now.year}';
}
