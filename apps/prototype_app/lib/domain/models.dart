/// Immutable domain models for the PinCommerce storefront.
///
/// JSON parsing is deliberately tolerant: Medusa storefront payloads can vary
/// slightly between releases, so every field degrades to a safe default rather
/// than throwing during deserialization.
library;

import 'image_quality_scores.generated.dart';
import 'review_catalogue.dart';

/// A monetary amount expressed in a currency's minor unit (e.g. paise for INR,
/// cents for USD).
class Money {
  const Money({required this.amount, required this.currencyCode});

  final int amount;
  final String currencyCode;

  /// Formats the amount as a whole currency unit, rounding up.
  ///
  /// Prices are presented as integers across the app; fractional minor units
  /// are never shown to the buyer. For example, ₹1,000.01 becomes ₹1,001.
  String get formatted {
    final major = amount / 100;
    final text = major.ceil().toString();
    switch (currencyCode.toUpperCase()) {
      case 'INR':
        return '₹$text';
      case 'USD':
        return '\$$text';
      case 'EUR':
        return '€$text';
      case 'GBP':
        return '£$text';
      default:
        return '${currencyCode.toUpperCase()} $text';
    }
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'amount': amount,
        'currency_code': currencyCode,
      };
}

class B2bPriceTier {
  const B2bPriceTier({
    required this.minQuantity,
    this.maxQuantity,
    required this.unitPrice,
  });

  final int minQuantity;
  final int? maxQuantity;
  final Money unitPrice;
}

List<B2bPriceTier> b2bTiersFromJson(dynamic value, String currency) {
  if (value is! List) return const <B2bPriceTier>[];
  return value
      .whereType<Map<String, dynamic>>()
      .map((tier) {
        final min = (tier['min_quantity'] as num?)?.toInt();
        final max = (tier['max_quantity'] as num?)?.toInt();
        final amount = (tier['amount'] as num?)?.toInt();
        if (min == null || amount == null) return null;
        return B2bPriceTier(
          minQuantity: min,
          maxQuantity: max,
          unitPrice: Money(amount: amount, currencyCode: currency),
        );
      })
      .whereType<B2bPriceTier>()
      .toList();
}

/// One sellable SKU inside a grouped product.
///
/// A catalogue product can own several source SKUs. The storefront shows **one card per product**, and
/// this list is how the remaining SKUs are inspected and bought without inventing extra products.
class ProductVariant {
  const ProductVariant({
    required this.id,
    required this.label,
    this.sku,
    this.price,
    this.mrp,
    this.offerId,
    this.sellerName,
    this.inStock = true,
    this.offerCount = 0,
    this.stockQty,
    this.b2bConfigured = false,
    this.b2bMoq,
    this.b2bTiers = const <B2bPriceTier>[],
  });

  final String id;
  final String label;
  final String? sku;
  final Money? price;
  final Money? mrp;
  final String? offerId;
  final String? sellerName;
  final bool inStock;
  final int offerCount;

  /// Stock reported by the winning offer. In staging this is the explicit
  /// 50-unit fixture, never a supplier stock claim.
  final int? stockQty;

  /// B2B terms from the per-offer B2B price list. A configured variant is the
  /// seller's published trade offer, so B2B surfaces prefer it over a B2C-only
  /// variant with no trade terms.
  final bool b2bConfigured;
  final int? b2bMoq;
  final List<B2bPriceTier> b2bTiers;

  /// True when this SKU can be added to a cart (it has a composed seller offer and a price).
  bool get isPurchasable =>
      offerId != null && offerId!.isNotEmpty && price != null;

  factory ProductVariant.fromComposedJson(Map<String, dynamic> json) {
    final best = json['best_price'] as Map<String, dynamic>?;
    final currency = best?['currency_code'] as String? ?? 'INR';
    final unit = (best?['unit_amount_minor'] as num?)?.toInt();
    final list = (best?['list_amount_minor'] as num?)?.toInt();
    return ProductVariant(
      id: json['id'] as String? ?? '',
      label: (json['title'] as String?)?.trim().isNotEmpty == true
          ? json['title'] as String
          : 'Default',
      sku: (json['sku'] as String?)?.trim().isNotEmpty == true
          ? json['sku'] as String
          : null,
      price: unit == null ? null : Money(amount: unit, currencyCode: currency),
      mrp: list != null && unit != null && list > unit
          ? Money(amount: list, currencyCode: currency)
          : null,
      offerId: best?['id'] as String?,
      sellerName: best?['seller_name'] as String?,
      inStock: json['in_stock'] as bool? ?? true,
      offerCount: (json['offer_count'] as num?)?.toInt() ?? 0,
      stockQty: (best?['inventory_quantity'] as num?)?.toInt(),
      b2bConfigured: best?['b2b_configured'] == true,
      b2bMoq: (best?['b2b_moq'] as num?)?.toInt(),
      b2bTiers: b2bTiersFromJson(best?['b2b_tiers'], currency),
    );
  }
}

/// A sellable product, flattened to a single default variant for the
/// browse → add-to-cart flow.
class Product {
  const Product({
    required this.id,
    required this.title,
    this.description,
    this.thumbnail,
    this.variantId,
    this.offerId,
    this.price,
    this.mrp,
    this.brand,
    this.rating,
    this.reviewCount,
    this.badges = const <String>[],
    this.deliveryNote,
    this.variants = const <ProductVariant>[],
    this.categoryId,
    this.categoryLabel,
    this.catalogueImport,
    this.imageQualityScore,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    final variants = (json['variants'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();

    String? variantId;
    Money? price;
    Money? mrp;
    if (variants.isNotEmpty) {
      final variant = variants.first;
      variantId = variant['id'] as String?;

      final prices = variant['prices'];
      Map<String, dynamic>? firstPrice;
      if (prices is List &&
          prices.isNotEmpty &&
          prices.first is Map<String, dynamic>) {
        firstPrice = prices.first as Map<String, dynamic>;
      }

      num? amount;
      num? originalAmount;
      final calculated = variant['calculated_price'];
      if (calculated is Map<String, dynamic>) {
        if (calculated['calculated_amount'] is num) {
          amount = calculated['calculated_amount'] as num;
        }
        if (calculated['original_amount'] is num) {
          originalAmount = calculated['original_amount'] as num;
        }
      }
      if (amount == null && firstPrice != null && firstPrice['amount'] is num) {
        amount = firstPrice['amount'] as num;
      }

      final currency = (firstPrice?['currency_code'] as String?) ??
          json['currency_code'] as String? ??
          'INR';
      if (amount != null) {
        price = Money(amount: amount.toInt(), currencyCode: currency);
      }
      if (originalAmount != null) {
        mrp = Money(amount: originalAmount.toInt(), currencyCode: currency);
      }
    }

    final metadata = json['metadata'] as Map<String, dynamic>?;
    final brand = json['brand'] as String? ?? metadata?['brand'] as String?;

    return Product(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      thumbnail: json['thumbnail'] as String?,
      variantId: variantId,
      price: price,
      mrp: mrp,
      brand: brand,
      rating: (json['rating'] as num?)?.toDouble(),
      reviewCount: (json['review_count'] as num?)?.toInt(),
      badges:
          (json['badges'] as List<dynamic>?)?.whereType<String>().toList() ??
              const <String>[],
      deliveryNote: json['delivery_note'] as String?,
    );
  }

  final String id;
  final String title;
  final String? description;
  final String? thumbnail;
  final String? variantId;

  /// Best-price offer id (for offer-based add-to-cart), when composed from the
  /// Experience API.
  final String? offerId;

  final Money? price;

  /// Builds a [Product] from the Experience API's composed product payload,
  /// where price and variant identity come from the best-price Mercur offer.
  factory Product.fromComposedJson(Map<String, dynamic> json) {
    final variants = (json['variants'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    final commercial = json['commercial'] as Map<String, dynamic>?;
    // The list endpoint returns `best_price`; the detail endpoint nests the same
    // best-price offer under `commercial.selected_seller`. Accept both.
    final best = (json['best_price'] ?? commercial?['selected_seller'])
        as Map<String, dynamic>?;
    final num? bestAmount = best?['unit_amount_minor'] as num?;
    final num? listAmount = best?['list_amount_minor'] as num?;
    final currency = best?['currency_code'] as String? ?? 'INR';
    final hasDiscount = bestAmount != null &&
        listAmount != null &&
        listAmount.toInt() > bestAmount.toInt();
    final id = json['id'] as String? ?? '';
    final jsonBadges =
        (json['badges'] as List<dynamic>?)?.whereType<String>().toList() ??
            const <String>[];

    // Grouped variants. Every SKU carries its own best price so the detail page can switch SKU without
    // a second round trip, and a card never has to pretend the first variant is the whole product.
    final productVariants = variants
        .map(ProductVariant.fromComposedJson)
        .where((variant) => variant.id.isNotEmpty)
        .toList();

    final metadata = json['metadata'] as Map<String, dynamic>?;
    final categories =
        (json['categories'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .toList();
    final leafCategory = categories.isEmpty ? null : categories.first;

    // Review-only enrichment derives a list price and tags for the demonstration
    // catalogue. It must never touch an imported source SKU: the source price is
    // the truth, and manufacturing a higher "MRP" would invent a discount.
    final imported =
        (metadata?['catalogue_import'] as String?)?.trim().isNotEmpty ?? false;
    final Money? mrp;
    if (hasDiscount) {
      mrp = Money(amount: listAmount.toInt(), currencyCode: currency);
    } else if (bestAmount != null && !imported) {
      final marked =
          (bestAmount.toInt() * (100 + reviewDiscountPercent(id)) / 100)
              .round();
      mrp = Money(amount: marked, currencyCode: currency);
    } else {
      mrp = null;
    }

    return Product(
      id: id,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      thumbnail: json['thumbnail'] as String?,
      variantId: best?['variant_id'] as String? ??
          (variants.isNotEmpty ? variants.first['id'] as String? : null),
      offerId: best?['id'] as String?,
      price: bestAmount == null
          ? null
          : Money(amount: bestAmount.toInt(), currencyCode: currency),
      mrp: mrp,
      brand: metadata?['brand'] as String?,
      badges: jsonBadges.isNotEmpty
          ? jsonBadges
          : (imported ? const <String>[] : reviewTags(id)),
      variants: productVariants,
      categoryId: leafCategory?['id'] as String?,
      categoryLabel: metadata?['category_l1'] as String? ??
          leafCategory?['name'] as String?,
      catalogueImport: metadata?['catalogue_import'] as String?,
      imageQualityScore: (json['image_quality_score'] as num?)?.toInt(),
    );
  }

  /// Copies this product with selective overrides (used to attach the
  /// merchandising trust badge for a given home module, or to switch the
  /// selected SKU on a grouped product).
  Product copyWith({
    String? variantId,
    String? offerId,
    Money? price,
    Money? mrp,
    List<String>? badges,
    List<ProductVariant>? variants,
  }) =>
      Product(
        id: id,
        title: title,
        description: description,
        thumbnail: thumbnail,
        variantId: variantId ?? this.variantId,
        offerId: offerId ?? this.offerId,
        price: price ?? this.price,
        mrp: mrp ?? this.mrp,
        brand: brand,
        rating: rating,
        reviewCount: reviewCount,
        badges: badges ?? this.badges,
        deliveryNote: deliveryNote,
        variants: variants ?? this.variants,
        categoryId: categoryId,
        categoryLabel: categoryLabel,
        catalogueImport: catalogueImport,
        imageQualityScore: imageQualityScore,
      );

  /// Original / compare-at price (struck through on the card).
  final Money? mrp;

  final String? brand;
  final double? rating;
  final int? reviewCount;
  final List<String> badges;
  final String? deliveryNote;

  /// Every SKU this grouped product owns. Empty for a product the backend
  /// composed without variant detail.
  final List<ProductVariant> variants;

  /// Commerce category id of the product's assigned (leaf) category.
  final String? categoryId;

  /// Human L1 category label supplied by the catalogue import metadata.
  final String? categoryLabel;

  /// Staging import marker (`CHG-049` for the 500-SKU source catalogue).
  final String? catalogueImport;

  /// Display-fitness score supplied by the Experience API (CHG-060), when the
  /// deployed API is new enough to compose it.
  final int? imageQualityScore;

  /// Score used for default listing order.
  ///
  /// The API value wins. The shared CHG-060 fixture is the fallback for
  /// responses composed before the API carried the field, so the order does not
  /// silently regress while an API release is pending. Unknown products score 0
  /// and keep their source order.
  int get displayImageScore =>
      imageQualityScore ?? chg049ImageQualityScores[id] ?? 0;

  /// Number of SKUs represented by this one product card (never below 1).
  int get variantCount => variants.isEmpty ? 1 : variants.length;

  /// Compact SKU count for a card's brand line, e.g. "3 SKUs".
  String get variantLabel =>
      '$variantCount ${variantCount == 1 ? 'SKU' : 'SKUs'}';

  /// Brand line for a card: brand plus the grouped SKU count.
  String? get brandLine {
    final value = brand?.trim();
    if (value == null || value.isEmpty) {
      return variants.isEmpty ? null : variantLabel;
    }
    return '$value · $variantLabel';
  }

  /// The SKU to add when the buyer acts on the card without opening the
  /// product: the first variant that actually has a sellable offer.
  ///
  /// Null when the payload lists variants without per-variant offers (an older
  /// Experience API), so callers fall back to the product-level best offer
  /// instead of picking a variant that cannot be sold.
  ProductVariant? get defaultVariant {
    for (final variant in variants) {
      if (variant.isPurchasable) return variant;
    }
    return null;
  }

  /// SKU identity used by add-to-cart: the default variant's id, then the
  /// composed best-price variant, then the product id.
  String get cartVariantId => defaultVariant?.id ?? variantId ?? id;

  /// Offer identity used by add-to-cart, aligned with [cartVariantId].
  String get cartOfferId => defaultVariant?.offerId ?? offerId ?? '';

  /// True when [query] matches the product, its brand, or any variant label/SKU.
  ///
  /// SKU search is what makes all 500 imported SKUs discoverable from 233 cards.
  bool matchesQuery(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    if (title.toLowerCase().contains(q)) return true;
    if ((brand ?? '').toLowerCase().contains(q)) return true;
    if (id.toLowerCase().contains(q)) return true;
    for (final variant in variants) {
      if (variant.label.toLowerCase().contains(q)) return true;
      if ((variant.sku ?? '').toLowerCase().contains(q)) return true;
    }
    return false;
  }

  /// Discount percentage derived from [mrp] vs [price], or null when there is
  /// no meaningful discount.
  int? get discountPercent {
    final original = mrp?.amount;
    final selling = price?.amount;
    if (original == null || selling == null || original <= 0) return null;
    final diff = original - selling;
    if (diff <= 0) return null;
    return ((diff / original) * 100).round();
  }

  /// Compact serialization for the local catalog cache (round-trips with
  /// [Product.fromCacheJson]).
  Map<String, dynamic> toCacheJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'description': description,
        'thumbnail': thumbnail,
        'variant_id': variantId,
        'offer_id': offerId,
        'price_amount': price?.amount,
        'price_currency': price?.currencyCode,
        'mrp_amount': mrp?.amount,
        'brand': brand,
        'rating': rating,
        'review_count': reviewCount,
        'badges': badges,
        'delivery_note': deliveryNote,
        'category_id': categoryId,
        'category_label': categoryLabel,
        'catalogue_import': catalogueImport,
        'image_quality_score': imageQualityScore,
        'variants': <Map<String, dynamic>>[
          for (final variant in variants)
            <String, dynamic>{
              'id': variant.id,
              'label': variant.label,
              'sku': variant.sku,
              'price': variant.price?.amount,
              'currency': variant.price?.currencyCode,
              'mrp': variant.mrp?.amount,
              'offer_id': variant.offerId,
              'seller_name': variant.sellerName,
              'in_stock': variant.inStock,
              'offer_count': variant.offerCount,
              'stock_qty': variant.stockQty,
              'b2b_configured': variant.b2bConfigured,
              'b2b_moq': variant.b2bMoq,
              'b2b_tiers': <Map<String, dynamic>>[
                for (final tier in variant.b2bTiers)
                  <String, dynamic>{
                    'min_quantity': tier.minQuantity,
                    'max_quantity': tier.maxQuantity,
                    'amount': tier.unitPrice.amount,
                  },
              ],
            },
        ],
      };

  static Product fromCacheJson(Map<String, dynamic> json) => Product(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        thumbnail: json['thumbnail'] as String?,
        variantId: json['variant_id'] as String?,
        offerId: json['offer_id'] as String?,
        price: json['price_amount'] == null
            ? null
            : Money(
                amount: (json['price_amount'] as num).toInt(),
                currencyCode: json['price_currency'] as String? ?? 'INR',
              ),
        mrp: json['mrp_amount'] == null
            ? null
            : Money(
                amount: (json['mrp_amount'] as num).toInt(),
                currencyCode: json['price_currency'] as String? ?? 'INR',
              ),
        brand: json['brand'] as String?,
        rating: (json['rating'] as num?)?.toDouble(),
        reviewCount: (json['review_count'] as num?)?.toInt(),
        badges:
            (json['badges'] as List<dynamic>?)?.whereType<String>().toList() ??
                const <String>[],
        deliveryNote: json['delivery_note'] as String?,
        categoryId: json['category_id'] as String?,
        categoryLabel: json['category_label'] as String?,
        catalogueImport: json['catalogue_import'] as String?,
        imageQualityScore: (json['image_quality_score'] as num?)?.toInt(),
        variants: (json['variants'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map((v) {
              final amount = (v['price'] as num?)?.toInt();
              final currency = v['currency'] as String? ?? 'INR';
              final mrpAmount = (v['mrp'] as num?)?.toInt();
              return ProductVariant(
                id: v['id'] as String? ?? '',
                label: v['label'] as String? ?? 'Default',
                sku: v['sku'] as String?,
                price: amount == null
                    ? null
                    : Money(amount: amount, currencyCode: currency),
                mrp: mrpAmount == null
                    ? null
                    : Money(amount: mrpAmount, currencyCode: currency),
                offerId: v['offer_id'] as String?,
                sellerName: v['seller_name'] as String?,
                inStock: v['in_stock'] as bool? ?? true,
                offerCount: (v['offer_count'] as num?)?.toInt() ?? 0,
                stockQty: (v['stock_qty'] as num?)?.toInt(),
                b2bConfigured: v['b2b_configured'] == true,
                b2bMoq: (v['b2b_moq'] as num?)?.toInt(),
                b2bTiers: b2bTiersFromJson(v['b2b_tiers'], currency),
              );
            })
            .where((variant) => variant.id.isNotEmpty)
            .toList(),
      );
}

/// A seller offer for a product.
///
/// A product can be offered by **multiple sellers**; the best-price offer is the
/// default selection on the product page. Prices are inclusive of the seller's
/// current offer and may differ from the reference catalogue price.
class ProductSeller {
  const ProductSeller({
    required this.id,
    required this.name,
    required this.price,
    this.mrp,
    this.rating,
    this.deliveryNote,
    this.verified = true,
    this.isBestPrice = false,
  });

  final String id;
  final String name;
  final Money price;
  final Money? mrp;
  final double? rating;
  final String? deliveryNote;
  final bool verified;
  final bool isBestPrice;

  int? get discountPercent {
    final original = mrp?.amount;
    final selling = price.amount;
    if (original == null || original <= 0 || selling >= original) return null;
    return (((original - selling) / original) * 100).round();
  }
}

/// A line item within a [Cart].
class CartLineItem {
  const CartLineItem({
    required this.id,
    required this.title,
    required this.quantity,
    this.unitPrice,
    this.total,
    this.productId,
    this.variantId,
    this.productTitle,
    this.thumbnail,
  });

  factory CartLineItem.fromJson(Map<String, dynamic> json) {
    Money? fromMinor(num? amount, String? currency) => amount == null
        ? null
        : Money(amount: amount.toInt(), currencyCode: currency ?? 'INR');
    return CartLineItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 0,
      unitPrice: fromMinor(
          json['unit_price'] as num?, json['currency_code'] as String?),
      total: fromMinor(json['total'] as num?, json['currency_code'] as String?),
      productId: json['product_id'] as String?,
      variantId: json['variant_id'] as String?,
      productTitle: json['product_title'] as String?,
      thumbnail: json['thumbnail'] as String?,
    );
  }

  final String id;
  final String title;
  final int quantity;
  final Money? unitPrice;
  final Money? total;
  final String? productId;
  final String? variantId;
  final String? productTitle;
  final String? thumbnail;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'quantity': quantity,
        'unit_price': unitPrice?.amount,
        'total': total?.amount,
        'currency_code': unitPrice?.currencyCode ?? total?.currencyCode,
        'product_id': productId,
        'variant_id': variantId,
        'product_title': productTitle,
        'thumbnail': thumbnail,
      };
}

/// Finds the catalogue product represented by a canonical cart line.
///
/// Product/variant ids win. Title matching is a compatibility fallback for
/// older carts that did not expose those ids.
Product? catalogueProductForCartLine(
  CartLineItem line,
  List<Product> catalogue,
) {
  final productId = line.productId?.trim();
  if (productId != null && productId.isNotEmpty) {
    for (final product in catalogue) {
      if (product.id == productId) return product;
    }
  }

  final variantId = line.variantId?.trim();
  if (variantId != null && variantId.isNotEmpty) {
    for (final product in catalogue) {
      if (product.variantId == variantId ||
          product.variants.any((variant) => variant.id == variantId)) {
        return product;
      }
    }
  }

  final title = (line.productTitle ?? line.title).trim().toLowerCase();
  if (title.isEmpty) return null;
  for (final product in catalogue) {
    if (product.title.trim().toLowerCase() == title) return product;
  }
  return null;
}

/// Cart payload image first, then the catalogue thumbnail for legacy payloads.
String? cartLineImageUrl(CartLineItem line, List<Product> catalogue) {
  final canonical = line.thumbnail?.trim();
  if (canonical != null && canonical.isNotEmpty) return canonical;
  return catalogueProductForCartLine(line, catalogue)?.thumbnail;
}

/// A promotion code applied to a cart by the engine.
class AppliedPromotion {
  const AppliedPromotion({
    required this.code,
    this.label,
    this.isAutomatic = false,
  });

  final String code;

  /// Customer-facing label from the API (`Flat5%`); falls back to the code.
  final String? label;

  final bool isAutomatic;

  String get displayLabel => (label ?? '').isEmpty ? code : label!;

  factory AppliedPromotion.fromJson(Map<String, dynamic> json) =>
      AppliedPromotion(
        code: json['code'] as String? ?? '',
        label: json['label'] as String?,
        isAutomatic: json['is_automatic'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'code': code,
        'label': label,
        'is_automatic': isAutomatic,
      };
}

/// One engine-granted discount line, already resolved to money.
class CartAdjustment {
  const CartAdjustment({
    this.code,
    required this.label,
    required this.amount,
    this.target = 'item',
  });

  final String? code;
  final String label;
  final int amount;
  final String target;

  factory CartAdjustment.fromJson(Map<String, dynamic> json) => CartAdjustment(
        code: json['code'] as String?,
        label:
            json['label'] as String? ?? json['code'] as String? ?? 'Discount',
        amount: (json['amount'] as num?)?.toInt() ?? 0,
        target: json['target'] as String? ?? 'item',
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'code': code,
        'label': label,
        'amount': amount,
        'target': target,
      };
}

/// A Medusa shopping cart with its line items and totals.
class Cart {
  const Cart(
      {required this.id,
      this.items = const <CartLineItem>[],
      this.subtotal,
      this.total,
      this.shippingTotal,
      this.discountTotal,
      this.shippingDiscountTotal,
      this.promotions = const <AppliedPromotion>[],
      this.adjustments = const <CartAdjustment>[]});

  factory Cart.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CartLineItem.fromJson)
        .toList();
    final total = json['total'] as num?;
    final subtotal = json['subtotal'] as num?;
    final shippingTotal = json['shipping_total'] as num?;
    final discountTotal = json['discount_total'] as num?;
    final shippingDiscount = json['shipping_discount_total'] as num?;
    final currency = json['currency_code'] as String? ?? 'INR';
    Money? money(num? amount) => amount == null
        ? null
        : Money(amount: amount.toInt(), currencyCode: currency);
    return Cart(
      id: json['id'] as String? ?? '',
      items: items,
      subtotal: money(subtotal),
      total: money(total),
      shippingTotal: money(shippingTotal),
      discountTotal: money(discountTotal),
      shippingDiscountTotal: money(shippingDiscount),
      promotions: (json['promotions'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(AppliedPromotion.fromJson)
          .toList(),
      adjustments: (json['adjustments'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(CartAdjustment.fromJson)
          .toList(),
    );
  }

  final String id;
  final List<CartLineItem> items;
  final Money? subtotal;
  final Money? total;
  final Money? shippingTotal;

  /// Engine-granted discount total. Null when the response carried none.
  final Money? discountTotal;

  /// Engine-granted shipping discount (free-shipping offers).
  final Money? shippingDiscountTotal;

  /// Codes the engine accepted on this cart.
  final List<AppliedPromotion> promotions;

  /// Flat discount lines for display and checkout summaries.
  final List<CartAdjustment> adjustments;

  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  bool get hasDiscount => (discountTotal?.amount ?? 0) > 0;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'items': items.map((e) => e.toJson()).toList(),
        'subtotal': subtotal?.amount,
        'total': total?.amount,
        'shipping_total': shippingTotal?.amount,
        'discount_total': discountTotal?.amount,
        'shipping_discount_total': shippingDiscountTotal?.amount,
        'promotions': promotions.map((e) => e.toJson()).toList(),
        'adjustments': adjustments.map((e) => e.toJson()).toList(),
        'currency_code': total?.currencyCode,
      };
}

/// An eligible seller-aware delivery option calculated by Mercur/Medusa.
class ShippingOption {
  const ShippingOption({
    required this.id,
    required this.sellerId,
    required this.name,
    required this.price,
    required this.providerId,
    this.tier,
    this.description,
  });

  factory ShippingOption.fromJson(Map<String, dynamic> json) {
    return ShippingOption(
      id: json['id'] as String? ?? '',
      sellerId: json['seller_id'] as String? ?? '',
      name: json['name'] as String? ?? 'Delivery',
      price: Money(
        amount: (json['amount'] as num?)?.toInt() ?? 0,
        currencyCode: json['currency_code'] as String? ?? 'INR',
      ),
      providerId: json['provider_id'] as String? ?? '',
      tier: json['tier'] as String?,
      description: json['description'] as String?,
    );
  }

  final String id;
  final String sellerId;
  final String name;
  final Money price;
  final String providerId;
  final String? tier;
  final String? description;
}

/// A shipping/billing address sent to Medusa.
class Address {
  const Address({
    required this.firstName,
    required this.lastName,
    required this.address1,
    required this.city,
    required this.postalCode,
    required this.countryCode,
    this.phone,
    this.address2,
    this.province,
  });

  final String firstName;
  final String lastName;
  final String address1;
  final String city;
  final String postalCode;
  final String countryCode;

  /// Contact phone for the delivery. Optional on older callers.
  final String? phone;

  /// Second address line (apartment, floor, landmark).
  final String? address2;

  /// State / province. Required for GST invoices.
  final String? province;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'first_name': firstName,
        'last_name': lastName,
        'address_1': address1,
        if (address2 != null && address2!.trim().isNotEmpty)
          'address_2': address2,
        'city': city,
        if (province != null && province!.trim().isNotEmpty)
          'province': province,
        'postal_code': postalCode,
        'country_code': countryCode,
        if (phone != null && phone!.trim().isNotEmpty) 'phone': phone,
      };
}
