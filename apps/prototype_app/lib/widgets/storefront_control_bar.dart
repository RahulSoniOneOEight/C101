import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../theme/storefront_control_tokens.dart';

/// Compact, always-visible sort/filter bar shared by the B2C and B2B listings.
///
/// Height is fixed at 100px: one 44px sort row and one 44px filter row with
/// 4px padding. Chips keep a 44px tap target but draw a 34px pill, so the bar
/// reads lighter without shrinking the touch area.
class StorefrontControlBar extends StatelessWidget {
  const StorefrontControlBar({
    required this.sortOptions,
    required this.selectedSort,
    required this.onSort,
    required this.quickFilters,
    required this.selectedQuickFilters,
    required this.onToggleQuickFilter,
    required this.filterCount,
    required this.onOpenFilters,
    required this.resultCount,
    required this.onClearFilters,
    super.key,
  });

  static const double height = 102;

  final List<String> sortOptions;
  final String selectedSort;
  final ValueChanged<String> onSort;
  final List<String> quickFilters;
  final Set<String> selectedQuickFilters;
  final ValueChanged<String> onToggleQuickFilter;
  final int filterCount;
  final VoidCallback onOpenFilters;
  final int resultCount;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final sortFill = StorefrontControlTokens.sortFill(context);
    final sortInk = StorefrontControlTokens.sortInk(context);
    final filterFill = StorefrontControlTokens.filterFill(context);
    final filterInk = StorefrontControlTokens.filterInk(context);

    return Material(
      color: colors.surfacePage,
      child: Container(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.borderDefault)),
        ),
        padding:
            const EdgeInsets.fromLTRB(AgencySpacing.md, 4, AgencySpacing.md, 4),
        child: Column(
          children: <Widget>[
            SizedBox(
              height: 44,
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: ListView.separated(
                      key: const Key('storefrontSortChips'),
                      scrollDirection: Axis.horizontal,
                      padding: EdgeInsets.zero,
                      itemCount: sortOptions.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (context, index) {
                        final option = sortOptions[index];
                        return StorefrontControlChip(
                          label: option,
                          selected: option == selectedSort,
                          fill: sortFill,
                          ink: sortInk,
                          onTap: () => onSort(option),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$resultCount ${resultCount == 1 ? 'result' : 'results'}',
                    style: TextStyle(
                      fontSize: 10,
                      color: colors.contentSecondary,
                    ),
                  ),
                  if (filterCount > 0)
                    TextButton(
                      onPressed: onClearFilters,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        foregroundColor: colors.actionPrimary,
                        textStyle: const TextStyle(fontSize: 10),
                      ),
                      child: const Text('Clear all'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 44,
              child: Row(
                children: <Widget>[
                  StorefrontFiltersButton(
                    count: filterCount,
                    fill: filterFill,
                    ink: filterInk,
                    onTap: onOpenFilters,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: ListView.separated(
                      key: const Key('storefrontQuickChips'),
                      scrollDirection: Axis.horizontal,
                      padding: EdgeInsets.zero,
                      itemCount: quickFilters.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (context, index) {
                        final label = quickFilters[index];
                        return StorefrontControlChip(
                          label: label,
                          selected: selectedQuickFilters.contains(label),
                          fill: filterFill,
                          ink: filterInk,
                          onTap: () => onToggleQuickFilter(label),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A 44px tap target around a compact 34px pill.
class StorefrontControlChip extends StatelessWidget {
  const StorefrontControlChip({
    required this.label,
    required this.selected,
    required this.fill,
    required this.ink,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final Color fill;
  final Color ink;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final radius = BorderRadius.circular(AgencyRadius.md);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: SizedBox(
        height: 44,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: selected ? fill : colors.surfaceRaised,
                borderRadius: radius,
                border: Border.all(
                  color: selected ? ink : colors.borderDefault,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  if (selected) ...<Widget>[
                    Icon(Icons.check, size: 13, color: ink),
                    const SizedBox(width: 4),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class StorefrontFiltersButton extends StatelessWidget {
  const StorefrontFiltersButton({
    required this.count,
    required this.fill,
    required this.ink,
    required this.onTap,
    super.key,
  });

  final int count;
  final Color fill;
  final Color ink;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final radius = BorderRadius.circular(AgencyRadius.md);
    return Semantics(
      button: true,
      label: count == 0 ? 'Filters' : 'Filters, $count active',
      child: SizedBox(
        height: 44,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Center(
            child: Container(
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: radius,
                border: Border.all(color: colors.borderDefault),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(Icons.tune, size: 13, color: colors.contentSecondary),
                  const SizedBox(width: 4),
                  Text(
                    'Filters',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary,
                    ),
                  ),
                  if (count > 0) ...<Widget>[
                    const SizedBox(width: 4),
                    Container(
                      constraints:
                          const BoxConstraints(minWidth: 15, minHeight: 15),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: fill,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '$count',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: colors.contentPrimary,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pinned header delegate for [StorefrontControlBar].
class StorefrontControlHeaderDelegate extends SliverPersistentHeaderDelegate {
  StorefrontControlHeaderDelegate({
    required this.sortOptions,
    required this.selectedSort,
    required this.onSort,
    required this.quickFilters,
    required this.selectedQuickFilters,
    required this.onToggleQuickFilter,
    required this.filterCount,
    required this.onOpenFilters,
    required this.resultCount,
    required this.onClearFilters,
  });

  final List<String> sortOptions;
  final String selectedSort;
  final ValueChanged<String> onSort;
  final List<String> quickFilters;
  final Set<String> selectedQuickFilters;
  final ValueChanged<String> onToggleQuickFilter;
  final int filterCount;
  final VoidCallback onOpenFilters;
  final int resultCount;
  final VoidCallback onClearFilters;

  @override
  double get minExtent => StorefrontControlBar.height;

  @override
  double get maxExtent => StorefrontControlBar.height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return StorefrontControlBar(
      sortOptions: sortOptions,
      selectedSort: selectedSort,
      onSort: onSort,
      quickFilters: quickFilters,
      selectedQuickFilters: selectedQuickFilters,
      onToggleQuickFilter: onToggleQuickFilter,
      filterCount: filterCount,
      onOpenFilters: onOpenFilters,
      resultCount: resultCount,
      onClearFilters: onClearFilters,
    );
  }

  @override
  bool shouldRebuild(covariant StorefrontControlHeaderDelegate oldDelegate) {
    return oldDelegate.selectedSort != selectedSort ||
        oldDelegate.filterCount != filterCount ||
        oldDelegate.resultCount != resultCount ||
        oldDelegate.selectedQuickFilters.length !=
            selectedQuickFilters.length ||
        !oldDelegate.selectedQuickFilters.containsAll(selectedQuickFilters);
  }
}
