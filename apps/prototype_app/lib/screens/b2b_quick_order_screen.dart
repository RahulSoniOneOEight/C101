import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';

/// Maps a list source type to its display icon + label.
(IconData, String) _sourceStyle(ProcurementListSourceType type) {
  switch (type) {
    case ProcurementListSourceType.buyerSaved:
      return (Icons.bookmark_outline, 'Saved');
    case ProcurementListSourceType.seasonal:
      return (Icons.wb_sunny_outlined, 'Seasonal');
    case ProcurementListSourceType.backendCurated:
      return (Icons.auto_awesome_outlined, 'Curated');
    case ProcurementListSourceType.categoryBased:
      return (Icons.category_outlined, 'Category');
    case ProcurementListSourceType.personalized:
      return (Icons.person_pin_outlined, 'For you');
  }
}

Color _sourceAccent(ProcurementListSourceType type, AgencyColors colors) {
  switch (type) {
    case ProcurementListSourceType.buyerSaved:
      return colors.trust;
    case ProcurementListSourceType.seasonal:
      return colors.promotion;
    case ProcurementListSourceType.backendCurated:
    case ProcurementListSourceType.categoryBased:
      return colors.actionPrimary;
    case ProcurementListSourceType.personalized:
      return colors.feedbackSuccess;
  }
}

ProcurementListSourceType? procurementSourceFromName(String? name) {
  if (name == null) return null;
  for (final source in ProcurementListSourceType.values) {
    if (source.name == name) return source;
  }
  return null;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

class _Sku {
  const _Sku({
    required this.title,
    required this.sku,
    this.priceLabel = '—',
    this.imageUrl,
    this.tradeProduct,
  });

  final String title;
  final String sku;
  final String priceLabel;
  final String? imageUrl;
  final TradeProduct? tradeProduct;

  bool matches(String q) =>
      title.toLowerCase().contains(q) || sku.toLowerCase().contains(q);

  int get defaultQty => tradeProduct?.moq ?? 1;
}

// ---------------------------------------------------------------------------
// B2B Quick Order Center — Operate Lists (primary)
// ---------------------------------------------------------------------------

/// **Operate Lists:** fast purchasing from one or more saved procurement lists.
///
/// Only selection, SKU display and buying live here. List *management*
/// (create / edit / rename / duplicate / delete) is a separate journey reached
/// through `Manage Lists →` ([ProcurementListsManagerScreen]).
///
/// Purchase quantities held in [_draftQty] are **temporary** — they are the
/// quantities the buyer wants today and never write back to a list's saved
/// defaults.
class B2BQuickOrderCenterScreen extends ConsumerStatefulWidget {
  const B2BQuickOrderCenterScreen({super.key});

  @override
  ConsumerState<B2BQuickOrderCenterScreen> createState() =>
      _B2BQuickOrderCenterScreenState();
}

class _B2BQuickOrderCenterScreenState
    extends ConsumerState<B2BQuickOrderCenterScreen> {
  final TextEditingController _search = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  String _query = '';
  int _scope = 0; // 0 = in selected lists, 1 = all catalogue
  final Set<String> _selectedListIds = <String>{};

  /// Temporary purchasing quantities for today (never persisted to a list).
  final Map<String, int> _draftQty = <String, int>{};

  @override
  void initState() {
    super.initState();
    // Default to the first procurement list so the grid is never empty on open.
    final lists = ref.read(procurementListsProvider);
    if (lists.isNotEmpty) _selectedListIds.add(lists.first.id);
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  // ---- view model ----------------------------------------------------------

  _Sku _fromProduct(TradeProduct p) => _Sku(
        title: p.product.title,
        sku: p.product.id,
        priceLabel: p.tradePrice.formatted,
        imageUrl: p.product.thumbnail,
        tradeProduct: p,
      );

  _Sku _fromItem(ProcurementListItem item, List<TradeProduct> catalogue) {
    for (final p in catalogue) {
      if (p.product.id == item.sku || p.product.title == item.name) {
        return _fromProduct(p);
      }
    }
    return _Sku(
      title: item.name,
      sku: item.sku,
      priceLabel: item.unitPrice?.formatted ?? '—',
    );
  }

  List<_Sku> _dedupe(List<_Sku> skus) {
    final seen = <String>{};
    return <_Sku>[
      for (final s in skus)
        if (seen.add(s.sku)) s,
    ];
  }

  List<_Sku> _displayed(
      List<ProcurementList> lists, List<TradeProduct> catalogue) {
    List<_Sku> base;
    if (_scope == 1) {
      base = <_Sku>[for (final p in catalogue) _fromProduct(p)];
    } else if (_selectedListIds.isEmpty) {
      base = <_Sku>[];
    } else {
      // Combined SKUs across the selected lists; the same SKU from two lists is
      // de-duplicated (its source lists are still retained in the saved data).
      base = <_Sku>[
        for (final l in lists)
          if (_selectedListIds.contains(l.id))
            for (final it in l.items) _fromItem(it, catalogue),
      ];
    }
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) base = base.where((s) => s.matches(q)).toList();
    return _dedupe(base);
  }

  // ---- cart ----------------------------------------------------------------

  void _addToCart(_Sku s) {
    final qty = _draftQty[s.sku] ?? s.defaultQty;
    final notifier = ref.read(b2bQuotationCartProvider.notifier);
    if (s.tradeProduct != null) {
      notifier.addTradeProduct(s.tradeProduct!, quantity: qty);
    } else {
      notifier.addSku(sku: s.sku, name: s.title, quantity: qty);
    }
    PinToast.show(context, 'Added $qty × ${s.title} to cart',
        tone: PinToastTone.success);
  }

  // ---- build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final catalogue = ref.watch(tradeCatalogueProvider);
    final lists = ref.watch(procurementListsProvider);
    final cart = ref.watch(b2bQuotationCartProvider);
    final displayed = _displayed(lists, catalogue);
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final selectedCount = _selectedListIds.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Quick Order Center'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Cart',
            onPressed: () => context.push('/b2b/quotation-cart'),
            icon: Badge(
              isLabelVisible: cart.skuCount > 0,
              label: Text('${cart.skuCount}'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          PinSearch(
            controller: _search,
            focusNode: _searchFocus,
            hintText: 'Search products / SKU / brand',
            onChanged: (v) => setState(() => _query = v),
            onSubmitted: (v) => setState(() => _query = v),
          ),
          const SizedBox(height: AgencySpacing.sm),
          PinTabs(
            tabs: const <String>['In selected lists', 'All catalogue'],
            index: _scope,
            onChanged: (i) => setState(() => _scope = i),
          ),
          const SizedBox(height: AgencySpacing.md),
          Row(
            children: <Widget>[
              Expanded(
                child: Text('MY PROCUREMENT LISTS',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                        color: colors.contentSecondary)),
              ),
              TextButton(
                onPressed: () => context.push('/b2b/procurement-lists'),
                child: const Text('Manage Lists →'),
              ),
            ],
          ),
          ProcurementListFilterBar(
            filters: <String>[for (final l in lists) l.title],
            selected: <String>{
              for (final l in lists)
                if (_selectedListIds.contains(l.id)) l.title,
            },
            onToggle: (title) => setState(() {
              final list = lists.firstWhere((l) => l.title == title);
              if (!_selectedListIds.remove(list.id)) {
                _selectedListIds.add(list.id);
              }
              if (_selectedListIds.isNotEmpty) _scope = 0;
            }),
          ),
          const SizedBox(height: AgencySpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Expanded(
                child: Text(
                  _scope == 1
                      ? 'All catalogue'
                      : 'Products from selected lists',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary),
                ),
              ),
              Text(
                _scope == 1
                    ? '${displayed.length} SKUs'
                    : '$selectedCount ${selectedCount == 1 ? 'list' : 'lists'} selected · ${displayed.length} SKUs',
                style: TextStyle(fontSize: 11, color: colors.contentSecondary),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.sm),
          if (displayed.isEmpty)
            _emptyState(colors, selectedCount)
          else
            // 2-column x N-row grid built with intrinsic heights so cards size
            // to their content — no fixed-extent overflow, no excess whitespace,
            // and the single outer ListView remains the only vertical scroll.
            for (var i = 0; i < displayed.length; i += 2)
              Padding(
                padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
                child: IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      Expanded(child: _skuCell(displayed[i])),
                      const SizedBox(width: AgencySpacing.sm),
                      Expanded(
                        child: i + 1 < displayed.length
                            ? _skuCell(displayed[i + 1])
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),
          const SizedBox(height: AgencySpacing.md),
          _cartBar(colors, cart),
        ],
      ),
    );
  }

  Widget _skuCell(_Sku s) {
    final qty = _draftQty[s.sku] ?? s.defaultQty;
    return CompactQuickOrderSkuCard(
      title: s.title,
      sku: s.sku,
      priceLabel: s.priceLabel,
      imageUrl: s.imageUrl,
      quantity: qty,
      minQuantity: 1,
      onQuantityChanged: (v) => setState(() => _draftQty[s.sku] = v),
      onAdd: () => _addToCart(s),
      onTap: s.tradeProduct == null
          ? null
          : () => context.push('/b2b/pdp/${s.tradeProduct!.product.id}'),
    );
  }

  Widget _emptyState(AgencyColors colors, int selectedCount) {
    final message = _scope == 1
        ? (_query.trim().isEmpty
            ? 'No products in the catalogue'
            : 'No catalogue products match "${_query.trim()}".')
        : (selectedCount == 0
            ? 'Select one or more lists to view their SKUs.'
            : (_query.trim().isEmpty
                ? 'These lists are empty — open Manage Lists to add SKUs.'
                : 'No SKUs in the selected lists match "${_query.trim()}".'));
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AgencySpacing.md, vertical: AgencySpacing.xl),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        children: <Widget>[
          Icon(Icons.playlist_add, color: colors.contentSecondary),
          const SizedBox(height: AgencySpacing.sm),
          Text(message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: colors.contentSecondary)),
        ],
      ),
    );
  }

  Widget _cartBar(AgencyColors colors, B2BQuotationCart cart) {
    final count = cart.skuCount;
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              'Cart ($count ${count == 1 ? 'item' : 'items'})',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary),
            ),
          ),
          TextButton(
            onPressed: () => context.push('/b2b/quotation-cart'),
            child: const Text('View Cart →'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Procurement list detail (cart-like)
// ---------------------------------------------------------------------------

class ProcurementListDetailScreen extends ConsumerStatefulWidget {
  const ProcurementListDetailScreen({required this.listId, super.key});

  final String listId;

  @override
  ConsumerState<ProcurementListDetailScreen> createState() =>
      _ProcurementListDetailScreenState();
}

class _ProcurementListDetailScreenState
    extends ConsumerState<ProcurementListDetailScreen> {
  final Map<String, int> _quantities = <String, int>{};

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(procurementListProvider(widget.listId));
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    if (list == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Procurement List')),
        body: const Center(child: Text('List not found')),
      );
    }
    final (icon, label) = _sourceStyle(list.sourceType);
    final accent = _sourceAccent(list.sourceType, colors);
    final selectedCount =
        list.items.where((i) => (_quantities[i.sku] ?? i.quantity) > 0).length;
    return Scaffold(
      appBar: AppBar(title: Text(list.title)),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Icon(icon, size: 16, color: accent),
                    const SizedBox(width: AgencySpacing.xs),
                    Text('$label · ${list.itemCount} SKUs',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: accent)),
                  ],
                ),
                const SizedBox(height: AgencySpacing.xs),
                Text(list.description,
                    style: TextStyle(
                        fontSize: 13, color: colors.contentSecondary)),
                const SizedBox(height: AgencySpacing.md),
                for (final item in list.items) _itemRow(context, item, colors),
              ],
            ),
          ),
          _cartBar(context, colors, list, selectedCount),
        ],
      ),
    );
  }

  Widget _cartBar(BuildContext context, AgencyColors colors,
      ProcurementList list, int selectedCount) {
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        border: Border(top: BorderSide(color: colors.borderDefault)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('$selectedCount of ${list.itemCount} items selected',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.sm),
            PinWorkflowAction(
              label: 'Add Selected to Order ($selectedCount)',
              onPressed: selectedCount == 0
                  ? null
                  : () => _addSelected(list, selectedCount),
            ),
            const SizedBox(height: AgencySpacing.xs),
            TextButton(
              onPressed: () => _addAll(list),
              child: const Text('Add All to Order'),
            ),
          ],
        ),
      ),
    );
  }

  void _addSelected(ProcurementList list, int count) {
    final selected = list.items
        .where((item) => (_quantities[item.sku] ?? item.quantity) > 0);
    ref.read(b2bQuotationCartProvider.notifier).addProcurementItems(
          selected,
          quantities: _quantities,
        );
    PinToast.show(context, 'Added $count items to your order',
        tone: PinToastTone.success);
    context.push('/b2b/quotation-cart');
  }

  void _addAll(ProcurementList list) {
    for (final item in list.items) {
      _quantities[item.sku] = item.quantity;
    }
    ref
        .read(b2bQuotationCartProvider.notifier)
        .addProcurementItems(list.items, quantities: _quantities);
    PinToast.show(context, 'Added ${list.itemCount} items to your order',
        tone: PinToastTone.success);
    context.push('/b2b/quotation-cart');
  }

  Widget _itemRow(
      BuildContext context, ProcurementListItem item, AgencyColors colors) {
    final qty = _quantities[item.sku] ?? item.quantity;
    final included = qty > 0;
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.sm),
      decoration: BoxDecoration(
        color: included ? colors.surfaceRaised : colors.surfacePage,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Checkbox(
            value: included,
            activeColor: colors.actionPrimary,
            onChanged: (value) => setState(() =>
                _quantities[item.sku] = (value ?? false) ? item.quantity : 0),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(item.name,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text(item.sku,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          QuantityStepper(
            value: qty,
            min: 0,
            compact: true,
            onChanged: (v) => setState(() => _quantities[item.sku] = v),
          ),
        ],
      ),
    );
  }
}
