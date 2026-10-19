import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/widgets.dart';

/// The two storefront control accents, defined in one place (CHG-064).
///
/// Swapping an accent is a one-line change here. Selected chips use the
/// palette's subtle green/red surfaces with the matching darker ink, so the
/// control stays light while text keeps a strong contrast.
abstract final class StorefrontControlTokens {
  /// SORT fill: pale success green.
  static Color sortFill(BuildContext context) => context.colors.trustSubtle;

  /// SORT ink: the palette's success green (4.5:1 on [sortFill]).
  static Color sortInk(BuildContext context) => context.colors.feedbackSuccess;

  /// FILTER fill: pale promotion red.
  static Color filterFill(BuildContext context) =>
      context.colors.promotionSubtle;

  /// FILTER ink: the palette's dark red (4.5:1 on [filterFill]).
  static Color filterInk(BuildContext context) =>
      context.colors.actionDestructive;
}
