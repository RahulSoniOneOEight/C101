import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/app_config.dart';
import '../domain/models.dart';
import '../domain/app_notification.dart';
import '../domain/presentation.dart';
import '../domain/storefront_collection.dart';
import '../domain/workspace_models.dart';

/// Client for the shared BuildKart Experience API (`:9020`), which composes Medusa/Mercur/Tryton.
/// This is the canonical client for the pilot: it consumes composed responses and the dummy
/// OTP/logistics/notification endpoints. It never manufactures business decisions.

class ExperienceApi {
  ExperienceApi(this._dio, [FlutterSecureStorage? secureStorage])
      : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final Dio _dio;
  final FlutterSecureStorage _secureStorage;
  static const _sessionTokenKey = 'pilot_session_token_v1';
  static const _sessionExpiryKey = 'pilot_session_expiry_v1';
  static const _sessionEmailKey = 'pilot_session_email_v1';
  static const _sessionNameKey = 'pilot_session_name_v1';
  static const _sessionUserIdKey = 'pilot_session_user_id_v1';

  /// Email of the authenticated pilot, when known.
  ///
  /// Checkout must submit this identity: the BFF rejects a checkout email that
  /// does not match the session. The demo profile email is not the identity.
  String? _sessionEmail;

  String? get sessionEmail => _sessionEmail;

  /// Display name of the authenticated pilot, when known.
  String? _sessionName;

  String? get sessionName => _sessionName;

  /// Pilot user id of the authenticated identity, when known.
  String? _sessionUserId;

  String? get sessionUserId => _sessionUserId;

  /// Retries a read once or twice on a transient gateway failure.
  ///
  /// A staging deploy briefly returns 502/503 while containers restart; without
  /// this a single blip turns the catalogue into an error page until the user
  /// retries manually.
  Future<T> _retryTransient<T>(Future<T> Function() action) async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        return await action();
      } on DioException catch (error) {
        final status = error.response?.statusCode;
        final transient =
            status == null || status == 502 || status == 503 || status == 504;
        if (!transient || attempt == 2) rethrow;
        await Future<void>.delayed(
          Duration(milliseconds: 350 * (attempt + 1)),
        );
      }
    }
    throw StateError('Transient request retry exhausted.');
  }

  Future<Map<String, dynamic>> requestOtp(String identifier) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/challenges',
      data: {'identifier': identifier},
    );
    return res.data!;
  }

  Future<Map<String, dynamic>> verifyOtp(
      String challengeId, String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/otp/verify',
      data: {'challenge_id': challengeId, 'code': code},
    );
    final token = res.data?['session_token'] as String?;
    if (token != null && token.isNotEmpty) {
      _dio.options.headers['Authorization'] = 'Bearer $token';
      final expiresIn = (res.data?['expires_in_seconds'] as num?)?.toInt() ?? 0;
      final expiry = DateTime.now().toUtc().add(Duration(seconds: expiresIn));
      await _secureStorage.write(key: _sessionTokenKey, value: token);
      await _secureStorage.write(
        key: _sessionExpiryKey,
        value: expiry.toIso8601String(),
      );
      final user = res.data?['user'];
      final email =
          user is Map<String, dynamic> ? user['email'] as String? : null;
      final name =
          user is Map<String, dynamic> ? user['name'] as String? : null;
      final userId =
          user is Map<String, dynamic> ? user['id'] as String? : null;
      _sessionEmail = email;
      _sessionName = name;
      _sessionUserId = userId;
      if (email != null && email.isNotEmpty) {
        await _secureStorage.write(key: _sessionEmailKey, value: email);
      } else {
        await _secureStorage.delete(key: _sessionEmailKey);
      }
      if (name != null && name.isNotEmpty) {
        await _secureStorage.write(key: _sessionNameKey, value: name);
      } else {
        await _secureStorage.delete(key: _sessionNameKey);
      }
      if (userId != null && userId.isNotEmpty) {
        await _secureStorage.write(key: _sessionUserIdKey, value: userId);
      } else {
        await _secureStorage.delete(key: _sessionUserIdKey);
      }
    }
    return res.data!;
  }

  Future<void> logout({String? deviceId}) async {
    try {
      await _dio.post<void>(
        '/v1/auth/logout',
        data: deviceId == null ? null : {'device_id': deviceId},
      );
    } finally {
      await clearSession();
    }
  }

  /// The signed-in email, falling back to the persisted session identity.
  ///
  /// Checkout used to fall back to the demo profile when this was null on a
  /// cold start, which submitted a contact identity the BFF rejects.
  Future<String?> currentSessionEmail() async {
    final inMemory = _sessionEmail?.trim();
    if (inMemory != null && inMemory.isNotEmpty) return inMemory;
    try {
      final stored = (await _secureStorage.read(key: _sessionEmailKey))?.trim();
      if (stored != null && stored.isNotEmpty) {
        _sessionEmail = stored;
        return stored;
      }
    } catch (_) {
      // No secure store in tests or first run: the caller decides how to fail.
    }
    return null;
  }

  Future<bool> restoreSession() async {
    final token = await _secureStorage.read(key: _sessionTokenKey);
    final expiryRaw = await _secureStorage.read(key: _sessionExpiryKey);
    final expiry = DateTime.tryParse(expiryRaw ?? '');
    if (token == null ||
        token.isEmpty ||
        expiry == null ||
        !expiry.isAfter(DateTime.now().toUtc())) {
      await clearSession();
      return false;
    }
    _dio.options.headers['Authorization'] = 'Bearer $token';
    _sessionEmail = await _secureStorage.read(key: _sessionEmailKey);
    _sessionName = await _secureStorage.read(key: _sessionNameKey);
    _sessionUserId = await _secureStorage.read(key: _sessionUserIdKey);
    return true;
  }

  Future<void> clearSession() async {
    _dio.options.headers.remove('Authorization');
    _sessionEmail = null;
    _sessionName = null;
    _sessionUserId = null;
    await _secureStorage.delete(key: _sessionTokenKey);
    await _secureStorage.delete(key: _sessionExpiryKey);
    await _secureStorage.delete(key: _sessionEmailKey);
    await _secureStorage.delete(key: _sessionNameKey);
  }

  /// Backend storefront presentation: hero/campaign banners and root category
  /// labels, icons and imagery. Commerce data is composed server-side.
  Future<StorefrontPresentation> getPresentation({
    String locale = 'en-IN',
    String channel = 'b2c',
  }) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/content/presentation',
          queryParameters: {'locale': locale, 'channel': channel},
        ));
    return StorefrontPresentation.fromJson(res.data!);
  }

  /// Operator-authored B2B quick-order lists and trade-offer collections
  /// (CHG-062). An empty list is normal: the app keeps its governed defaults.
  Future<List<CuratedCollection>> getCuratedCollections({
    String locale = 'en-IN',
    String channel = 'b2b',
  }) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/content/curated-collections',
          queryParameters: {'locale': locale, 'channel': channel},
        ));
    return (res.data!['items'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CuratedCollection.fromJson)
        .where((item) => item.collectionKey.isNotEmpty && item.title.isNotEmpty)
        .toList();
  }

  Future<List<dynamic>> getCollection(String key) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/collections/$key');
    return (res.data!['items'] as List?) ?? [];
  }

  /// A collection opened from its customer-facing URL.
  ///
  /// Throws [CollectionNotFoundException] on a 404 instead of returning an empty list: an empty list
  /// cannot be told apart from "this link belongs to a collection with no products", and showing an
  /// empty grid for a broken link is how a dead URL looks like a working one.
  Future<StorefrontCollection> getStorefrontCollection(String key) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/v1/collections/${Uri.encodeComponent(key)}',
      );
      final data = res.data!;
      return StorefrontCollection(
        key: data['collection_key'] as String? ?? key,
        collectionId: data['collection_id'] as String?,
        title: data['title'] as String?,
      );
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) {
        final body = error.response?.data;
        final code = body is Map ? body['code'] as String? : null;
        throw CollectionNotFoundException(code ?? 'collection-not-found');
      }
      rethrow;
    }
  }

  Future<List<Map<String, dynamic>>> getMyContexts() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/contexts');
    return (res.data!['contexts'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  Future<Map<String, dynamic>> getProduct(String productId,
      {String channel = 'b2c'}) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/products/$productId',
          queryParameters: <String, dynamic>{'channel': channel},
        ));
    return res.data!;
  }

  /// Composed product list with best-price offer per product.
  ///
  /// When [collectionId] is supplied the list is scoped to that commerce collection, which is how a
  /// storefront layout section resolves its product source. Composition (price and offer) is unchanged,
  /// so a layout-driven rail renders exactly like a catalogue rail.
  ///
  /// [catalogueImport] selects a governed imported catalogue by its metadata marker, so the storefront
  /// can show the staged source catalogue without mixing in demonstration products.
  Future<List<Product>> getComposedProducts({
    int limit = 50,
    int offset = 0,
    String? collectionId,
    String channel = 'b2c',
    String? catalogueImport,
  }) async {
    final page = await _fetchComposedProducts(
      limit: limit,
      offset: offset,
      collectionId: collectionId,
      channel: channel,
      catalogueImport: catalogueImport,
    );
    return page.$1;
  }

  /// Every page of the composed catalogue, so a surface never silently truncates
  /// at the first page.
  ///
  /// The backend reports `count` for a metadata-selected catalogue; when it does
  /// not, iteration stops on a short page. Ids are de-duplicated because a
  /// catalogue can change between page requests.
  Future<List<Product>> getAllComposedProducts({
    String channel = 'b2c',
    String? catalogueImport,
    int pageSize = 250,
    int maxPages = 20,
  }) async {
    final collected = <Product>[];
    final seen = <String>{};
    var offset = 0;
    for (var page = 0; page < maxPages; page++) {
      final (batch, count) = await _fetchComposedProducts(
        limit: pageSize,
        offset: offset,
        channel: channel,
        catalogueImport: catalogueImport,
      );
      if (batch.isEmpty) break;
      var added = 0;
      for (final product in batch) {
        if (seen.add(product.id)) {
          collected.add(product);
          added++;
        }
      }
      // A backend that ignores `offset` would otherwise repeat the same page
      // until the page cap; no new id means there is nothing further to read.
      if (added == 0) break;
      offset += batch.length;
      if (count != null && offset >= count) break;
      if (count == null && batch.length < pageSize) break;
    }
    return collected;
  }

  Future<(List<Product>, int?)> _fetchComposedProducts({
    required int limit,
    required int offset,
    String? collectionId,
    String channel = 'b2c',
    String? catalogueImport,
  }) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/products',
          queryParameters: <String, dynamic>{
            'limit': limit,
            'offset': offset,
            'channel': channel,
            if (collectionId != null && collectionId.isNotEmpty)
              'collection_id': collectionId,
            if (catalogueImport != null && catalogueImport.isNotEmpty)
              'catalogue_import': catalogueImport,
          },
        ));
    final data = res.data!;
    final products = (data['products'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Product.fromComposedJson)
        .toList();
    return (products, (data['count'] as num?)?.toInt());
  }

  /// Storefront layout sections for a channel. Empty when no layout is configured.
  Future<List<StorefrontSection>> getLayoutSections(
      {String locale = 'en-IN', String channel = 'b2c'}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/content/app-shell',
      queryParameters: <String, dynamic>{'locale': locale, 'channel': channel},
    );
    return parseLayoutSections(res.data!['layout']);
  }

  /// Hero auto-advance interval for a channel, in milliseconds. 0 means no rotation.
  ///
  /// Read from the same app-shell payload the sections come from; the operator authors it per layout
  /// in the console. A missing or malformed value disables rotation rather than guessing a speed.
  Future<int> getHeroRotationMs(
      {String locale = 'en-IN', String channel = 'b2c'}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/content/app-shell',
      queryParameters: <String, dynamic>{'locale': locale, 'channel': channel},
    );
    final layout = res.data!['layout'];
    if (layout is! Map<String, dynamic>) return 0;
    final value = layout['hero_rotation_ms'];
    if (value is! num) return 0;
    final ms = value.toInt();
    return ms > 0 ? ms : 0;
  }

  /// API-backed consumer order history.
  Future<List<Map<String, dynamic>>> getMyOrders({int limit = 50}) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/me/orders',
          queryParameters: <String, dynamic>{'limit': limit},
        ));
    return (res.data?['items'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// Customer order read with lines, shipment timeline and return eligibility.
  Future<Map<String, dynamic>> getOrder(String orderId) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>('/v1/orders/$orderId'),
    );
    return res.data ?? const <String, dynamic>{};
  }

  /// Create a Phase 1 return request. The server computes eligibility and freezes policy.
  Future<Map<String, dynamic>> requestReturn({
    required String orderId,
    required String idempotencyKey,
    required String resolution,
    required String reasonCode,
    required List<Map<String, dynamic>> lines,
    String? customerComment,
  }) async {
    final res = await _retryTransient(
      () => _dio.post<Map<String, dynamic>>(
        '/v1/orders/$orderId/returns',
        options: Options(headers: <String, dynamic>{
          'Idempotency-Key': idempotencyKey,
        }),
        data: <String, dynamic>{
          'resolution': resolution,
          'reason_code': reasonCode,
          if (customerComment != null) 'customer_comment': customerComment,
          'lines': lines,
        },
      ),
    );
    return res.data ?? const <String, dynamic>{};
  }

  Future<Map<String, dynamic>> getReturn(String returnId) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>('/v1/returns/$returnId'),
    );
    return res.data ?? const <String, dynamic>{};
  }

  Future<List<Map<String, dynamic>>> getMyReturns({int limit = 50}) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/me/returns',
          queryParameters: <String, dynamic>{'limit': limit},
        ));
    return (res.data?['items'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  /// Composed product detail (best-price offer drives price + variant identity).
  Future<Product> getComposedProduct(String productId,
      {String channel = 'b2c'}) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/products/$productId',
          queryParameters: <String, dynamic>{'channel': channel},
        ));
    return Product.fromComposedJson(res.data!);
  }

  /// Canonical cart read. Used by checkout to rehydrate totals, discounts and
  /// applied codes instead of trusting a stale local copy.
  Future<Cart> getCart(String cartId) async {
    final res = await _retryTransient(
        () => _dio.get<Map<String, dynamic>>('/v1/carts/$cartId'));
    return Cart.fromJson(res.data!);
  }

  /// Creates a canonical Medusa cart (Commerce).
  Future<Cart> createCart() async {
    final res = await _dio
        .post<Map<String, dynamic>>('/v1/carts', data: <String, dynamic>{});
    return Cart.fromJson(res.data!);
  }

  /// Adds a seller offer (Marketplace) to the cart — offer-based, never variant-based.
  Future<Cart> addLineItem(String cartId, String offerId, int quantity) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/lines',
      data: {'offer_id': offerId, 'quantity': quantity},
    );
    return Cart.fromJson(res.data!);
  }

  /// Applies a promotion code through Medusa's promotion engine.
  ///
  /// A rejection is surfaced as [PromotionRejected] with the reason the engine
  /// gave, so the cart can explain it rather than silently doing nothing.
  Future<Cart> addPromotion(String cartId, String code) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/v1/carts/$cartId/promotions',
        data: <String, dynamic>{'code': code},
      );
      return Cart.fromJson(res.data!);
    } on DioException catch (error) {
      throw _promotionError(error, code);
    }
  }

  Future<Cart> removePromotion(String cartId, String code) async {
    try {
      final res = await _dio.delete<Map<String, dynamic>>(
        '/v1/carts/$cartId/promotions',
        data: <String, dynamic>{'code': code},
      );
      return Cart.fromJson(res.data!);
    } on DioException catch (error) {
      throw _promotionError(error, code);
    }
  }

  PromotionRejected _promotionError(DioException error, String code) {
    final data = error.response?.data;
    if (data is Map) {
      final rejected =
          (data['rejected_codes'] as List?)?.whereType<Map>().firstOrNull;
      final reason = rejected?['reason'] as String?;
      if (reason != null && reason.isNotEmpty) {
        return PromotionRejected(code: code, reason: reason);
      }
    }
    return PromotionRejected(
      code: code,
      reason: error.response == null ? 'unavailable' : 'not_eligible',
    );
  }

  Future<Cart> updateLineItem(
      String cartId, String lineItemId, int quantity) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/lines/$lineItemId',
      data: {'quantity': quantity},
    );
    return Cart.fromJson(res.data!);
  }

  Future<Cart> removeLineItem(String cartId, String lineItemId) async {
    final res = await _dio
        .delete<Map<String, dynamic>>('/v1/carts/$cartId/lines/$lineItemId');
    return Cart.fromJson(res.data!);
  }

  Future<Cart> updateCartCustomerDetails(
    String cartId, {
    required String email,
    required Address shippingAddress,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/customer-details',
      data: {
        'email': email,
        'shipping_address': shippingAddress.toJson(),
      },
    );
    return Cart.fromJson(res.data!);
  }

  Future<List<ShippingOption>> listShippingOptions(String cartId) async {
    final res = await _retryTransient(() => _dio.get<Map<String, dynamic>>(
          '/v1/carts/$cartId/shipping-options',
        ));
    return (res.data!['shipping_options'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ShippingOption.fromJson)
        .toList();
  }

  Future<Cart> selectShippingMethod(String cartId, String optionId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/carts/$cartId/shipping-methods',
      data: {'option_id': optionId},
    );
    return Cart.fromJson(res.data!);
  }

  /// Completes the cart only after server-side shipping and simulated payment setup.
  Future<Map<String, dynamic>> completeCart(String cartId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/v1/checkouts/$cartId/complete');
    return res.data!;
  }

  Future<Map<String, dynamic>> checkServiceability(String postcode) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/logistics/serviceability',
      queryParameters: {'postcode': postcode},
    );
    return res.data!;
  }

  Future<List<AppNotification>> getNotifications() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/notifications');
    return (res.data!['notifications'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(String notificationId) async {
    await _dio.post<void>('/v1/me/notifications/$notificationId/read');
  }

  Future<void> markAllNotificationsRead() async {
    await _dio.post<void>('/v1/me/notifications/read-all');
  }

  Future<void> clearNotifications() async {
    await _dio.delete<void>('/v1/me/notifications');
  }

  Future<String> registerDevice(String token) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/me/devices',
      data: {
        'token': token,
        'platform': 'android',
        'firebase_project_id': 'buildkart-staging',
      },
    );
    return res.data!['id'] as String;
  }

  Future<void> removeDevice(String deviceId) async {
    await _dio.delete<void>('/v1/me/devices/$deviceId');
  }

  // ---- Collaborative workspace (business account + household) ------------

  Future<List<WorkspaceSummary>> getWorkspaces() async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>('/v1/workspaces'),
    );
    return (res.data!['workspaces'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceSummary.fromJson)
        .toList();
  }

  Future<WorkspaceSummary> createHouseholdProject(String name) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/household-projects',
      data: <String, dynamic>{'name': name.trim()},
    );
    return WorkspaceSummary.fromJson(
      res.data!['workspace'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<WorkspaceInvitationPage> getWorkspaceInvitations(
    String workspaceId,
  ) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>(
        '/v1/workspaces/$workspaceId/invitations',
      ),
    );
    return WorkspaceInvitationPage.fromJson(res.data!);
  }

  Future<WorkspaceInvitationCreated> inviteWorkspaceParticipant({
    required String workspaceId,
    required String email,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/workspaces/$workspaceId/invitations',
      data: <String, dynamic>{'email': email.trim().toLowerCase()},
    );
    return WorkspaceInvitationCreated.fromJson(res.data!);
  }

  Future<void> revokeWorkspaceInvitation({
    required String workspaceId,
    required String invitationId,
  }) async {
    await _dio.post<void>(
      '/v1/workspaces/$workspaceId/invitations/$invitationId/revoke',
    );
  }

  Future<WorkspaceSummary> acceptWorkspaceInvitation(String token) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/workspace-invitations/accept',
      data: <String, dynamic>{'token': token.trim()},
    );
    return WorkspaceSummary.fromJson(
      res.data!['workspace'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<List<WorkspaceDraft>> getWorkspaceDrafts(String workspaceId) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>(
        '/v1/workspaces/$workspaceId/purchase-drafts',
      ),
    );
    return (res.data!['drafts'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceDraft.fromJson)
        .toList();
  }

  Future<WorkspaceDraftView> getWorkspaceDraft(String draftId) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>('/v1/purchase-drafts/$draftId'),
    );
    return WorkspaceDraftView.fromJson(res.data!);
  }

  Future<WorkspaceDraftView> createWorkspaceDraft({
    required String workspaceId,
    required String channelId,
    required String name,
    required List<Map<String, dynamic>> lines,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/workspaces/$workspaceId/purchase-drafts',
      data: <String, dynamic>{
        'name': name,
        'channel_id': channelId,
        'lines': lines,
      },
      options: Options(
        headers: <String, dynamic>{
          'Idempotency-Key':
              'draft_${workspaceId}_${DateTime.now().microsecondsSinceEpoch}',
        },
      ),
    );
    return WorkspaceDraftView.fromJson(res.data!);
  }

  Future<void> proposeDraftChange({
    required String draftId,
    required int expectedVersion,
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    await createDraftProposal(
      draftId: draftId,
      expectedVersion: expectedVersion,
      kind: kind,
      payload: payload,
    );
  }

  Future<String> createDraftProposal({
    required String draftId,
    required int expectedVersion,
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/purchase-drafts/$draftId/proposals',
      data: {
        'expected_version': expectedVersion,
        'kind': kind,
        'payload': payload,
      },
      options: Options(
        headers: {
          'Idempotency-Key': 'prop_${DateTime.now().microsecondsSinceEpoch}',
        },
      ),
    );
    return res.data?['proposal_id'] as String? ?? '';
  }

  Future<void> acceptProposal(String proposalId) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/proposals/$proposalId/accept',
      options: Options(
        headers: {
          'Idempotency-Key': 'accept_${DateTime.now().microsecondsSinceEpoch}',
        },
      ),
    );
  }

  Future<void> rejectProposal(String proposalId) async {
    await _dio.post<void>('/v1/proposals/$proposalId/reject');
  }

  Future<void> requestDraftApproval({
    required String draftId,
    required int expectedVersion,
    required String revisionId,
    required String commercialHash,
    String? comment,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/purchase-drafts/$draftId/approval-requests',
      data: {
        'expected_version': expectedVersion,
        'revision_id': revisionId,
        'commercial_hash': commercialHash,
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
      options: Options(
        headers: {
          'Idempotency-Key':
              'approval_${DateTime.now().microsecondsSinceEpoch}',
        },
      ),
    );
  }

  Future<void> decideDraftApproval(
    String approvalId,
    String action, {
    String? comment,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/approval-requests/$approvalId/$action',
      data: {
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
    );
  }

  Future<WorkspaceMessage> shareProductToWorkspace({
    required String channelId,
    required String productId,
    required String variantId,
    required String offerId,
    required int quantity,
    String? sellerId,
    String? productTitle,
    String? materialInstruction,
    Map<String, dynamic>? commercialSnapshot,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/channels/$channelId/shares',
      data: {
        'product_id': productId,
        'variant_id': variantId,
        'offer_id': offerId,
        'quantity': quantity,
        if (sellerId != null) 'seller_id': sellerId,
        if (productTitle != null) 'product_title': productTitle,
        if (materialInstruction != null)
          'material_instruction': materialInstruction,
        if (commercialSnapshot != null)
          'commercial_snapshot': commercialSnapshot,
      },
      options: Options(
        headers: {
          // One catalogue variant appears at most once in a conversation. The
          // database-enforced channel idempotency key also closes double taps.
          'Idempotency-Key': 'capture_${channelId}_$variantId',
        },
      ),
    );
    return WorkspaceMessage.fromJson(res.data ?? const <String, dynamic>{});
  }

  Future<List<WorkspaceChannel>> getWorkspaceChannels(
      String workspaceId) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>(
        '/v1/workspaces/$workspaceId/channels',
      ),
    );
    return (res.data!['channels'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceChannel.fromJson)
        .toList();
  }

  Future<WorkspaceMessagePage> getWorkspaceMessages(
    String channelId, {
    String? cursor,
  }) async {
    final res = await _retryTransient(
      () => _dio.get<Map<String, dynamic>>(
        '/v1/channels/$channelId/messages',
        queryParameters: cursor == null ? null : {'cursor': cursor},
      ),
    );
    final messages = (res.data!['messages'] as List? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceMessage.fromJson)
        .toList();
    return WorkspaceMessagePage(
      messages: messages,
      nextCursor: res.data!['next_cursor'] as String? ??
          (messages.isEmpty ? '0' : '${messages.last.sequence}'),
    );
  }

  Future<WorkspaceMessage> sendWorkspaceMessage(
    String channelId,
    String body,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/channels/$channelId/messages',
      data: {'body': body, 'message_type': 'text'},
      options: Options(
        headers: {
          'Idempotency-Key': 'msg_${DateTime.now().microsecondsSinceEpoch}'
        },
      ),
    );
    return WorkspaceMessage.fromJson(
      res.data!['message'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
    );
  }

  Future<void> markWorkspaceRead(String channelId, int sequence) async {
    await _dio.post<void>(
      '/v1/channels/$channelId/read-cursor',
      data: {'last_event_sequence': sequence},
    );
  }

  Future<WorkspaceStreamTicket> createWorkspaceStreamTicket(
    String workspaceId,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/workspaces/$workspaceId/stream-ticket',
    );
    return WorkspaceStreamTicket.fromJson(res.data!);
  }
}

/// A promotion code the engine refused, with a reason the UI can explain.
class PromotionRejected implements Exception {
  const PromotionRejected({required this.code, required this.reason});

  final String code;
  final String reason;

  String get message => switch (reason) {
        'not_found' => 'That promotion code was not found.',
        'expired' => 'That offer has expired.',
        'usage_limit' => 'That offer has reached its usage limit.',
        'not_eligible' => 'That code does not apply to the items in your cart.',
        'unavailable' =>
          'Promotions are unavailable right now. Please try again.',
        'no_cart' => 'Add an item before applying a code.',
        _ => 'That code could not be applied.',
      };
}

final experienceApiProvider = Provider<ExperienceApi>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.experienceApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ),
  );
  return ExperienceApi(dio, ref.watch(secureStorageProvider));
});

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});
