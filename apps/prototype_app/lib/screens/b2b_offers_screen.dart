import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/trade_offers_providers.dart';
import '../widgets/trade_product_tile.dart';

/// Which sort option is active on the offers grid.
enum _OfferSort { recommended, priceAsc, priceDesc, discount }

/// Trade Offers & Deals — full browsing page.
///
/// A backend-configurable collection selector drives a single 2×N product grid.
/// Selecting a collection refreshes the grid in place (no per-collection page).
class TradeOffersPage extends ConsumerStatefulWidget {
  const TradeOffersPage({this.initialCollectionId, super.key});

  final String? initialCollectionId;

  @override
  ConsumerState<TradeOffersPage> createState() => _TradeOffersPageState();
}

class _TradeOffersPageState extends ConsumerState<TradeOffersPage> {
  final TextEditingController _search = TextEditingController();
  String _query = '';
  String? _selectedId;
  _OfferSort _sort = _OfferSort.recommended;
  final Map<String, int> _selectedTier = <String, int>{};
  final Map<String, int> _qty = <String, int>{};

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<TradeProduct> _applySort(List<TradeProduct> products) {
    final list = List<TradeProduct>.of(products);
    switch (_sort) {
      case _OfferSort.recommended:
        break;
      case _OfferSort.priceAsc:
        list.sort((a, b) => a.tradePrice.amount.compareTo(b.tradePrice.amount));
      case _OfferSort.priceDesc:
        list.sort((a, b) => b.tradePrice.amount.compareTo(a.tradePrice.amount));
      case _OfferSort.discount:
        list.sort((a, b) =>
            (b.savingsPercent ?? 0).compareTo(a.savingsPercent ?? 0));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final collections = ref.watch(tradeOfferCollectionsProvider);
    final initial = (widget.initialCollectionId ?? '').isEmpty
        ? null
        : widget.initialCollectionId;
    final selectedId = _selectedId ??
        initial ??
        (collections.isNotEmpty ? collections.first.id : null);
    final selected =
        collections.where((c) => c.id == selectedId).firstOrNull;
    var products = selectedId == null
        ? const <TradeProduct>[]
        : ref.watch(tradeOffersForCollectionProvider(selectedId));
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      products = products
          .where((p) =>
              p.product.title.toLowerCase().contains(q) ||
              (p.product.brand?.toLowerCase().contains(q) ?? false))
          .toList();
    }
    products = _applySort(products);

    return Scaffold(
      appBar: AppBar(title: const Text('Trade Offers & Deals')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          PinSearch(
            controller: _search,
            hintText: 'Search products / offers',
            onChanged: (v) => setState(() => _query = v),
            onSubmitted: (v) => setState(() => _query = v),
          ),
          const SizedBox(height: AgencySpacing.md),
          Text('OFFER & DEAL COLLECTIONS',
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.sm),
          Wrap(
            spacing: AgencySpacing.sm,
            runSpacing: AgencySpacing.sm,
            children: <Widget>[
              for (final c in collections)
                TradeFilterChip(
                  label: c.title,
                  selected: c.id == selectedId,
                  onTap: () => setState(() {
                    _selectedId = c.id;
                    _selectedTier.clear();
                    _qty.clear();
                  }),
                ),
            ],
          ),
          const SizedBox(height: AgencySpacing.md),
          Row(
            children: <Widget>[
              Expanded(
                child: Text('Selected Collection: ${selected?.title ?? '—'}',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
              Text('${products.length} Products',
                  style: TextStyle(
                      fontSize: 12, color: colors.contentSecondary)),
            ],
          ),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickSort,
                  icon: const Icon(Icons.swap_vert, size: 16),
                  label: Text('Sort: ${_sortLabel(_sort)}',
                      style: const TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                    side: BorderSide(color: colors.borderDefault),
                    foregroundColor: colors.actionPrimary,
                  ),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => PinToast.show(context,
                      'Filters apply to this collection only',
                      tone: PinToastTone.info),
                  icon: const Icon(Icons.tune, size: 16),
                  label: const Text('Filter', style: TextStyle(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                    side: BorderSide(color: colors.borderDefault),
                    foregroundColor: colors.actionPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.md),
          if (products.isEmpty)
            _emptyState(colors, selected?.title)
          else
            GridView.builder(
              shrinkWrap: true,
              primary: false,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AgencySpacing.sm,
                crossAxisSpacing: AgencySpacing.sm,
                mainAxisExtent: kB2bProductCardExtent,
              ),
              itemCount: products.length,
              itemBuilder: (context, i) => _card(products[i]),
            ),
          const SizedBox(height: AgencySpacing.md),
          if (products.isNotEmpty)
            PinWorkflowAction(
              label: 'Load More',
              hierarchy: PinWorkflowHierarchy.secondary,
              onPressed: () => PinToast.show(context, 'No more products',
                  tone: PinToastTone.info),
            ),
        ],
      ),
    );
  }

  String _sortLabel(_OfferSort s) => switch (s) {
        _OfferSort.recommended => 'Recommended',
        _OfferSort.priceAsc => 'Price ↑',
        _OfferSort.priceDesc => 'Price ↓',
        _OfferSort.discount => 'Discount',
      };

  Future<void> _pickSort() async {
    final choice = await PinDialog.sheet<_OfferSort>(
      context,
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Sort by',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AgencySpacing.sm),
            for (final s in _OfferSort.values)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(s == _sort
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked),
                title: Text(_sortLabel(s)),
                onTap: () => Navigator.of(context).pop(s),
              ),
          ],
        ),
      ),
    );
    if (choice != null && mounted) setState(() => _sort = choice);
  }

  Widget _card(TradeProduct p) {
    final tiers = p.tiers
        .map((t) => TradeTierOption(
              quantity: t.quantity,
              priceLabel: t.unitPrice.formatted,
            ))
        .toList();
    final selected = _selectedTier[p.product.id] ?? 0;
    final defaultQty = tiers.isEmpty ? p.moq : tiers[selected].quantity;
    final qty = _qty[p.product.id] ?? defaultQty;
    return tradeProductTile(
      context,
      ref,
      p,
      selectedTierIndex: selected,
      onTierSelected: (i) => setState(() {
        _selectedTier[p.product.id] = i;
        _qty.remove(p.product.id);
      }),
      quantity: qty,
      onQuantityChanged: (v) => setState(() => _qty[p.product.id] = v),
    );
  }

  Widget _emptyState(AgencyColors colors, String? title) {
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
          Icon(Icons.local_offer_outlined, color: colors.contentSecondary),
          const SizedBox(height: AgencySpacing.sm),
          Text(
            _query.trim().isEmpty
                ? 'No products in "${title ?? 'this collection'}" yet.'
                : 'No products match "$_query".',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: colors.contentSecondary),
          ),
        ],
      ),
    );
  }
}
