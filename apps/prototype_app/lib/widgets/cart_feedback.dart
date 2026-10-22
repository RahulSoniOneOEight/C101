import 'package:flutter/material.dart';

/// Short-lived cart feedback.
///
/// The old Material snackbars stayed on screen for several seconds and covered
/// the bottom navigation. Cart feedback is now a compact floating pill that is
/// dismissed after a little over one second.
void showCartAddedToast(BuildContext context, {String? label}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      duration: const Duration(milliseconds: 1100),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 84),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      content: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.check_circle_outline, size: 18, color: Colors.white),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label ?? 'Added to cart',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ),
  );
}

void showCartErrorToast(BuildContext context, [String? message]) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      duration: const Duration(milliseconds: 2200),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 84),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      content: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.error_outline, size: 18, color: Colors.white),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              message ?? 'Could not add to cart. Please retry.',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ),
  );
}
