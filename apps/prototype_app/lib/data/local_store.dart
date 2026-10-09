import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/account_models.dart';
import '../domain/b2b_support_models.dart';
import '../domain/b2b_trade_models.dart';
import '../domain/models.dart';

/// App-wide [SharedPreferences].
///
/// This provider is overridden in `main()` after the async
/// `SharedPreferences.getInstance()` completes. It must not be read before that
/// override is installed.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError(
    'sharedPreferencesProvider must be overridden in main()',
  ),
);

/// Lightweight JSON persistence for the cart and product catalog.
///
/// Gives the storefront offline capability: the last-known cart and catalog
/// survive restarts and are served when the backend is unreachable.
class LocalStore {
  LocalStore(this._prefs);

  final SharedPreferences _prefs;

  static const String _cartKey = 'cart_v1';
  static const String _catalogKey = 'catalog_v1';
  static const String _recentlyViewedKey = 'recently_viewed_v1';

  List<String> readRecentlyViewed() {
    return _prefs.getStringList(_recentlyViewedKey) ?? const <String>[];
  }

  Future<void> writeRecentlyViewed(List<String> ids) async {
    await _prefs.setStringList(_recentlyViewedKey, ids);
  }

  Cart? readCart() {
    final raw = _prefs.getString(_cartKey);
    if (raw == null) return null;
    try {
      return Cart.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeCart(Cart? cart) async {
    if (cart == null) {
      await _prefs.remove(_cartKey);
    } else {
      await _prefs.setString(_cartKey, jsonEncode(cart.toJson()));
    }
  }

  List<Product> readCatalog() {
    final raw = _prefs.getString(_catalogKey);
    if (raw == null) return const <Product>[];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<String, dynamic>>()
          .map(Product.fromCacheJson)
          .toList();
    } catch (_) {
      return const <Product>[];
    }
  }

  Future<void> writeCatalog(List<Product> products) async {
    await _prefs.setString(
      _catalogKey,
      jsonEncode(products.map((p) => p.toCacheJson()).toList()),
    );
  }

  // ---- Account persistence -------------------------------------------------
  // Each of these is the client-side stand-in for a not-yet-wired account API
  // (see docs in `domain/account_models.dart`).

  static const String _profileKey = 'account_profile_v1';
  static const String _addressesKey = 'account_addresses_v1';
  static const String _wishlistKey = 'wishlist_v1';
  static const String _paymentsKey = 'account_payments_v1';
  static const String _gstKey = 'account_gst_v1';
  static const String _ticketsKey = 'support_tickets_v1';
  static const String _settingsKey = 'account_settings_v1';

  AccountProfile? readProfile() {
    final raw = _prefs.getString(_profileKey);
    if (raw == null) return null;
    try {
      return AccountProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeProfile(AccountProfile profile) async {
    await _prefs.setString(_profileKey, jsonEncode(profile.toJson()));
  }

  List<SavedAddress> readAddresses() =>
      _readList(_addressesKey, SavedAddress.fromJson);

  Future<void> writeAddresses(List<SavedAddress> addresses) =>
      _writeList(_addressesKey, addresses.map((a) => a.toJson()).toList());

  List<String> readWishlist() =>
      _prefs.getStringList(_wishlistKey) ?? const <String>[];

  Future<void> writeWishlist(List<String> productIds) async {
    await _prefs.setStringList(_wishlistKey, productIds);
  }

  List<PaymentMethod> readPaymentMethods() =>
      _readList(_paymentsKey, PaymentMethod.fromJson);

  Future<void> writePaymentMethods(List<PaymentMethod> methods) =>
      _writeList(_paymentsKey, methods.map((m) => m.toJson()).toList());

  GstDetails? readGst() {
    final raw = _prefs.getString(_gstKey);
    if (raw == null) return null;
    try {
      return GstDetails.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeGst(GstDetails gst) async {
    await _prefs.setString(_gstKey, jsonEncode(gst.toJson()));
  }

  List<SupportTicket> readTickets() =>
      _readList(_ticketsKey, SupportTicket.fromJson);

  Future<void> writeTickets(List<SupportTicket> tickets) =>
      _writeList(_ticketsKey, tickets.map((t) => t.toJson()).toList());

  AppSettings readSettings() {
    final raw = _prefs.getString(_settingsKey);
    if (raw == null) return const AppSettings();
    try {
      return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const AppSettings();
    }
  }

  Future<void> writeSettings(AppSettings settings) async {
    await _prefs.setString(_settingsKey, jsonEncode(settings.toJson()));
  }

  /// Whether a persisted collection has ever been written (so we can seed dev
  /// fixtures exactly once, and not re-seed after the buyer empties a list).
  bool contains(String key) => _prefs.containsKey(key);

  bool hasAddresses() => _prefs.containsKey(_addressesKey);
  bool hasWishlist() => _prefs.containsKey(_wishlistKey);
  bool hasPaymentMethods() => _prefs.containsKey(_paymentsKey);
  bool hasTickets() => _prefs.containsKey(_ticketsKey);

  // ---- Procurement lists (Quick Order → list journey) ----------------------
  static const String _procurementListsKey = 'procurement_lists_v1';
  bool hasProcurementLists() => _prefs.containsKey(_procurementListsKey);

  List<ProcurementList> readProcurementLists() =>
      _readList(_procurementListsKey, ProcurementList.fromJson);

  Future<void> writeProcurementLists(List<ProcurementList> lists) =>
      _writeList(_procurementListsKey, lists.map((l) => l.toJson()).toList());

  // ---- B2B RFQ draft (quote-to-order journey) ------------------------------
  // Device-local stand-in for the not-yet-wired RFQ draft API. Persists the
  // buyer's multi-SKU basket, target prices, delivery, required-by and remarks
  // so a draft survives restarts. Submission does not create an order here.
  static const String _rfqDraftKey = 'b2b_rfq_draft_v1';

  bool hasRfqDraft() => _prefs.containsKey(_rfqDraftKey);

  B2BQuotationCart? readRfqDraft() {
    final raw = _prefs.getString(_rfqDraftKey);
    if (raw == null) return null;
    try {
      return B2BQuotationCart.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeRfqDraft(B2BQuotationCart cart) async {
    if (cart.isEmpty &&
        cart.deliveryLocation == null &&
        cart.requiredBy == null &&
        (cart.remarks == null || cart.remarks!.isEmpty)) {
      await _prefs.remove(_rfqDraftKey);
    } else {
      await _prefs.setString(_rfqDraftKey, jsonEncode(cart.toJson()));
    }
  }

  // ---- B2B back-office projections (team, approvals, projects) -------------
  // Device-local stand-ins for the not-yet-wired B2B account APIs. Each seeds
  // once from the demo fixture and then persists buyer edits across restarts.

  static const String _teamMembersKey = 'b2b_team_members_v1';
  static const String _approvalsKey = 'b2b_approvals_v1';
  static const String _projectsKey = 'b2b_projects_v1';

  bool hasTeamMembers() => _prefs.containsKey(_teamMembersKey);
  List<TeamMember> readTeamMembers() =>
      _readList(_teamMembersKey, TeamMember.fromJson);
  Future<void> writeTeamMembers(List<TeamMember> members) =>
      _writeList(_teamMembersKey, members.map((m) => m.toJson()).toList());

  bool hasApprovals() => _prefs.containsKey(_approvalsKey);
  List<ApprovalItem> readApprovals() =>
      _readList(_approvalsKey, ApprovalItem.fromJson);
  Future<void> writeApprovals(List<ApprovalItem> items) =>
      _writeList(_approvalsKey, items.map((i) => i.toJson()).toList());

  bool hasProjects() => _prefs.containsKey(_projectsKey);
  List<ProjectSummary> readProjects() =>
      _readList(_projectsKey, ProjectSummary.fromJson);
  Future<void> writeProjects(List<ProjectSummary> projects) =>
      _writeList(_projectsKey, projects.map((p) => p.toJson()).toList());

  List<T> _readList<T>(String key, T Function(Map<String, dynamic>) fromJson) {
    final raw = _prefs.getString(key);
    if (raw == null) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.whereType<Map<String, dynamic>>().map(fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> _writeList(String key, List<Object?> json) async {
    // Always write (even an empty list) so "seeded" state is retained and dev
    // fixtures are not re-seeded after the buyer empties a collection.
    await _prefs.setString(key, jsonEncode(json));
  }
}

final localStoreProvider = Provider<LocalStore>(
    (ref) => LocalStore(ref.watch(sharedPreferencesProvider)));
