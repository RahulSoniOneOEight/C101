import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

/// Collapsible section used by the retail and trade filter sheets.
///
/// A long stack of open chip groups forces the buyer to scroll through every
/// facet to reach the ones they use. Each facet becomes a header that expands
/// in place, and a collapsed header can carry a one-line summary of its
/// selection so the sheet still reads correctly when folded.
class FilterSection extends StatelessWidget {
  const FilterSection({
    required this.title,
    required this.expanded,
    required this.onToggle,
    required this.child,
    this.summary,
    super.key,
  });

  final String title;
  final bool expanded;
  final VoidCallback onToggle;

  /// Shown only while collapsed; keep it to a few characters.
  final String? summary;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.borderDefault)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Semantics(
            button: true,
            expanded: expanded,
            label: title,
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary,
                        ),
                      ),
                    ),
                    if (summary != null && summary!.trim().isNotEmpty) ...<Widget>[
                      Flexible(
                        child: Text(
                          summary!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.end,
                          style: TextStyle(
                            fontSize: 12,
                            color: colors.contentSecondary,
                          ),
                        ),
                      ),
                      const SizedBox(width: AgencySpacing.xs),
                    ],
                    AnimatedRotation(
                      turns: expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 150),
                      child: Icon(
                        Icons.expand_more,
                        size: 20,
                        color: colors.contentSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 150),
            alignment: Alignment.topCenter,
            child: expanded
                ? Padding(
                    padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
                    child: child,
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}
