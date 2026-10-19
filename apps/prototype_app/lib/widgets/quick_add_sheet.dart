import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/models.dart';

List<ProductVariant> purchasableQuickAddVariants(Product product) =>
    product.variants
        .where((variant) => variant.isPurchasable && variant.inStock)
        .toList();

/// A grouped product always requires an explicit choice, even when only one of
/// its source SKUs is currently purchasable.
bool requiresVariantSelection(Product product) => product.variants.length > 1;

/// Returns the SKU the customer explicitly selected, or null when dismissed.
Future<ProductVariant?> showVariantQuickAddSheet(
  BuildContext context,
  Product product,
) {
  return showModalBottomSheet<ProductVariant>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => VariantQuickAddSheet(product: product),
  );
}

/// Mobile SKU picker used when quick-add would otherwise silently choose one
/// SKU from a grouped product.
class VariantQuickAddSheet extends StatefulWidget {
  const VariantQuickAddSheet({required this.product, super.key});

  final Product product;

  @override
  State<VariantQuickAddSheet> createState() => _VariantQuickAddSheetState();
}

class _VariantQuickAddSheetState extends State<VariantQuickAddSheet> {
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    final variants = purchasableQuickAddVariants(widget.product);
    _selectedId = variants.isEmpty ? null : variants.first.id;
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final variants = purchasableQuickAddVariants(widget.product);
    final selected =
        variants.where((variant) => variant.id == _selectedId).firstOrNull;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AgencySpacing.md,
          0,
          AgencySpacing.md,
          AgencySpacing.md + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Choose a variant',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.contentPrimary)),
            const SizedBox(height: AgencySpacing.xs),
            Text(widget.product.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.md),
            if (variants.isEmpty)
              Text('No purchasable variants are available.',
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary))
            else
              Flexible(
                child: SingleChildScrollView(
                  child: RadioGroup<String>(
                    groupValue: _selectedId,
                    onChanged: (id) => setState(() => _selectedId = id),
                    child: Column(
                      children: <Widget>[
                        for (final variant in variants)
                          Padding(
                            padding:
                                const EdgeInsets.only(bottom: AgencySpacing.xs),
                            child: Material(
                              color: variant.id == _selectedId
                                  ? colors.surfaceInteractive
                                  : colors.surfaceRaised,
                              shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(AgencyRadius.md),
                                side: BorderSide(
                                  color: variant.id == _selectedId
                                      ? colors.actionPrimary
                                      : colors.borderDefault,
                                ),
                              ),
                              child: RadioListTile<String>(
                                value: variant.id,
                                title: Text(variant.label,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600)),
                                subtitle: Text(
                                  <String>[
                                    if (variant.sku != null)
                                      'SKU ${variant.sku}',
                                    if (variant.stockQty != null)
                                      '${variant.stockQty} available',
                                  ].join(' · '),
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: colors.contentSecondary),
                                ),
                                secondary: Text(
                                  variant.price?.formatted ??
                                      'Price unavailable',
                                  style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: colors.contentPrimary),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: AgencySpacing.sm),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: selected == null
                    ? null
                    : () => Navigator.of(context).pop(selected),
                icon: const Icon(Icons.add_shopping_cart, size: 18),
                label: const Text('Add selected variant'),
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size.fromHeight(48),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
