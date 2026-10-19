import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/widgets.dart';

/// The two storefront control accents, defined in one place (CHG-064).
///
/// Swapping an accent is a one-line change here. Both resolve to existing
/// palette tokens — no new hex values — and both pass 4.5:1 with white:
/// `feedbackSuccess` 5.1:1, `actionDestructive` 5.3:1.
abstract final class StorefrontControlTokens {
  /// SORT accent: the palette's success green.
  static Color sortAccent(BuildContext context) =>
      context.colors.feedbackSuccess;

  /// FILTER accent: the palette's dark red (not the error-only red).
  static Color filterAccent(BuildContext context) =>
      context.colors.actionDestructive;
}
