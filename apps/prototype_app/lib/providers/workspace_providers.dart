import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import 'pilot_providers.dart';

/// Total unread workspace messages for the signed-in B2B member.
///
/// Returns 0 for anonymous/B2C sessions and on any API failure; the icon is a
/// convenience, never a commerce signal.
final workspaceUnreadCountProvider =
    FutureProvider.autoDispose<int>((ref) async {
  ref.watch(pilotOtpProvider);
  final api = ref.watch(experienceApiProvider);
  if (api.sessionUserId == null) return 0;
  try {
    final workspaces = await api.getWorkspaces();
    return workspaces.fold<int>(
      0,
      (total, workspace) => total + workspace.unreadCount,
    );
  } catch (_) {
    return 0;
  }
});
