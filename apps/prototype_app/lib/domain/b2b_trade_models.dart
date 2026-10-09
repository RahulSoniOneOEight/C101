import 'models.dart';

/// B2B trade domain models for the BuildKart trade dashboard.
///
/// These extend the D2C catalogue with trade-specific fields (MOQ, quantity
/// tiers, dealer price, stock, delivery location, scheme) without changing the
/// existing [Product] API or the D2C flow.

/// A quantity-tier trade price (e.g. 50 pcs @ ₹985).
class TradeTier {
  const TradeTier({required this.quantity, required this.unitPrice});

  final int quantity;
  final Money unitPrice;
}

/// Badge type for a trade scheme.
enum TradeSchemeBadgeType { freeGoods, cashOffer, creditScheme }

/// Merchandising tag for a trade product tile (maps to the B2C "Bestseller" /
/// "Premium" tags).
enum TradeTagType { bestseller, premium }

/// An active trade scheme / offer shown on the dashboard.
class TradeScheme {
  const TradeScheme({
    required this.title,
    required this.detail,
    required this.badge,
  });

  final String title;
  final String detail;
  final TradeSchemeBadgeType badge;
}

/// A single line in a previous B2B order (enough to rebuild a cart line).
class B2BOrderLine {
  const B2BOrderLine({
    required this.sku,
    required this.name,
    required this.quantity,
    required this.unitPrice,
  });

  final String sku;
  final String name;
  final int quantity;
  final Money unitPrice;

  Money get total => Money(
        amount: unitPrice.amount * quantity,
        currencyCode: unitPrice.currencyCode,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sku': sku,
        'name': name,
        'quantity': quantity,
        'unit_price': unitPrice.toJson(),
      };

  factory B2BOrderLine.fromJson(Map<String, dynamic> j) => B2BOrderLine(
        sku: j['sku'] as String? ?? '',
        name: j['name'] as String? ?? '',
        quantity: (j['quantity'] as num?)?.toInt() ?? 1,
        unitPrice: _moneyFromJson(j['unit_price']),
      );
}

/// A previous B2B order available for quick reorder.
///
/// [lines] carries the full order so "Reorder" can drop the **entire** previous
/// order into the cart (not a token subset).
class B2BOrder {
  const B2BOrder({
    required this.reference,
    required this.dateLabel,
    required this.itemSummary,
    required this.total,
    this.lines = const <B2BOrderLine>[],
    this.deliveryLocation,
  });

  final String reference;
  final String dateLabel;
  final String itemSummary;
  final Money total;
  final List<B2BOrderLine> lines;
  final String? deliveryLocation;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'reference': reference,
        'date_label': dateLabel,
        'item_summary': itemSummary,
        'total': total.toJson(),
        'lines': lines.map((l) => l.toJson()).toList(),
        if (deliveryLocation != null) 'delivery_location': deliveryLocation,
      };

  factory B2BOrder.fromJson(Map<String, dynamic> j) => B2BOrder(
        reference: j['reference'] as String? ?? '',
        dateLabel: j['date_label'] as String? ?? '',
        itemSummary: j['item_summary'] as String? ?? '',
        total: _moneyFromJson(j['total']),
        lines: (j['lines'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(B2BOrderLine.fromJson)
            .toList(),
        deliveryLocation: j['delivery_location'] as String?,
      );
}

/// A seller (supplier) offer for a trade product.
///
/// A single SKU can be supplied by several sellers at different prices/MOQs.
/// The buyer sees the **best-price** seller by default and can compare the rest
/// on the product page.
class TradeSupplier {
  const TradeSupplier({
    required this.id,
    required this.name,
    required this.unitPrice,
    this.moq,
    this.stockQty,
    this.rating,
    this.deliveryLabel,
    this.bestPrice = false,
  });

  final String id;
  final String name;
  final Money unitPrice;
  final int? moq;
  final int? stockQty;
  final double? rating;
  final String? deliveryLabel;

  /// Marker for the default (lowest-price) seller.
  final bool bestPrice;
}

/// A trade product = the D2C [Product] plus trade attributes.
class TradeProduct {
  const TradeProduct({
    required this.product,
    required this.tradePrice,
    required this.moq,
    required this.stockQty,
    required this.deliveryLocation,
    this.categoryId = 'all',
    this.seasonal = false,
    this.tiers = const <TradeTier>[],
    this.scheme,
    this.tag,
    this.sellers = const <TradeSupplier>[],
  });

  final Product product;
  final Money tradePrice;
  final int moq;
  final int stockQty;
  final String deliveryLocation;

  /// Trade category id this product belongs to (matches [TradeCategory.id]).
  final String categoryId;

  /// Whether this product is part of a seasonal merchandising campaign.
  final bool seasonal;

  final List<TradeTier> tiers;
  final TradeScheme? scheme;
  final TradeTagType? tag;

  /// Seller offers for this SKU (best price first is not guaranteed — use
  /// [bestSeller]). Empty when seller data is unavailable.
  final List<TradeSupplier> sellers;

  Money get mrp => product.mrp ?? tradePrice;

  /// The lowest-priced seller offer, or null when no seller data is present.
  TradeSupplier? get bestSeller {
    if (sellers.isEmpty) return null;
    var best = sellers.first;
    for (final s in sellers) {
      if (s.unitPrice.amount < best.unitPrice.amount) best = s;
    }
    return best;
  }

  TradeProduct copyWith({List<TradeSupplier>? sellers}) => TradeProduct(
        product: product,
        tradePrice: tradePrice,
        moq: moq,
        stockQty: stockQty,
        deliveryLocation: deliveryLocation,
        categoryId: categoryId,
        seasonal: seasonal,
        tiers: tiers,
        scheme: scheme,
        tag: tag,
        sellers: sellers ?? this.sellers,
      );

  /// Savings vs MRP at the base trade price, or null when no discount.
  int? get savingsPercent {
    final original = mrp.amount;
    if (original <= 0 || tradePrice.amount >= original) return null;
    return (((original - tradePrice.amount) / original) * 100).round();
  }

  /// Unit price for a given quantity, applying the best applicable tier.
  Money unitPriceFor(int quantity) {
    Money best = tradePrice;
    for (final tier in tiers) {
      if (quantity >= tier.quantity) best = tier.unitPrice;
    }
    return best;
  }

  /// Total order value for a given quantity.
  Money totalFor(int quantity) {
    final unit = unitPriceFor(quantity);
    return Money(
        amount: unit.amount * quantity, currencyCode: unit.currencyCode);
  }

  String stockLabel() => stockQty > 0 ? 'In Stock ($stockQty)' : 'Out of Stock';
}

/// The four B2B primary destinations shown in the bottom navigation.
enum B2BTab { trade, credit, orders, account }

/// Where a [ProcurementList] originates. Drives the source pill + accent in the
/// UI and lets the backend/buyer personalisation rank or filter lists.
enum ProcurementListSourceType {
  /// Configured by merchandising/backend (curated bundles).
  backendCurated,

  /// Saved by this buyer for repeat buying.
  buyerSaved,

  /// Ranked for this buyer by personalisation logic.
  personalized,

  /// Seasonal / campaign-driven bundle.
  seasonal,

  /// Category restock bundle (e.g. electrical, plumbing).
  categoryBased,
}

/// The primary action a buyer can take on a procurement list.
enum ProcurementListAction { view, addAll, useList }

/// A single line inside a procurement list (SKU + name + suggested quantity).
class ProcurementListItem {
  const ProcurementListItem({
    required this.sku,
    required this.name,
    required this.quantity,
    this.unitPrice,
  });

  final String sku;
  final String name;
  final int quantity;
  final Money? unitPrice;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sku': sku,
        'name': name,
        'quantity': quantity,
        if (unitPrice != null) 'unit_price': unitPrice!.amount,
        if (unitPrice != null) 'currency': unitPrice!.currencyCode,
      };

  factory ProcurementListItem.fromJson(Map<String, dynamic> j) {
    final amount = j['unit_price'] as num?;
    return ProcurementListItem(
      sku: j['sku'] as String? ?? '',
      name: j['name'] as String? ?? '',
      quantity: (j['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: amount == null
          ? null
          : Money(
              amount: amount.toInt(),
              currencyCode: j['currency'] as String? ?? 'INR'),
    );
  }
}

/// A reusable / suggested procurement list surfaced in the Quick Order Center.
///
/// List definitions are data-driven: they come from the backend (curated,
/// seasonal, category) or from the buyer (saved) and are never hardcoded in the
/// UI. The Flutter widgets render whatever the provider supplies.
class ProcurementList {
  const ProcurementList({
    required this.id,
    required this.title,
    required this.description,
    required this.sourceType,
    required this.items,
    this.campaignRef,
    this.personalizationReason,
    this.action = ProcurementListAction.view,
  });

  final String id;
  final String title;
  final String description;
  final ProcurementListSourceType sourceType;
  final List<ProcurementListItem> items;
  final String? campaignRef;
  final String? personalizationReason;
  final ProcurementListAction action;

  int get itemCount => items.length;

  ProcurementList copyWith({
    String? title,
    String? description,
    List<ProcurementListItem>? items,
    ProcurementListAction? action,
  }) =>
      ProcurementList(
        id: id,
        title: title ?? this.title,
        description: description ?? this.description,
        sourceType: sourceType,
        items: items ?? this.items,
        campaignRef: campaignRef,
        personalizationReason: personalizationReason,
        action: action ?? this.action,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'description': description,
        'source_type': sourceType.name,
        'items': items.map((i) => i.toJson()).toList(),
        'campaign_ref': campaignRef,
        'personalization_reason': personalizationReason,
        'action': action.name,
      };

  factory ProcurementList.fromJson(Map<String, dynamic> j) => ProcurementList(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        sourceType: ProcurementListSourceType.values.firstWhere(
            (s) => s.name == j['source_type'],
            orElse: () => ProcurementListSourceType.buyerSaved),
        items: (j['items'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ProcurementListItem.fromJson)
            .toList(),
        campaignRef: j['campaign_ref'] as String?,
        personalizationReason: j['personalization_reason'] as String?,
        action: ProcurementListAction.values.firstWhere(
            (a) => a.name == j['action'],
            orElse: () => ProcurementListAction.view),
      );
}

/// Lifecycle of a B2B request for quotation. Mirrors the Penpot
/// Draft/Submitted/Quoted/Accepted/Rejected/Expired states.
enum RfqStatus { draft, submitted, quoted, accepted, rejected, expired }

/// A persisted line in the buyer's B2B RFQ / quotation cart.
class B2BQuotationLine {
  const B2BQuotationLine({
    required this.sku,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    this.targetUnitPrice,
    this.seller,
  });

  final String sku;
  final String name;
  final int quantity;

  /// Current catalogue dealer price (read-only reference value).
  final Money unitPrice;

  /// Buyer-entered target unit price. **Not** a confirmed selling price.
  final Money? targetUnitPrice;

  /// Optional seller context, part of the RFQ line's merge identity.
  final String? seller;

  Money get total => Money(
        amount: unitPrice.amount * quantity,
        currencyCode: unitPrice.currencyCode,
      );

  Money? get targetTotal => targetUnitPrice == null
      ? null
      : Money(
          amount: targetUnitPrice!.amount * quantity,
          currencyCode: targetUnitPrice!.currencyCode,
        );

  B2BQuotationLine copyWith({int? quantity, Money? targetUnitPrice}) =>
      B2BQuotationLine(
        sku: sku,
        name: name,
        quantity: quantity ?? this.quantity,
        unitPrice: unitPrice,
        targetUnitPrice: targetUnitPrice ?? this.targetUnitPrice,
        seller: seller,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'sku': sku,
        'name': name,
        'quantity': quantity,
        'unit_price': unitPrice.toJson(),
        if (targetUnitPrice != null)
          'target_unit_price': targetUnitPrice!.toJson(),
        if (seller != null) 'seller': seller,
      };

  factory B2BQuotationLine.fromJson(Map<String, dynamic> j) => B2BQuotationLine(
        sku: j['sku'] as String? ?? '',
        name: j['name'] as String? ?? '',
        quantity: (j['quantity'] as num?)?.toInt() ?? 1,
        unitPrice: _moneyFromJson(j['unit_price']),
        targetUnitPrice: j['target_unit_price'] == null
            ? null
            : _moneyFromJson(j['target_unit_price']),
        seller: j['seller'] as String?,
      );
}

Money _moneyFromJson(Object? raw) {
  final map = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
  return Money(
    amount: (map['amount'] as num?)?.toInt() ?? 0,
    currencyCode: map['currency_code'] as String? ?? 'INR',
  );
}

/// The editable B2B RFQ draft shared by direct add, lists and reorder flows.
///
/// A draft persists buyer intent (quantities, target prices, delivery, date,
/// remarks) until it is submitted. Submission never creates an order or a
/// payment on its own.
class B2BQuotationCart {
  const B2BQuotationCart({
    this.lines = const <B2BQuotationLine>[],
    this.status = RfqStatus.draft,
    this.deliveryLocation,
    this.requiredBy,
    this.remarks,
    this.reference,
  });

  final List<B2BQuotationLine> lines;
  final RfqStatus status;
  final String? deliveryLocation;
  final DateTime? requiredBy;
  final String? remarks;
  final String? reference;

  bool get isEmpty => lines.isEmpty;

  int get skuCount => lines.length;

  bool get hasAnyTargetPrice =>
      lines.any((line) => line.targetUnitPrice != null);

  Money get subtotal => Money(
        amount: lines.fold<int>(0, (sum, line) => sum + line.total.amount),
        currencyCode:
            lines.isEmpty ? 'INR' : lines.first.unitPrice.currencyCode,
      );

  Money get gst => Money(
        amount: (subtotal.amount * 18 / 100).round(),
        currencyCode: subtotal.currencyCode,
      );

  Money get total => Money(
        amount: subtotal.amount + gst.amount,
        currencyCode: subtotal.currencyCode,
      );

  /// Best-effort sum of the buyer's target prices across lines that have one.
  Money get estimatedTargetTotal {
    var amount = 0;
    var currency = 'INR';
    for (final line in lines) {
      final target = line.targetTotal;
      if (target != null) {
        amount += target.amount;
        currency = target.currencyCode;
      }
    }
    return Money(amount: amount, currencyCode: currency);
  }

  B2BQuotationCart copyWith({
    List<B2BQuotationLine>? lines,
    RfqStatus? status,
    String? deliveryLocation,
    DateTime? requiredBy,
    String? remarks,
    String? reference,
  }) =>
      B2BQuotationCart(
        lines: lines ?? this.lines,
        status: status ?? this.status,
        deliveryLocation: deliveryLocation ?? this.deliveryLocation,
        requiredBy: requiredBy ?? this.requiredBy,
        remarks: remarks ?? this.remarks,
        reference: reference ?? this.reference,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'lines': lines.map((line) => line.toJson()).toList(),
        'status': status.name,
        if (deliveryLocation != null) 'delivery_location': deliveryLocation,
        if (requiredBy != null) 'required_by': requiredBy!.toIso8601String(),
        if (remarks != null) 'remarks': remarks,
        if (reference != null) 'reference': reference,
      };

  factory B2BQuotationCart.fromJson(Map<String, dynamic> j) {
    final statusName = j['status'] as String?;
    return B2BQuotationCart(
      lines: (j['lines'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(B2BQuotationLine.fromJson)
          .toList(),
      status: RfqStatus.values.firstWhere(
        (s) => s.name == statusName,
        orElse: () => RfqStatus.draft,
      ),
      deliveryLocation: j['delivery_location'] as String?,
      requiredBy: DateTime.tryParse(j['required_by'] as String? ?? ''),
      remarks: j['remarks'] as String?,
      reference: j['reference'] as String?,
    );
  }
}
