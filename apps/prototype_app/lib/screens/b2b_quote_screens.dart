import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../domain/models.dart';
import '../providers/b2b_trade_providers.dart';
import '../widgets/trade_product_tile.dart';

AgencyColors _c(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

Widget _label(BuildContext c, String text) {
  final colors = _c(c);
  return Padding(
    padding: const EdgeInsets.fromLTRB(
        AgencySpacing.md, AgencySpacing.lg, AgencySpacing.md, AgencySpacing.sm),
    child: Text(text,
        style: TextStyle(
            fontSize: 16,
            color: colors.contentPrimary,
            fontWeight: FontWeight.w600)),
  );
}

// ---------------------------------------------------------------------------
// B2B Trade Price PDP
// ---------------------------------------------------------------------------

class B2BTradePdpScreen extends ConsumerStatefulWidget {
  const B2BTradePdpScreen({this.productId = '', super.key});

  final String productId;

  @override
  ConsumerState<B2BTradePdpScreen> createState() => _B2BTradePdpScreenState();
}

class _B2BTradePdpScreenState extends ConsumerState<B2BTradePdpScreen> {
  int _selectedTier = 0;
  String? _selectedSellerId;
  bool _showAllSellers = false;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    final catalogue = ref.watch(tradeCatalogueProvider);
    TradeProduct? match;
    for (final item in catalogue) {
      if (item.product.id == widget.productId) {
        match = item;
        break;
      }
    }
    match ??= catalogue.isNotEmpty ? catalogue.first : null;
    if (match == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Product · Trade')),
        body: const Center(child: Text('Product not found')),
      );
    }
    final p = match;
    final sellers = p.sellers;
    final bestSeller = p.bestSeller;
    final selectedSeller = sellers.isEmpty
        ? null
        : sellers.firstWhere(
            (s) => s.id == _selectedSellerId,
            orElse: () => bestSeller ?? sellers.first,
          );

    final tiers = p.tiers;
    final tierIndex =
        tiers.isEmpty ? 0 : _selectedTier.clamp(0, tiers.length - 1);
    final tierQty = tiers.isEmpty ? p.moq : tiers[tierIndex].quantity;
    final unitPrice = selectedSeller?.unitPrice ?? p.unitPriceFor(tierQty);
    final mrp = p.mrp;

    return Scaffold(
      appBar: AppBar(title: const Text('Product · Trade')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Stack(
            children: <Widget>[
              Container(
                height: 220,
                decoration: BoxDecoration(
                  color: colors.surfacePage,
                  borderRadius: BorderRadius.circular(AgencyRadius.lg),
                ),
                clipBehavior: Clip.antiAlias,
                child: p.product.thumbnail == null
                    ? const Center(child: Icon(Icons.image_outlined, size: 48))
                    : Image.network(p.product.thumbnail!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Center(
                            child: Icon(Icons.image_outlined, size: 48))),
              ),
              Positioned(
                top: 10,
                left: 10,
                child: StockBadge(label: p.stockLabel()),
              ),
              if (p.savingsPercent != null)
                Positioned(
                  top: 10,
                  right: 10,
                  child: SavingsBadge(label: '${p.savingsPercent}% off'),
                ),
            ],
          ),
          const SizedBox(height: AgencySpacing.md),
          Text(p.product.brand ?? '',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: colors.contentSecondary)),
          const SizedBox(height: 2),
          Text(p.product.title,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Text(unitPrice.formatted,
                  style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: colors.actionPrimary)),
              const SizedBox(width: AgencySpacing.sm),
              Text('MRP ${mrp.formatted}',
                  style: TextStyle(
                      fontSize: 13,
                      color: colors.contentSecondary,
                      decoration: TextDecoration.lineThrough)),
            ],
          ),
          // ---- Seller details (multi-seller, best price default) ----
          if (selectedSeller != null) ...[
            _label(context, 'Sold by'),
            _SellerRow(
              seller: selectedSeller,
              selected: true,
              onTap: () {},
            ),
            const SizedBox(height: AgencySpacing.xs),
            if (sellers.length > 1)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () =>
                      setState(() => _showAllSellers = !_showAllSellers),
                  icon: Icon(
                    _showAllSellers ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                  ),
                  label: Text(_showAllSellers
                      ? 'Hide other sellers'
                      : 'View other sellers (${sellers.length - 1})'),
                ),
              ),
            if (_showAllSellers)
              for (final s in sellers)
                if (s.id != selectedSeller.id)
                  _SellerRow(
                    seller: s,
                    selected: false,
                    onTap: () => setState(() {
                      _selectedSellerId = s.id;
                      _showAllSellers = false;
                    }),
                  ),
          ],
          // ---- Tier pricing ----
          if (tiers.isNotEmpty) ...[
            _label(context, 'Tier pricing'),
            for (var i = 0; i < tiers.length; i++)
              _TierRow(
                qty: '${tiers[i].quantity}+ pcs',
                price: tiers[i].unitPrice.formatted,
                selected: i == tierIndex,
                onTap: () => setState(() => _selectedTier = i),
              ),
          ],
          const SizedBox(height: AgencySpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
            decoration: BoxDecoration(
              color: colors.surfaceInteractive,
              borderRadius: BorderRadius.circular(AgencyRadius.md),
            ),
            child: Row(
              children: <Widget>[
                Icon(Icons.info_outline, size: 16, color: colors.actionPrimary),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: Text('GST 18% · MOQ ${p.moq} · ${p.deliveryLocation}',
                      style: TextStyle(
                          fontSize: 11, color: colors.contentPrimary)),
                ),
              ],
            ),
          ),
          const SizedBox(height: AgencySpacing.lg),
          Row(
            children: <Widget>[
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    ref.read(b2bQuotationCartProvider.notifier).addSku(
                          sku: p.product.id,
                          name: p.product.title,
                          quantity: tierQty,
                          unitPrice: unitPrice,
                        );
                    context.push('/b2b/quotation-cart');
                  },
                  icon: const Icon(Icons.add_shopping_cart, size: 18),
                  label: const Text('Add to Cart'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    ref.read(b2bQuotationCartProvider.notifier).addSku(
                          sku: p.product.id,
                          name: p.product.title,
                          quantity: tierQty,
                          unitPrice: unitPrice,
                          seller: selectedSeller?.id,
                        );
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(
                        content: Text('${p.product.title} added to RFQ'),
                        action: SnackBarAction(
                          label: 'View RFQ',
                          onPressed: () => context.push('/b2b/rfq'),
                        ),
                      ));
                  },
                  icon: const Icon(Icons.note_add_outlined, size: 18),
                  label: const Text('RFQ'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    side: BorderSide(color: colors.borderDefault),
                    foregroundColor: colors.actionPrimary,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A single seller offer row shown in the PDP "Sold by / other sellers" list.
class _SellerRow extends StatelessWidget {
  const _SellerRow({
    required this.seller,
    required this.selected,
    this.onTap,
  });

  final TradeSupplier seller;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.md),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: selected ? colors.surfaceInteractive : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          border: Border.all(
              color: selected ? colors.actionPrimary : colors.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(seller.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                ),
                if (seller.bestPrice)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: colors.feedbackSuccess,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('Best price',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: colors.contentInverse)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: <Widget>[
                Text(seller.unitPrice.formatted,
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: colors.actionPrimary)),
                const SizedBox(width: AgencySpacing.xs),
                Text('/pc',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
                const Spacer(),
                if (seller.rating != null)
                  Row(
                    children: <Widget>[
                      Icon(Icons.star, size: 13, color: colors.feedbackWarning),
                      const SizedBox(width: 2),
                      Text(seller.rating!.toStringAsFixed(1),
                          style: TextStyle(
                              fontSize: 11, color: colors.contentSecondary)),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              <String>[
                if (seller.moq != null) 'MOQ ${seller.moq}',
                if (seller.stockQty != null) 'Stock ${seller.stockQty}',
                if (seller.deliveryLabel != null) seller.deliveryLabel!,
              ].join(' · '),
              style: TextStyle(fontSize: 11, color: colors.contentSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _TierRow extends StatelessWidget {
  const _TierRow({
    required this.qty,
    required this.price,
    this.selected = false,
    this.onTap,
  });

  final String qty;
  final String price;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.md),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.md, vertical: AgencySpacing.md),
        decoration: BoxDecoration(
          color: selected ? colors.surfaceInteractive : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          border: Border.all(
              color: selected ? colors.actionPrimary : colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(selected ? Icons.check_circle : Icons.circle_outlined,
                size: 18,
                color:
                    selected ? colors.actionPrimary : colors.contentSecondary),
            const SizedBox(width: AgencySpacing.sm),
            Text(qty,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const Spacer(),
            Text(price,
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.actionPrimary)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B RFQ workspace (multi-SKU request for quotation)
// ---------------------------------------------------------------------------

/// Single-screen, multi-SKU RFQ workspace. Buyers review the shared RFQ basket,
/// edit quantities and target unit prices inline, set delivery / required-by /
/// remarks, and either **Save Draft** or **Submit RFQ**.
///
/// Catalogue prices are read-only references; target prices are buyer-entered
/// and non-binding. Submitting never creates a purchase order or a payment.
class B2BRfqWorkspaceScreen extends ConsumerStatefulWidget {
  const B2BRfqWorkspaceScreen({super.key});

  @override
  ConsumerState<B2BRfqWorkspaceScreen> createState() =>
      _B2BRfqWorkspaceScreenState();
}

class _B2BRfqWorkspaceScreenState extends ConsumerState<B2BRfqWorkspaceScreen> {
  final Map<String, TextEditingController> _qty =
      <String, TextEditingController>{};
  final Map<String, TextEditingController> _target =
      <String, TextEditingController>{};
  final TextEditingController _remarks = TextEditingController();
  final TextEditingController _search = TextEditingController();
  String _query = '';
  DateTime? _requiredBy;

  @override
  void initState() {
    super.initState();
    final cart = ref.read(b2bQuotationCartProvider);
    _requiredBy = cart.requiredBy;
    _remarks.text = cart.remarks ?? '';
    for (final line in cart.lines) {
      _qty[line.sku] = TextEditingController(text: '${line.quantity}');
      _target[line.sku] = TextEditingController(
        text: line.targetUnitPrice == null
            ? ''
            : '${line.targetUnitPrice!.amount ~/ 100}',
      );
    }
  }

  @override
  void dispose() {
    for (final c in _qty.values) {
      c.dispose();
    }
    for (final c in _target.values) {
      c.dispose();
    }
    _remarks.dispose();
    _search.dispose();
    super.dispose();
  }

  TextEditingController _qtyFor(B2BQuotationLine line) => _qty.putIfAbsent(
        line.sku,
        () => TextEditingController(text: '${line.quantity}'),
      );

  TextEditingController _targetFor(B2BQuotationLine line) =>
      _target.putIfAbsent(
        line.sku,
        () => TextEditingController(
          text: line.targetUnitPrice == null
              ? ''
              : '${line.targetUnitPrice!.amount ~/ 100}',
        ),
      );

  void _addSku() {
    final cart = ref.read(b2bQuotationCartProvider);
    final existing = cart.lines.map((l) => l.sku).toSet();
    final candidates = ref
        .read(tradeCatalogueProvider)
        .where((p) => !existing.contains(p.product.id))
        .toList();
    if (candidates.isEmpty) {
      PinToast.show(context, 'All catalogue SKUs are already in the RFQ',
          tone: PinToastTone.warning);
      return;
    }
    ref
        .read(b2bQuotationCartProvider.notifier)
        .addTradeProduct(candidates.first);
  }

  void _saveDraft() {
    ref.read(b2bQuotationCartProvider.notifier).saveDraft();
    PinToast.show(context, 'RFQ draft saved', tone: PinToastTone.success);
  }

  void _submit() {
    final cart = ref.read(b2bQuotationCartProvider);
    if (cart.isEmpty) {
      PinToast.show(context, 'Add at least one SKU before submitting',
          tone: PinToastTone.warning);
      return;
    }
    final reference = ref.read(b2bQuotationCartProvider.notifier).submit();
    PinToast.show(context, 'RFQ $reference submitted to sellers',
        tone: PinToastTone.success);
    context.push('/b2b/quotes-received');
  }

  String get _statusLabel {
    final name = ref.read(b2bQuotationCartProvider).status.name;
    return name[0].toUpperCase() + name.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    final cart = ref.watch(b2bQuotationCartProvider);
    final notifier = ref.read(b2bQuotationCartProvider.notifier);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request Best Price'),
        actions: <Widget>[
          Padding(
            padding: const EdgeInsets.only(right: AgencySpacing.md),
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.surfaceInteractive,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(_statusLabel,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('RFQ Basket · ${cart.skuCount} SKUs',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          TextField(
            controller: _search,
            decoration: const InputDecoration(
              hintText: 'Search SKUs to add…',
              border: OutlineInputBorder(),
              isDense: true,
              prefixIcon: Icon(Icons.search, size: 18),
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
          if (_query.trim().isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            _resultsCard(colors, cart, notifier),
          ],
          const SizedBox(height: AgencySpacing.sm),
          if (cart.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.md),
              child: Column(
                children: <Widget>[
                  Icon(Icons.description_outlined,
                      size: 36, color: colors.contentSecondary),
                  const SizedBox(height: AgencySpacing.sm),
                  Text('Your RFQ basket is empty',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                  const SizedBox(height: AgencySpacing.xs),
                  Text('Search above to add SKUs and request quotes.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 12, color: colors.contentSecondary)),
                ],
              ),
            )
          else
            for (final line in cart.lines) _itemCard(colors, line, notifier),
          const SizedBox(height: AgencySpacing.xs),
          OutlinedButton.icon(
            onPressed: _addSku,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add Another SKU'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              side: BorderSide(color: colors.borderDefault),
              foregroundColor: colors.actionPrimary,
            ),
          ),
          const SizedBox(height: AgencySpacing.lg),
          _fieldLabel(colors, 'Delivery Project / Location'),
          TextFormField(
            initialValue: cart.deliveryLocation ?? '',
            decoration: const InputDecoration(
              hintText: 'Select delivery location',
              border: OutlineInputBorder(),
              isDense: true,
              prefixIcon: Icon(Icons.location_on_outlined, size: 18),
            ),
            onChanged: notifier.setDeliveryLocation,
          ),
          const SizedBox(height: AgencySpacing.md),
          PinDateTimeField(
            label: 'Required By',
            value: _requiredBy,
            onChanged: (d) {
              setState(() => _requiredBy = d);
              notifier.setRequiredBy(d);
            },
          ),
          const SizedBox(height: AgencySpacing.md),
          _fieldLabel(colors, 'Optional Remarks'),
          TextFormField(
            controller: _remarks,
            minLines: 2,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Add notes for the seller…',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: notifier.setRemarks,
          ),
          const SizedBox(height: AgencySpacing.lg),
          Row(
            children: <Widget>[
              Expanded(
                child: Text('Estimated Target Value',
                    style: TextStyle(
                        fontSize: 13, color: colors.contentSecondary)),
              ),
              Text(cart.estimatedTargetTotal.formatted,
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: colors.actionPrimary)),
            ],
          ),
          const SizedBox(height: AgencySpacing.md),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: _saveDraft,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    side: BorderSide(color: colors.borderDefault),
                    foregroundColor: colors.actionPrimary,
                  ),
                  child: const Text('Save Draft'),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: FilledButton(
                  onPressed: _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('Submit RFQ'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _fieldLabel(AgencyColors colors, String text) => Padding(
        padding: const EdgeInsets.only(bottom: AgencySpacing.xs),
        child: Text(text,
            style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
      );

  List<TradeProduct> _searchResults(B2BQuotationCart cart) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return const <TradeProduct>[];
    final inBasket = cart.lines.map((l) => l.sku).toSet();
    return ref
        .read(tradeCatalogueProvider)
        .where((p) =>
            !inBasket.contains(p.product.id) &&
            (p.product.title.toLowerCase().contains(q) ||
                (p.product.brand ?? '').toLowerCase().contains(q) ||
                p.product.id.toLowerCase().contains(q)))
        .take(6)
        .toList();
  }

  Widget _resultsCard(AgencyColors colors, B2BQuotationCart cart,
      B2BQuotationCartNotifier notifier) {
    final results = _searchResults(cart);
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: results.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(AgencySpacing.md),
              child: Text('No matching SKUs',
                  style:
                      TextStyle(fontSize: 12, color: colors.contentSecondary)),
            )
          : Material(
              type: MaterialType.transparency,
              child: Column(
                children: <Widget>[
                  for (final r in results)
                    ListTile(
                      dense: true,
                      title: Text(r.product.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13, color: colors.contentPrimary)),
                      subtitle: Text(
                          '${r.product.brand ?? ''} · ${r.unitPriceFor(r.moq).formatted}',
                          style: TextStyle(
                              fontSize: 11, color: colors.contentSecondary)),
                      trailing: Icon(Icons.add_circle_outline,
                          color: colors.actionPrimary),
                      onTap: () {
                        notifier.addTradeProduct(r);
                        _search.clear();
                        setState(() => _query = '');
                        PinToast.show(
                            context, '${r.product.title} added to RFQ',
                            tone: PinToastTone.success);
                      },
                    ),
                ],
              ),
            ),
    );
  }

  Widget _itemCard(AgencyColors colors, B2BQuotationLine line,
      B2BQuotationCartNotifier notifier) {
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
                child: Text(line.name,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
              IconButton(
                tooltip: 'Remove ${line.name}',
                visualDensity: VisualDensity.compact,
                onPressed: () => notifier.remove(line.sku),
                icon: Icon(Icons.delete_outline,
                    size: 18, color: colors.contentSecondary),
              ),
            ],
          ),
          Text('Current Dealer Price ${line.unitPrice.formatted}/unit',
              style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: _inlineField(
                  colors: colors,
                  label: 'Qty',
                  controller: _qtyFor(line),
                  onChanged: (v) {
                    final q = int.tryParse(v.trim());
                    if (q != null && q > 0) {
                      notifier.updateQuantity(line.sku, q);
                    }
                  },
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: _inlineField(
                  colors: colors,
                  label: 'Target Price ₹',
                  controller: _targetFor(line),
                  prefix: '₹',
                  onChanged: (v) {
                    final t = int.tryParse(v.trim());
                    notifier.setTargetPrice(
                      line.sku,
                      t == null || t <= 0
                          ? null
                          : Money(amount: t * 100, currencyCode: 'INR'),
                    );
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _inlineField({
    required AgencyColors colors,
    required String label,
    required TextEditingController controller,
    required ValueChanged<String> onChanged,
    String? prefix,
  }) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              isDense: true,
              prefixText: prefix,
              border: const OutlineInputBorder(),
            ),
            onChanged: onChanged,
          ),
        ],
      );
}

// ---------------------------------------------------------------------------
// B2B Quotes Received
// ---------------------------------------------------------------------------

class B2BQuotesReceivedScreen extends StatelessWidget {
  const B2BQuotesReceivedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Quotes Received')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          _QuoteOffer(
              seller: 'Ceramica Traders', amount: '₹1,42,000', time: '2h ago'),
          _QuoteOffer(
              seller: 'TileHub Supplies',
              amount: '₹1,38,500',
              time: '5h ago',
              bestPrice: true),
          _QuoteOffer(seller: 'BuildMart', amount: '₹1,47,200', time: '1d ago'),
          const SizedBox(height: AgencySpacing.lg),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => context.push('/b2b/quote-compare'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(color: colors.borderDefault),
              ),
              child: Text('Compare quotes',
                  style: TextStyle(color: colors.actionPrimary)),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuoteOffer extends StatelessWidget {
  const _QuoteOffer({
    required this.seller,
    required this.amount,
    required this.time,
    this.bestPrice = false,
  });

  final String seller;
  final String amount;
  final String time;
  final bool bestPrice;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: bestPrice ? colors.surfaceInteractive : colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border:
            Border.all(color: bestPrice ? colors.trust : colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          CircleAvatar(
            backgroundColor: colors.surfaceInteractive,
            child: Icon(Icons.storefront_outlined,
                size: 18, color: colors.actionPrimary),
          ),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Flexible(
                      child: Text(seller,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: colors.contentPrimary)),
                    ),
                    if (bestPrice) ...<Widget>[
                      const SizedBox(width: AgencySpacing.sm),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: colors.trust,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('Best price',
                            style: TextStyle(
                                fontSize: 9,
                                color: colors.contentInverse,
                                fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ],
                ),
                Text(time,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Text(amount,
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: bestPrice ? colors.trust : colors.contentPrimary)),
          const SizedBox(width: AgencySpacing.xs),
          Icon(Icons.chevron_right, size: 18, color: colors.contentSecondary),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Quote Compare
// ---------------------------------------------------------------------------

class B2BQuoteCompareScreen extends StatelessWidget {
  const B2BQuoteCompareScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Compare Quotes')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              child: Table(
                border: TableBorder.all(color: colors.borderDefault),
                columnWidths: const <int, TableColumnWidth>{
                  0: FlexColumnWidth(1.2),
                  1: FlexColumnWidth(),
                  2: FlexColumnWidth(),
                },
                children: <TableRow>[
                  _header(context, 'Attribute', 'Ceramica', 'TileHub'),
                  _row(context, 'Unit price', '₹710', '₹748'),
                  _row(context, 'GST', '₹690', '₹727'),
                  _row(context, 'Delivery', '₹705', '₹743'),
                  _row(context, 'Total', '₹1,42,000', '₹1,38,500'),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/b2b/chat'),
                    icon: const Icon(Icons.forum_outlined, size: 18),
                    label: const Text('Chat with seller'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      side: BorderSide(color: colors.borderDefault),
                      foregroundColor: colors.actionPrimary,
                    ),
                  ),
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: FilledButton(
                    onPressed: () => context.push('/b2b/accept-quote'),
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Accept TileHub'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  TableRow _header(BuildContext context, String a, String b, String c2) {
    final colors = _c(context);
    return TableRow(
      decoration: BoxDecoration(color: colors.surfaceInteractive),
      children: [
        _cell(context, a, bold: true),
        _cell(context, b, bold: true),
        _cell(context, c2, bold: true, highlight: true),
      ],
    );
  }

  TableRow _row(BuildContext context, String a, String b, String c2) {
    return TableRow(children: [
      _cell(context, a),
      _cell(context, b),
      _cell(context, c2, highlight: true),
    ]);
  }

  Widget _cell(BuildContext context, String text,
      {bool bold = false, bool highlight = false}) {
    final colors = _c(context);
    return Container(
      color: highlight ? colors.trust.withValues(alpha: 0.08) : null,
      padding: const EdgeInsets.all(AgencySpacing.sm),
      child: Text(text,
          style: TextStyle(
              fontSize: 12,
              color: highlight && bold ? colors.trust : colors.contentPrimary,
              fontWeight: bold ? FontWeight.w600 : FontWeight.w400)),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Accept Quote
// ---------------------------------------------------------------------------

class B2BAcceptQuoteScreen extends ConsumerWidget {
  const B2BAcceptQuoteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Accept Quote')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(AgencySpacing.lg),
            decoration: BoxDecoration(
              color: colors.surfaceInteractive,
              borderRadius: BorderRadius.circular(AgencyRadius.lg),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('TileHub Supplies',
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: AgencySpacing.sm),
                Text('₹1,38,500',
                    style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary)),
                const SizedBox(height: AgencySpacing.xs),
                Text('incl. GST · delivery to Site A',
                    style: TextStyle(
                        fontSize: 12, color: colors.contentSecondary)),
                const SizedBox(height: AgencySpacing.xs),
                Text('Valid till 30 Sep',
                    style:
                        TextStyle(fontSize: 12, color: colors.feedbackWarning)),
              ],
            ),
          ),
          const SizedBox(height: AgencySpacing.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                ref.read(b2bQuotationCartProvider.notifier).addSku(
                      sku: 'quote_tilehub_tiles',
                      name: 'TileHub ceramic tile package',
                      quantity: 200,
                      unitPrice: const Money(
                        amount: 58700,
                        currencyCode: 'INR',
                      ),
                    );
                context.push('/b2b/quotation-cart');
              },
              style: FilledButton.styleFrom(
                backgroundColor: colors.actionPrimary,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Convert to Order'),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Quotation Cart
// ---------------------------------------------------------------------------

class B2BQuotationCartScreen extends ConsumerWidget {
  const B2BQuotationCartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final cart = ref.watch(b2bQuotationCartProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Quotation Cart')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                // ---- Section 1 · Cart + related merchandising ---------------
                _sectionLabel(context, 'Your order'),
                if (cart.isEmpty)
                  _emptyCart(context, colors)
                else ...<Widget>[
                  for (final line in cart.lines) _cartLine(context, ref, line),
                  const Divider(height: AgencySpacing.xl),
                  _totalLine(context, 'Subtotal', cart.subtotal.formatted),
                  _totalLine(context, 'GST 18%', cart.gst.formatted),
                  _totalLine(context, 'Total', cart.total.formatted,
                      bold: true),
                ],
                const SizedBox(height: AgencySpacing.sm),
                const _RelatedProductsRail(),
                const SizedBox(height: AgencySpacing.lg),
                // ---- Section 2 · Request Quotation --------------------------
                _requestQuotation(context),
              ],
            ),
          ),
          if (!cart.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AgencySpacing.md),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.push('/b2b/checkout'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('Proceed to Checkout'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _sectionLabel(BuildContext context, String text) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: Text(text,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.contentPrimary)),
    );
  }

  Widget _emptyCart(BuildContext context, AgencyColors colors) => Container(
        padding: const EdgeInsets.all(AgencySpacing.lg),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Column(
          children: <Widget>[
            Icon(Icons.shopping_cart_outlined,
                size: 36, color: colors.contentSecondary),
            const SizedBox(height: AgencySpacing.sm),
            Text('Your cart is empty',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: AgencySpacing.xs),
            Text('Add items from Quick Order, or request a quotation below.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.sm),
            OutlinedButton(
              onPressed: () => context.push('/b2b/quick-order'),
              child: const Text('Return to Quick Order'),
            ),
          ],
        ),
      );

  Widget _requestQuotation(BuildContext context) {
    final colors = _c(context);
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(Icons.note_add_outlined,
                  size: 18, color: colors.actionPrimary),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: Text('Request Quotation',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          Text('Search and add SKUs, then request quotes from sellers.',
              style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.sm),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.push('/b2b/rfq'),
              icon: const Icon(Icons.search, size: 18),
              label: const Text('Start Request Quotation'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
                side: BorderSide(color: colors.borderDefault),
                foregroundColor: colors.actionPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _cartLine(BuildContext context, WidgetRef ref, B2BQuotationLine line) {
    final colors = _c(context);
    final notifier = ref.read(b2bQuotationCartProvider.notifier);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: colors.surfacePage,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
            ),
            child: Icon(Icons.image_outlined,
                size: 22, color: colors.contentSecondary),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(line.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                Text(
                    '${line.total.formatted} · ${line.unitPrice.formatted}/unit',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Decrease ${line.name}',
            onPressed: () =>
                notifier.updateQuantity(line.sku, line.quantity - 1),
            icon: const Icon(Icons.remove),
          ),
          Text('${line.quantity}', style: AgencyText.label),
          IconButton(
            tooltip: 'Increase ${line.name}',
            onPressed: () =>
                notifier.updateQuantity(line.sku, line.quantity + 1),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }

  Widget _totalLine(BuildContext context, String label, String amount,
      {bool bold = false}) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: bold ? 14 : 13,
                    color: colors.contentSecondary,
                    fontWeight: bold ? FontWeight.w600 : FontWeight.w400)),
          ),
          Text(amount,
              style: TextStyle(
                  fontSize: bold ? 16 : 13,
                  color: colors.contentPrimary,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Checkout
// ---------------------------------------------------------------------------

class B2BCheckoutScreen extends ConsumerWidget {
  const B2BCheckoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final cart = ref.watch(b2bQuotationCartProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Business Checkout')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                _field(context, 'Delivery site', 'Site A — Main block'),
                _field(context, 'PO number', 'PO-3392'),
                _field(context, 'Payment', 'On credit (30 days)'),
                _field(context, 'GST invoice', 'GSTIN 27ABCDE1234F1Z5'),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: Column(
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Text('Total',
                        style: TextStyle(
                            fontSize: 14, color: colors.contentSecondary)),
                    const Spacer(),
                    Text(cart.total.formatted,
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                  ],
                ),
                const SizedBox(height: AgencySpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => context.push('/b2b/confirm'),
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Place Business Order'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(BuildContext context, String label, String value) {
    final colors = _c(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          ),
          Text(value,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Confirm Order
// ---------------------------------------------------------------------------

class B2BConfirmOrderScreen extends ConsumerWidget {
  const B2BConfirmOrderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final cart = ref.watch(b2bQuotationCartProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Order Confirmed')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          const SizedBox(height: AgencySpacing.lg),
          Icon(Icons.check_circle_outline,
              size: 64, color: colors.feedbackSuccess),
          const SizedBox(height: AgencySpacing.md),
          Center(
            child: Text('Purchase order placed',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
          ),
          const SizedBox(height: AgencySpacing.xs),
          Center(
            child: Text('PO-3392 · GST invoice raised',
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          ),
          const SizedBox(height: AgencySpacing.lg),
          _confirmLine(context, 'Subtotal', cart.subtotal.formatted),
          _confirmLine(context, 'GST 18%', cart.gst.formatted),
          _confirmLine(context, 'Total', cart.total.formatted, bold: true),
          const SizedBox(height: AgencySpacing.lg),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => context.push('/b2b/gst-invoices'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(color: colors.borderDefault),
              ),
              child: Text('View GST Invoice',
                  style: TextStyle(color: colors.actionPrimary)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _confirmLine(BuildContext context, String label, String amount,
      {bool bold = false}) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label,
                style: TextStyle(fontSize: 13, color: colors.contentSecondary)),
          ),
          Text(amount,
              style: TextStyle(
                  fontSize: bold ? 16 : 13,
                  color: colors.contentPrimary,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Create RFQ
// ---------------------------------------------------------------------------

/// Quote-to-order journey entry point. Submits a request for quote; the buyer
/// then compares seller quotes.
class B2BCreateRfqScreen extends StatelessWidget {
  const B2BCreateRfqScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Create RFQ')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('Request quotes from multiple sellers',
              style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.md),
          PinRFQForm(
            onSubmit: (material, quantity, targetPrice) {
              if (material.trim().isEmpty || quantity.trim().isEmpty) {
                PinToast.show(context, 'Add a material and quantity first',
                    tone: PinToastTone.warning);
                return;
              }
              PinToast.show(context, 'RFQ submitted to sellers',
                  tone: PinToastTone.success);
              context.push('/b2b/quotes-received');
            },
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B cart · related products merchandising rail
// ---------------------------------------------------------------------------

/// "You may also like" rail for the B2B cart. Reuses the single shared trade
/// product tile so related merchandising matches B2B Home / Catalogue exactly.
class _RelatedProductsRail extends ConsumerStatefulWidget {
  const _RelatedProductsRail();

  @override
  ConsumerState<_RelatedProductsRail> createState() =>
      _RelatedProductsRailState();
}

class _RelatedProductsRailState extends ConsumerState<_RelatedProductsRail> {
  final Map<String, int> _qty = <String, int>{};
  final Map<String, int> _tier = <String, int>{};

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(b2bQuotationCartProvider);
    final inCart = cart.lines.map((line) => line.sku).toSet();
    final related = ref
        .watch(tradeCatalogueProvider)
        .where((p) => !inCart.contains(p.product.id))
        .take(6)
        .toList();
    if (related.isEmpty) return const SizedBox.shrink();
    return MerchandisingUnitCard(
      title: 'You may also like',
      onSeeAll: () => context.push('/b2b/catalogue'),
      child: SizedBox(
        height: kB2bProductCardExtent,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: related.length,
          separatorBuilder: (_, __) => const SizedBox(width: AgencySpacing.sm),
          itemBuilder: (context, i) {
            final p = related[i];
            final selected = _tier[p.product.id] ?? 0;
            final defaultQty = p.tiers.isEmpty
                ? p.moq
                : p.tiers[selected.clamp(0, p.tiers.length - 1)].quantity;
            final qty = _qty[p.product.id] ?? defaultQty;
            return SizedBox(
              width: 175,
              child: tradeProductTile(
                context,
                ref,
                p,
                selectedTierIndex: selected,
                onTierSelected: (t) => setState(() {
                  _tier[p.product.id] = t;
                  _qty.remove(p.product.id);
                }),
                quantity: qty,
                onQuantityChanged: (v) =>
                    setState(() => _qty[p.product.id] = v),
              ),
            );
          },
        ),
      ),
    );
  }
}
