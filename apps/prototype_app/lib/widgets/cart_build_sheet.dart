import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/experience_api.dart';
import '../data/local_store.dart';
import '../domain/models.dart';
import '../domain/workspace_models.dart';
import '../providers/b2b_trade_providers.dart';
import '../providers/cart_providers.dart';

/// Explicit shared-list → cart handoff.
///
/// Re-reads the current Commerce offer for every accepted line, shows any
/// price/seller/stock/MOQ difference, and adds the confirmed quantities to the
/// channel's cart only after acknowledgement. It never creates an order.
Future<void> showCartBuildSheet(
  BuildContext context, {
  required WorkspaceDraftView view,
  required bool business,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _CartBuildSheet(view: view, business: business),
  );
}

class _BuildLine {
  _BuildLine({
    required this.line,
    required this.offerId,
    required this.unitAmountMinor,
    required this.currencyCode,
    required this.sellerName,
    required this.differences,
    required this.blocked,
  });

  final DraftLine line;
  final String offerId;
  final int unitAmountMinor;
  final String currencyCode;
  final String sellerName;
  final List<String> differences;
  final bool blocked;
}

class _CartBuildSheet extends ConsumerStatefulWidget {
  const _CartBuildSheet({required this.view, required this.business});

  final WorkspaceDraftView view;
  final bool business;

  @override
  ConsumerState<_CartBuildSheet> createState() => _CartBuildSheetState();
}

class _CartBuildSheetState extends ConsumerState<_CartBuildSheet> {
  final List<_BuildLine> _lines = <_BuildLine>[];
  bool _loading = true;
  bool _building = false;
  bool _acknowledged = false;
  bool _alreadyBuilt = false;
  bool _approvalReady = true;
  String? _error;

  DraftRevision? get _revision => widget.view.revision;

  String get _buildKey {
    final revision = _revision;
    return revision == null ? '' : '${widget.view.draft.id}:${revision.id}';
  }

  bool get _hasDifferences => _lines.any((line) => line.differences.isNotEmpty);

  bool get _hasBlocked => _lines.any((line) => line.blocked);

  bool get _canBuild =>
      !_loading &&
      !_building &&
      !_alreadyBuilt &&
      _approvalReady &&
      _revision != null &&
      _lines.isNotEmpty &&
      !_hasBlocked &&
      (!_hasDifferences || _acknowledged);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final revision = _revision;
    if (revision == null || revision.lines.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Accept a shared-list revision before building a cart.';
      });
      return;
    }
    final role = widget.view.draft.role;
    if (!widget.business && role != 'owner') {
      setState(() {
        _loading = false;
        _error = 'Only the project owner can build a cart from this list.';
      });
      return;
    }
    if (widget.business && role != 'buyer' && role != 'admin') {
      setState(() {
        _loading = false;
        _error =
            'Only a buyer or account admin can build a cart from this list.';
      });
      return;
    }

    if (widget.business) {
      final approval = widget.view.approval;
      _approvalReady = approval != null &&
          approval.decision == 'approved' &&
          approval.revisionId == revision.id &&
          approval.commercialHash == revision.commercialHash;
    }

    final store = ref.read(localStoreProvider);
    _alreadyBuilt = store.readCartBuilds().contains(_buildKey);

    final api = ref.read(experienceApiProvider);
    final rows = <_BuildLine>[];
    try {
      for (final line in revision.lines) {
        rows.add(await _revalidate(api, line));
      }
      if (!mounted) return;
      setState(() {
        _lines
          ..clear()
          ..addAll(rows);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not revalidate this list. Please retry.';
      });
    }
  }

  Future<_BuildLine> _revalidate(ExperienceApi api, DraftLine line) async {
    final data = await api.getProduct(
      line.productId,
      channel: widget.business ? 'b2b' : 'b2c',
    );
    final offers = (data['offers'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    if (offers.isEmpty) {
      return _BuildLine(
        line: line,
        offerId: line.offerId,
        unitAmountMinor: line.unitAmountMinor,
        currencyCode: line.currencyCode,
        sellerName: line.sellerName,
        differences: const <String>['No current seller offer'],
        blocked: true,
      );
    }

    Map<String, dynamic>? exact;
    for (final offer in offers) {
      if (offer['id'] == line.offerId) {
        exact = offer;
        break;
      }
    }
    final offer = exact ?? offers.first;
    final offerId = offer['id'] as String? ?? line.offerId;
    final unit =
        (offer['unit_amount_minor'] as num?)?.toInt() ?? line.unitAmountMinor;
    final currency =
        (offer['currency_code'] as String? ?? line.currencyCode).toUpperCase();
    final seller = offer['seller_name'] as String? ?? line.sellerName;
    final inStock = offer['in_stock'] as bool? ?? true;
    final stock = (offer['inventory_quantity'] as num?)?.toInt();
    final differences = <String>[];
    var blocked = false;

    if (exact == null) {
      differences.add('Original offer unavailable · using $seller');
    }
    if (unit != line.unitAmountMinor) {
      differences.add(
        'Price ${Money(amount: line.unitAmountMinor, currencyCode: line.currencyCode).formatted}'
        ' → ${Money(amount: unit, currencyCode: currency).formatted}',
      );
    }
    if (line.sellerName.isNotEmpty && seller != line.sellerName) {
      differences.add('Seller ${line.sellerName} → $seller');
    }
    if (currency != line.currencyCode.toUpperCase()) {
      differences.add('Currency ${line.currencyCode} → $currency');
    }
    if (!inStock) {
      differences.add('Out of stock');
      blocked = true;
    } else if (stock != null && stock < line.quantity) {
      differences.add('Only $stock left (list needs ${line.quantity})');
      blocked = true;
    }
    final commercial = data['commercial'];
    final apiMoq = commercial is Map<String, dynamic>
        ? (commercial['moq'] as num?)?.toInt()
        : null;
    var moq = apiMoq;
    if (moq == null && widget.business) {
      moq = ref
          .read(tradeCatalogueViewProvider)
          .where((product) => product.product.id == line.productId)
          .firstOrNull
          ?.moq;
    }
    if (moq != null && line.quantity < moq) {
      differences.add('MOQ $moq (list has ${line.quantity})');
      blocked = true;
    }

    return _BuildLine(
      line: line,
      offerId: offerId,
      unitAmountMinor: unit,
      currencyCode: currency,
      sellerName: seller,
      differences: differences,
      blocked: blocked,
    );
  }

  Future<void> _build() async {
    if (!_canBuild) return;
    setState(() {
      _building = true;
      _error = null;
    });
    try {
      for (final row in _lines) {
        if (widget.business) {
          final sku =
              row.line.sku.isNotEmpty ? row.line.sku : row.line.variantId;
          final cart = ref.read(b2bQuotationCartProvider);
          final exists = cart.lines.any((line) => line.sku == sku);
          if (exists) {
            ref
                .read(b2bQuotationCartProvider.notifier)
                .updateQuantity(sku, row.line.quantity);
          } else {
            ref.read(b2bQuotationCartProvider.notifier).addSku(
                  sku: sku,
                  name: row.line.productTitle,
                  quantity: row.line.quantity,
                  unitPrice: Money(
                    amount: row.unitAmountMinor,
                    currencyCode: row.currencyCode,
                  ),
                  seller: row.sellerName,
                );
          }
        } else {
          final cart = ref.read(cartProvider).value;
          CartLineItem? existing;
          for (final item in cart?.items ?? const <CartLineItem>[]) {
            if (item.variantId == row.line.variantId) {
              existing = item;
              break;
            }
          }
          if (existing != null) {
            await ref
                .read(cartProvider.notifier)
                .updateQuantity(existing.id, row.line.quantity);
          } else {
            await ref.read(cartProvider.notifier).addItem(
                  offerId: row.offerId,
                  variantId: row.line.variantId,
                  quantity: row.line.quantity,
                  unitPrice: Money(
                    amount: row.unitAmountMinor,
                    currencyCode: row.currencyCode,
                  ),
                );
          }
        }
      }
      await ref.read(localStoreProvider).markCartBuild(_buildKey);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              '${_lines.length} line${_lines.length == 1 ? '' : 's'} added to the cart. No order was created.',
            ),
            action: SnackBarAction(
              label: 'View cart',
              onPressed: () =>
                  router.go(widget.business ? '/b2b/cart' : '/cart'),
            ),
          ),
        );
    } catch (_) {
      if (mounted) {
        setState(() {
          _building = false;
          _error = 'The cart could not be built. Please retry.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AgencySpacing.md,
          0,
          AgencySpacing.md,
          MediaQuery.viewInsetsOf(context).bottom + AgencySpacing.md,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.88,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          'Review before cart build',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary,
                          ),
                        ),
                        Text(
                          'Current price, stock, seller and MOQ are checked. This creates a cart only.',
                          style: TextStyle(
                              fontSize: 11, color: colors.contentSecondary),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close cart review',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: AgencySpacing.sm),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(AgencySpacing.xl),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(AgencySpacing.lg),
                  child: Text(_error!,
                      style: TextStyle(color: colors.feedbackError)),
                )
              else ...<Widget>[
                if (widget.business)
                  _statusStrip(
                    colors,
                    _approvalReady
                        ? 'Approval is current for this revision'
                        : 'Approval is not current for this revision',
                    _approvalReady,
                  ),
                if (_alreadyBuilt)
                  _statusStrip(
                    colors,
                    'This revision is already in the cart. Building again will not duplicate lines.',
                    true,
                  ),
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _lines.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AgencySpacing.sm),
                    itemBuilder: (context, index) =>
                        _lineCard(colors, _lines[index]),
                  ),
                ),
                if (_hasDifferences) ...<Widget>[
                  CheckboxListTile(
                    value: _acknowledged,
                    onChanged: (value) =>
                        setState(() => _acknowledged = value ?? false),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(
                      'I acknowledge these differences',
                      style:
                          TextStyle(fontSize: 12, color: colors.contentPrimary),
                    ),
                  ),
                ],
                if (_hasBlocked)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
                    child: Text(
                      'Update the shared list before building. Out-of-stock, MOQ or missing-offer lines cannot be added.',
                      style:
                          TextStyle(fontSize: 11, color: colors.feedbackError),
                    ),
                  ),
                Text(
                  'GST/tax is resolved by the cart at checkout. Payment and order creation stay in the existing address-first checkout.',
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary),
                ),
                const SizedBox(height: AgencySpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _alreadyBuilt
                        ? () {
                            final router = GoRouter.of(context);
                            Navigator.of(context).pop();
                            router.go(widget.business ? '/b2b/cart' : '/cart');
                          }
                        : (_canBuild ? _build : null),
                    icon: Icon(
                      _alreadyBuilt
                          ? Icons.shopping_cart_outlined
                          : Icons.shopping_cart_checkout,
                      size: 18,
                    ),
                    label: Text(
                      _alreadyBuilt
                          ? 'View cart'
                          : _building
                              ? 'Adding to cart…'
                              : 'Add confirmed lines to cart',
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusStrip(AgencyColors colors, String message, bool ok) =>
      Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.sm),
        decoration: BoxDecoration(
          color: (ok ? colors.feedbackSuccess : colors.feedbackWarning)
              .withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(AgencyRadius.sm),
        ),
        child: Text(
          message,
          style: TextStyle(
            fontSize: 11,
            color: ok ? colors.feedbackSuccess : colors.feedbackWarning,
          ),
        ),
      );

  Widget _lineCard(AgencyColors colors, _BuildLine row) {
    final line = row.line;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(
          color: row.blocked ? colors.feedbackError : colors.borderDefault,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            line.productTitle,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.contentPrimary,
            ),
          ),
          Text(
            '${row.sellerName.isEmpty ? 'Seller' : row.sellerName} · '
            'Qty ${line.quantity} · '
            '${Money(amount: row.unitAmountMinor, currencyCode: row.currencyCode).formatted} each',
            style: TextStyle(fontSize: 11, color: colors.contentSecondary),
          ),
          if (row.differences.isNotEmpty) ...<Widget>[
            const SizedBox(height: 4),
            for (final difference in row.differences)
              Text(
                difference,
                style: TextStyle(
                  fontSize: 10,
                  color: row.blocked
                      ? colors.feedbackError
                      : colors.feedbackWarning,
                ),
              ),
          ],
        ],
      ),
    );
  }
}
