import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/models.dart';

/// Staging price-reference block shared by B2C and B2B product pages.
///
/// The three references are deterministic percentages above the selected
/// selling price. They are a staging fixture, never a live marketplace quote.
class MarketComparison extends StatelessWidget {
  const MarketComparison({required this.sellingPrice, super.key});

  final Money sellingPrice;

  static const List<(String, int)> _references = <(String, int)>[
    ('Flipkart', 5),
    ('Amazon', 3),
    ('Market price', 2),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text('Price reference',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
              const SizedBox(width: AgencySpacing.xs),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: colors.promotionSubtle,
                  borderRadius: BorderRadius.circular(AgencyRadius.sm),
                ),
                child: Text('staging',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AgencySpacing.xs),
          for (final (label, percent) in _references)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(label,
                        style: TextStyle(
                            fontSize: 12, color: colors.contentSecondary)),
                  ),
                  Text(
                    Money(
                      amount:
                          (sellingPrice.amount * (100 + percent) / 100).round(),
                      currencyCode: sellingPrice.currencyCode,
                    ).formatted,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary),
                  ),
                  const SizedBox(width: AgencySpacing.xs),
                  Text('+$percent%',
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
          const SizedBox(height: AgencySpacing.xs),
          Text(
            'Indicative comparison generated from our selling price for staging '
            'review only. Not a live marketplace quote.',
            style: TextStyle(fontSize: 10, color: colors.contentSecondary),
          ),
        ],
      ),
    );
  }
}
