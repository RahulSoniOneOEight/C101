import 'models.dart';

/// A catalogue reference captured into a Workspace conversation.
///
/// This is purchase intent only. It contains the display/commercial snapshot
/// needed by Workspace, but it cannot create or mutate a Commerce cart.
class ConversationProductCapture {
  const ConversationProductCapture({
    required this.productId,
    required this.variantId,
    required this.offerId,
    required this.title,
    required this.quantity,
    required this.unitAmountMinor,
    required this.currencyCode,
    this.sellerId,
    this.sellerName,
    this.sku,
    this.thumbnail,
    this.materialInstruction,
  });

  factory ConversationProductCapture.fromProduct(
    Product product, {
    ProductVariant? variant,
    int quantity = 1,
    String? sellerId,
    String? sellerName,
    Money? unitPrice,
    String? variantId,
    String? offerId,
  }) {
    final selected = variant ?? product.defaultVariant;
    final price = unitPrice ?? selected?.price ?? product.price;
    return ConversationProductCapture(
      productId: product.id,
      variantId: variantId ?? selected?.id ?? product.cartVariantId,
      offerId: offerId ?? selected?.offerId ?? product.cartOfferId,
      title: product.title,
      quantity: quantity,
      unitAmountMinor: price?.amount ?? 0,
      currencyCode: price?.currencyCode ?? 'INR',
      sellerId: sellerId,
      sellerName: sellerName ?? selected?.sellerName ?? product.brand,
      sku: selected?.sku,
      thumbnail: product.thumbnail,
    );
  }

  final String productId;
  final String variantId;
  final String offerId;
  final String title;
  final int quantity;
  final int unitAmountMinor;
  final String currencyCode;
  final String? sellerId;
  final String? sellerName;
  final String? sku;
  final String? thumbnail;
  final String? materialInstruction;

  bool get isShareable =>
      productId.isNotEmpty && variantId.isNotEmpty && offerId.isNotEmpty;

  /// Stable within one draft so a second capture can be de-duplicated.
  String get lineKey => 'catalogue:$variantId';

  Map<String, dynamic> get commercialSnapshot => <String, dynamic>{
        'product_title': title,
        'seller_name': sellerName ?? '',
        'sku': sku ?? '',
        'unit_amount_minor': unitAmountMinor,
        'currency_code': currencyCode,
        if (thumbnail != null && thumbnail!.isNotEmpty) 'thumbnail': thumbnail,
      };

  Map<String, dynamic> get draftLine => <String, dynamic>{
        'line_key': lineKey,
        'product_id': productId,
        'variant_id': variantId,
        // An empty seller id explicitly means "resolve at Phase E"; no seller
        // is invented in the client.
        'seller_id': sellerId ?? '',
        'offer_id': offerId,
        'fulfilment_context_id': 'default',
        'quantity': quantity,
        'unit_amount_minor': unitAmountMinor,
        'currency_code': currencyCode,
        'commercial_snapshot': commercialSnapshot,
        if (materialInstruction != null &&
            materialInstruction!.trim().isNotEmpty)
          'material_instruction': materialInstruction!.trim(),
      };
}
