/// Collaborative workspace projections returned by the Experience API.
///
/// Phase 2 adds immutable purchase-draft revisions, proposals and
/// revision-bound approvals. Commerce revalidation and checkout handoff remain
/// Phase 3.
library;

int _asInt(Object? value) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

Map<String, dynamic> _asMap(Object? value) =>
    value is Map<String, dynamic> ? value : const <String, dynamic>{};

class WorkspaceSummary {
  const WorkspaceSummary({
    required this.id,
    required this.name,
    required this.role,
    this.scopeType = 'business_account',
    this.unreadCount = 0,
  });

  final String id;
  final String name;
  final String role;
  final String scopeType;
  final int unreadCount;

  bool get isHousehold => scopeType == 'household';
  bool get isBusinessAccount => scopeType == 'business_account';
  bool get isOwner => role == 'owner';
  bool get canManageInvitations => isHousehold && isOwner;
  bool get canContributeToSharedList =>
      role == 'owner' || role == 'member' || role == 'buyer' || role == 'admin';

  factory WorkspaceSummary.fromJson(Map<String, dynamic> json) =>
      WorkspaceSummary(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'Workspace',
        role: json['role'] as String? ?? 'member',
        scopeType: json['scope_type'] as String? ?? 'business_account',
        unreadCount: _asInt(json['unread_count']),
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
        unreadCount: _asInt(json['unread_count']),
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
    this.references = const <WorkspaceMessageReference>[],
  });

  final String id;
  final String channelId;
  final String actorId;
  final String actorName;
  final String body;
  final String messageType;
  final int sequence;
  final DateTime? createdAt;
  final List<WorkspaceMessageReference> references;

  bool get isCommerceEvent =>
      messageType == 'product_share' || messageType == 'commerce_event';

  WorkspaceMessageReference? get productReference =>
      references.where((ref) => ref.referenceType == 'product').firstOrNull;

  factory WorkspaceMessage.fromJson(Map<String, dynamic> json) =>
      WorkspaceMessage(
        id: json['id'] as String? ?? '',
        channelId: json['channel_id'] as String? ?? '',
        actorId: json['actor_id'] as String? ?? '',
        actorName: json['actor_name'] as String? ?? 'Member',
        body: json['body'] as String? ?? '',
        messageType: json['message_type'] as String? ?? 'text',
        sequence: _asInt(json['sequence']),
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
        references: (json['references'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WorkspaceMessageReference.fromJson)
            .toList(),
      );
}

class WorkspaceMessageReference {
  const WorkspaceMessageReference({
    required this.referenceType,
    required this.referenceId,
    required this.snapshot,
  });

  final String referenceType;
  final String referenceId;
  final Map<String, dynamic> snapshot;

  String get title =>
      snapshot['product_title'] as String? ?? 'Catalogue product';
  String get sellerName => snapshot['seller_name'] as String? ?? '';
  String get sku => snapshot['sku'] as String? ?? '';
  int get quantity => _asInt(snapshot['quantity']);
  int get unitAmountMinor => _asInt(snapshot['unit_amount_minor']);

  factory WorkspaceMessageReference.fromJson(Map<String, dynamic> json) =>
      WorkspaceMessageReference(
        referenceType: json['reference_type'] as String? ?? 'product',
        referenceId: json['reference_id'] as String? ?? '',
        snapshot: _asMap(json['display_snapshot']),
      );
}

class DraftLine {
  const DraftLine({
    required this.lineKey,
    required this.productId,
    required this.variantId,
    required this.sellerId,
    required this.offerId,
    required this.quantity,
    required this.unitAmountMinor,
    required this.currencyCode,
    required this.productTitle,
    required this.sellerName,
    this.sku = '',
    this.materialInstruction,
  });

  final String lineKey;
  final String productId;
  final String variantId;
  final String sellerId;
  final String offerId;
  final int quantity;
  final int unitAmountMinor;
  final String currencyCode;
  final String productTitle;
  final String sellerName;
  final String sku;
  final String? materialInstruction;

  int get lineTotalMinor => quantity * unitAmountMinor;

  factory DraftLine.fromJson(Map<String, dynamic> json) {
    final snapshot = _asMap(json['commercial_snapshot']);
    return DraftLine(
      lineKey: json['line_key'] as String? ?? '',
      productId: json['product_id'] as String? ?? '',
      variantId: json['variant_id'] as String? ?? '',
      sellerId: json['seller_id'] as String? ?? '',
      offerId: json['offer_id'] as String? ?? '',
      quantity: _asInt(json['quantity']),
      unitAmountMinor: _asInt(snapshot['unit_amount_minor']),
      currencyCode: snapshot['currency_code'] as String? ?? 'INR',
      productTitle: snapshot['product_title'] as String? ?? 'Catalogue product',
      sellerName: snapshot['seller_name'] as String? ?? '',
      sku: snapshot['sku'] as String? ?? '',
      materialInstruction: json['material_instruction'] as String?,
    );
  }
}

class DraftRevision {
  const DraftRevision({
    required this.id,
    required this.version,
    required this.commercialHash,
    required this.lines,
  });

  final String id;
  final int version;
  final String commercialHash;
  final List<DraftLine> lines;

  int get lineCount => lines.length;
  int get totalMinor =>
      lines.fold<int>(0, (sum, line) => sum + line.lineTotalMinor);

  factory DraftRevision.fromJson(Map<String, dynamic> json) => DraftRevision(
        id: json['id'] as String? ?? '',
        version: _asInt(json['version']),
        commercialHash: json['commercial_hash'] as String? ?? '',
        lines: (json['lines'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(DraftLine.fromJson)
            .toList(),
      );
}

class WorkspaceDraft {
  const WorkspaceDraft({
    required this.id,
    required this.workspaceId,
    required this.channelId,
    required this.name,
    required this.lifecycleStatus,
    required this.validationStatus,
    required this.currentVersion,
    required this.role,
  });

  final String id;
  final String workspaceId;
  final String channelId;
  final String name;
  final String lifecycleStatus;
  final String validationStatus;
  final int currentVersion;
  final String role;

  /// Roles that may propose a change to the shared list.
  bool get canEdit =>
      role == 'buyer' || role == 'admin' || role == 'owner' || role == 'member';

  bool get canDecideProposal =>
      role == 'buyer' || role == 'admin' || role == 'owner';
  bool get canApprove => role == 'approver';
  bool get isHouseholdRole => role == 'owner' || role == 'member';
  bool get isOwner => role == 'owner';
  bool get isApproved => lifecycleStatus == 'approved';
  bool get isReviewRequested => lifecycleStatus == 'review_requested';

  factory WorkspaceDraft.fromJson(Map<String, dynamic> json) => WorkspaceDraft(
        id: json['id'] as String? ?? '',
        workspaceId: json['workspace_id'] as String? ?? '',
        channelId: json['channel_id'] as String? ?? '',
        name: json['name'] as String? ?? 'Purchase draft',
        lifecycleStatus: json['lifecycle_status'] as String? ?? 'draft',
        validationStatus: json['validation_status'] as String? ?? 'unvalidated',
        currentVersion: _asInt(json['current_version']),
        role: json['role'] as String? ?? 'member',
      );
}

class DraftProposal {
  const DraftProposal({
    required this.id,
    required this.kind,
    required this.status,
    required this.proposedBy,
    required this.expectedVersion,
    required this.payload,
    this.createdAt,
  });

  final String id;
  final String kind;
  final String status;
  final String proposedBy;
  final int expectedVersion;
  final Map<String, dynamic> payload;
  final DateTime? createdAt;

  bool get isPending => status == 'pending';

  factory DraftProposal.fromJson(Map<String, dynamic> json) => DraftProposal(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        proposedBy: json['proposed_by'] as String? ?? '',
        expectedVersion: _asInt(json['expected_version']),
        payload: _asMap(json['payload']),
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
      );
}

class DraftApproval {
  const DraftApproval({
    required this.id,
    required this.revisionId,
    required this.commercialHash,
    required this.decision,
    required this.requestedBy,
    this.comment,
    this.decisionComment,
    this.decidedAt,
  });

  final String id;
  final String revisionId;
  final String commercialHash;
  final String decision;
  final String requestedBy;
  final String? comment;
  final String? decisionComment;
  final DateTime? decidedAt;

  bool get isPending => decision == 'pending';

  factory DraftApproval.fromJson(Map<String, dynamic> json) => DraftApproval(
        id: json['id'] as String? ?? '',
        revisionId: json['revision_id'] as String? ?? '',
        commercialHash: json['commercial_hash'] as String? ?? '',
        decision: json['decision'] as String? ?? 'pending',
        requestedBy: json['requested_by'] as String? ?? '',
        comment: json['comment'] as String?,
        decisionComment: json['decision_comment'] as String?,
        decidedAt: DateTime.tryParse(json['decided_at'] as String? ?? ''),
      );
}

class WorkspaceDraftView {
  const WorkspaceDraftView({
    required this.draft,
    required this.proposals,
    this.revision,
    this.approval,
  });

  final WorkspaceDraft draft;
  final DraftRevision? revision;
  final DraftApproval? approval;
  final List<DraftProposal> proposals;

  factory WorkspaceDraftView.fromJson(Map<String, dynamic> json) {
    final revisionJson = json['revision'];
    final approvalJson = json['approval'];
    return WorkspaceDraftView(
      draft: WorkspaceDraft.fromJson(_asMap(json['draft'])),
      revision: revisionJson is Map<String, dynamic>
          ? DraftRevision.fromJson(revisionJson)
          : null,
      approval: approvalJson is Map<String, dynamic>
          ? DraftApproval.fromJson(approvalJson)
          : null,
      proposals: (json['proposals'] as List? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(DraftProposal.fromJson)
          .toList(),
    );
  }
}

class WorkspaceStreamTicket {
  const WorkspaceStreamTicket({
    required this.ticket,
    required this.signature,
    required this.expiresInSeconds,
  });

  final String ticket;
  final String signature;
  final int expiresInSeconds;

  factory WorkspaceStreamTicket.fromJson(Map<String, dynamic> json) =>
      WorkspaceStreamTicket(
        ticket: json['ticket'] as String? ?? '',
        signature: json['signature'] as String? ?? '',
        expiresInSeconds: _asInt(json['expires_in_seconds']),
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

class WorkspaceInvitation {
  const WorkspaceInvitation({
    required this.id,
    required this.inviteeEmail,
    required this.status,
    this.expiresAt,
    this.acceptedAt,
    this.revokedAt,
  });

  final String id;
  final String inviteeEmail;
  final String status;
  final DateTime? expiresAt;
  final DateTime? acceptedAt;
  final DateTime? revokedAt;

  bool get canRevoke => status == 'pending';

  factory WorkspaceInvitation.fromJson(Map<String, dynamic> json) =>
      WorkspaceInvitation(
        id: json['id'] as String? ?? '',
        inviteeEmail: json['invitee_email'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        expiresAt: DateTime.tryParse(json['expires_at'] as String? ?? ''),
        acceptedAt: DateTime.tryParse(json['accepted_at'] as String? ?? ''),
        revokedAt: DateTime.tryParse(json['revoked_at'] as String? ?? ''),
      );
}

class WorkspaceInvitationPage {
  const WorkspaceInvitationPage({
    required this.invitations,
    required this.participants,
    required this.capacity,
  });

  final List<WorkspaceInvitation> invitations;
  final int participants;
  final int capacity;

  factory WorkspaceInvitationPage.fromJson(Map<String, dynamic> json) =>
      WorkspaceInvitationPage(
        invitations: (json['invitations'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(WorkspaceInvitation.fromJson)
            .toList(),
        participants: _asInt(json['participants']),
        capacity: _asInt(json['capacity']),
      );
}

class WorkspaceInvitationCreated {
  const WorkspaceInvitationCreated({
    required this.invitation,
    required this.token,
  });

  final WorkspaceInvitation invitation;
  final String token;

  factory WorkspaceInvitationCreated.fromJson(Map<String, dynamic> json) =>
      WorkspaceInvitationCreated(
        invitation: WorkspaceInvitation.fromJson(_asMap(json['invitation'])),
        token: json['invite_token'] as String? ?? '',
      );
}
