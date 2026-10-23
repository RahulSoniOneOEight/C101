import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/conversation_dock_provider.dart';
import '../providers/workspace_providers.dart';

/// Compact conversation entry for the shared header.
///
/// Replaces the bottom floating launcher. It sits beside the notification bell
/// and opens the slide-over dock for the current channel.
class ConversationBellButton extends ConsumerWidget {
  const ConversationBellButton({required this.audience, super.key});

  final ConversationAudience audience;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(workspaceUnreadCountProvider).value ?? 0;
    return IconButton(
      tooltip: 'Conversations',
      onPressed: () =>
          ref.read(conversationDockProvider.notifier).open(audience),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text('$unread'),
        child: const Icon(Icons.forum_outlined),
      ),
    );
  }
}
