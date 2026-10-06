/// Immutable domain models for the PinCommerce storefront.
///
/// JSON parsing is deliberately tolerant: Medusa storefront payloads can vary
/// slightly between releases, so every field degrades to a safe default rather
/// than throwing during deserialization.
library;

/// A monetary amount expressed in a currency's minor unit (e.g. paise for INR,
/// cents for USD).
class Money {
  const Money({required this.amount, required this.currencyCode});

  final int amount;
  final String currencyCode;

  /// Formats the amount as a human-readable string, e.g. "₹1,999" or "$20.50".
  String get formatted {
    final major = amount / 100;
    final text = major == major.roundToDouble()
        ? major.toStringAsFixed(0)
        : major.toStringAsFixed(2);
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
    final best = json['best_price'] as Map<String, dynamic>?;
    final num? bestAmount = best?['unit_amount_minor'] as num?;
    return Product(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      thumbnail: json['thumbnail'] as String?,
      variantId: best?['variant_id'] as String? ??
          (variants.isNotEmpty ? variants.first['id'] as String? : null),
      offerId: best?['id'] as String?,
      price: bestAmount == null
          ? null
          : Money(
              amount: bestAmount.toInt(),
              currencyCode: best?['currency_code'] as String? ?? 'INR',
            ),
    );
  }

  /// Original / compare-at price (struck through on the card).
  final Money? mrp;

  final String? brand;
  final double? rating;
  final int? reviewCount;
  final List<String> badges;
  final String? deliveryNote;

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
    );
  }

  final String id;
  final String title;
  final int quantity;
  final Money? unitPrice;
  final Money? total;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'title': title,
        'quantity': quantity,
        'unit_price': unitPrice?.amount,
        'total': total?.amount,
        'currency_code': unitPrice?.currencyCode ?? total?.currencyCode,
      };
}

/// A Medusa shopping cart with its line items and totals.
class Cart {
  const Cart(
      {required this.id,
      this.items = const <CartLineItem>[],
      this.subtotal,
      this.total,
      this.shippingTotal});

  factory Cart.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(CartLineItem.fromJson)
        .toList();
    final total = json['total'] as num?;
    final subtotal = json['subtotal'] as num?;
    final shippingTotal = json['shipping_total'] as num?;
    final currency = json['currency_code'] as String? ?? 'INR';
    return Cart(
      id: json['id'] as String? ?? '',
      items: items,
      subtotal: subtotal == null
          ? null
          : Money(amount: subtotal.toInt(), currencyCode: currency),
      total: total == null
          ? null
          : Money(amount: total.toInt(), currencyCode: currency),
      shippingTotal: shippingTotal == null
          ? null
          : Money(amount: shippingTotal.toInt(), currencyCode: currency),
    );
  }

  final String id;
  final List<CartLineItem> items;
  final Money? subtotal;
  final Money? total;
  final Money? shippingTotal;

  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'items': items.map((e) => e.toJson()).toList(),
        'subtotal': subtotal?.amount,
        'total': total?.amount,
        'shipping_total': shippingTotal?.amount,
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
    );
  }

  final String id;
  final String sellerId;
  final String name;
  final Money price;
  final String providerId;
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
  });

  final String firstName;
  final String lastName;
  final String address1;
  final String city;
  final String postalCode;
  final String countryCode;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'first_name': firstName,
        'last_name': lastName,
        'address_1': address1,
        'city': city,
        'postal_code': postalCode,
        'country_code': countryCode,
      };
}
