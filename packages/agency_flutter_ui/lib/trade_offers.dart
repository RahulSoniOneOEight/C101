part of 'agency_flutter_ui.dart';

/// Trade Offers & Deals widgets (BuildKart B2B).
///
/// `HorizontalSKUCard` — the compact SKU card used in the Home offers swimlane
/// (image, short name, dealer price, compact Cart-Plus).
/// `TradeOfferCollectionCard` — the selectable collection tile used in the Home
/// preview and the Trade Offers & Deals page.

class HorizontalSKUCard extends StatelessWidget {
  const HorizontalSKUCard({
    required this.title,
    required this.priceLabel,
    this.imageUrl,
    this.onAdd,
    this.onTap,
    super.key,
  });

  final String title;
  final String priceLabel;
  final String? imageUrl;
  final VoidCallback? onAdd;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      width: 110,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AgencyRadius.sm),
            child: Container(
              height: 84,
              width: double.infinity,
              decoration: BoxDecoration(
                color: colors.surfacePage,
                borderRadius: BorderRadius.circular(AgencyRadius.sm),
              ),
              clipBehavior: Clip.antiAlias,
              child: imageUrl == null
                  ? Icon(Icons.image_outlined, color: colors.contentSecondary)
                  : Image.network(
                      imageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Icon(Icons.image_outlined,
                          color: colors.contentSecondary),
                    ),
            ),
          ),
          const SizedBox(height: 6),
          InkWell(
            onTap: onTap,
            child: Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11, height: 1.3, color: colors.contentPrimary),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  priceLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.actionPrimary),
                ),
              ),
              CartPlusIconButton(onPressed: onAdd),
            ],
          ),
        ],
      ),
    );
  }
}

/// A backend-configured offer/deal collection tile. [selected] drives the
/// active state (accent border + check) on the Home preview.
class TradeOfferCollectionCard extends StatelessWidget {
  const TradeOfferCollectionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.accent,
    required this.accentSurface,
    this.selected = false,
    this.onTap,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color accent;
  final Color accentSurface;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: accentSurface,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(
            color: selected ? accent : Colors.transparent,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(icon, size: 18, color: accent),
                const Spacer(),
                if (selected)
                  Icon(Icons.check_circle, size: 16, color: accent),
              ],
            ),
            const SizedBox(height: AgencySpacing.sm),
            Text(title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
            const SizedBox(height: 2),
            Text(subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 9, color: colors.contentSecondary)),
          ],
        ),
      ),
    );
  }
}
