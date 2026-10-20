/// B2B collaborative workspace projections returned by the Experience API.
///
/// Phase 1 is conversation-only: workspaces, channels and messages. Purchase
/// drafts, proposals and approvals arrive in Phase 2 and are intentionally not
/// modelled here yet.
library;

class WorkspaceSummary {
  const WorkspaceSummary({
    required this.id,
    required this.name,
    required this.role,
    this.unreadCount = 0,
  });

  final String id;
  final String name;
  final String role;
  final int unreadCount;

  factory WorkspaceSummary.fromJson(Map<String, dynamic> json) =>
      WorkspaceSummary(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Workspace',
        role: json['role'] as String? ?? 'member',
        unreadCount: (json['unread_count'] as num?)?.toInt() ?? 0,
      );
}

class WorkspaceChannel {
  const WorkspaceChannel({
    required this.id,
    required this.workspaceId,
    required this.kind,
    required this.name,
    this.unreadCount = 0,
  });

  final String id;
  final String workspaceId;
  final String kind;
  final String name;
  final int unreadCount;

  factory WorkspaceChannel.fromJson(Map<String, dynamic> json) =>
      WorkspaceChannel(
        id: json['id'] as String? ?? '',
        workspaceId: json['workspace_id'] as String? ?? '',
        kind: json['kind'] as String? ?? 'procurement',
        name: json['name'] as String? ?? 'Procurement',
        unreadCount: (json['unread_count'] as num?)?.toInt() ?? 0,
      );
}

class WorkspaceMessage {
  const WorkspaceMessage({
    required this.id,
    required this.channelId,
    required this.actorId,
    required this.actorName,
    required this.body,
    required this.messageType,
    required this.sequence,
    this.createdAt,
  });

  final String id;
  final String channelId;
  final String actorId;
  final String actorName;
  final String body;
  final String messageType;
  final int sequence;
  final DateTime? createdAt;

  bool get isCommerceEvent =>
      messageType == 'product_share' || messageType == 'commerce_event';

  factory WorkspaceMessage.fromJson(Map<String, dynamic> json) =>
      WorkspaceMessage(
        id: json['id'] as String? ?? '',
        channelId: json['channel_id'] as String? ?? '',
        actorId: json['actor_id'] as String? ?? '',
        actorName: json['actor_name'] as String? ?? 'Member',
        body: json['body'] as String? ?? '',
        messageType: json['message_type'] as String? ?? 'text',
        sequence: (json['sequence'] as num?)?.toInt() ?? 0,
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
      );
}

class WorkspaceMessagePage {
  const WorkspaceMessagePage({
    required this.messages,
    required this.nextCursor,
  });

  final List<WorkspaceMessage> messages;
  final String nextCursor;
}
