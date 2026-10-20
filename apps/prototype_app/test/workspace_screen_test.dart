import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/workspace_models.dart';
import 'package:prototype_app/screens/workspace_screen.dart';

class _FakeWorkspaceApi extends ExperienceApi {
  _FakeWorkspaceApi({
    this.draftRole = 'buyer',
    bool pendingApproval = false,
  })  : approvalActive = pendingApproval,
        super(Dio());

  final String draftRole;
  bool approvalActive;
  final List<String> sent = <String>[];
  final List<String> proposedKinds = <String>[];
  final List<String> approvalDecisions = <String>[];
  int readCalls = 0;
  int approvalRequests = 0;
  int acceptedProposals = 0;
  String lifecycle = 'draft';
  int version = 1;
  final List<DraftProposal> proposals = <DraftProposal>[];

  @override
  Future<List<WorkspaceSummary>> getWorkspaces() async =>
      const <WorkspaceSummary>[
        WorkspaceSummary(
          id: 'ws_arjun_procurement',
          name: 'Arjun Traders Procurement',
          role: 'buyer',
        ),
      ];

  @override
  Future<List<WorkspaceChannel>> getWorkspaceChannels(
          String workspaceId) async =>
      const <WorkspaceChannel>[
        WorkspaceChannel(
          id: 'ch_arjun_procurement',
          workspaceId: 'ws_arjun_procurement',
          kind: 'procurement',
          name: 'Procurement',
        ),
        WorkspaceChannel(
          id: 'ch_arjun_approvals',
          workspaceId: 'ws_arjun_procurement',
          kind: 'approvals',
          name: 'Approvals',
        ),
      ];

  @override
  Future<WorkspaceMessagePage> getWorkspaceMessages(
    String channelId, {
    String? cursor,
  }) async {
    if (cursor != null) {
      return const WorkspaceMessagePage(
          messages: <WorkspaceMessage>[], nextCursor: '1');
    }
    return const WorkspaceMessagePage(
      messages: <WorkspaceMessage>[
        WorkspaceMessage(
          id: 'msg_welcome',
          channelId: 'ch_arjun_procurement',
          actorId: 'pilot_admin_b2b01',
          actorName: 'Arjun Traders Admin',
          body: 'Procurement workspace ready.',
          messageType: 'text',
          sequence: 1,
        ),
      ],
      nextCursor: '1',
    );
  }

  @override
  Future<WorkspaceMessage> sendWorkspaceMessage(
    String channelId,
    String body,
  ) async {
    sent.add(body);
    return WorkspaceMessage(
      id: 'msg_sent',
      channelId: channelId,
      actorId: 'pilot_buyer_b2b01',
      actorName: 'Arjun Traders Buyer',
      body: body,
      messageType: 'text',
      sequence: 2,
    );
  }

  @override
  Future<void> markWorkspaceRead(String channelId, int sequence) async {
    readCalls += 1;
  }

  @override
  Future<WorkspaceStreamTicket> createWorkspaceStreamTicket(
    String workspaceId,
  ) async {
    throw UnsupportedError('WebSocket is not available in this test');
  }

  @override
  Future<List<WorkspaceDraft>> getWorkspaceDrafts(String workspaceId) async =>
      const <WorkspaceDraft>[
        WorkspaceDraft(
          id: 'drf_arjun_staging',
          workspaceId: 'ws_arjun_procurement',
          channelId: 'ch_arjun_procurement',
          name: 'Arjun site replenishment',
          lifecycleStatus: 'draft',
          validationStatus: 'unvalidated',
          currentVersion: 1,
          role: 'buyer',
        ),
      ];

  @override
  Future<WorkspaceDraftView> getWorkspaceDraft(String draftId) async {
    final approval = approvalActive
        ? const DraftApproval(
            id: 'apr_1',
            revisionId: 'rev_1',
            commercialHash: 'abcdef1234567890',
            decision: 'pending',
            requestedBy: 'pilot_admin_b2b01',
            comment: 'Please approve the staged replenishment.',
          )
        : null;
    return WorkspaceDraftView(
      draft: WorkspaceDraft(
        id: draftId,
        workspaceId: 'ws_arjun_procurement',
        channelId: 'ch_arjun_procurement',
        name: 'Arjun site replenishment',
        lifecycleStatus: lifecycle,
        validationStatus: 'unvalidated',
        currentVersion: version,
        role: draftRole,
      ),
      revision: DraftRevision(
        id: 'rev_1',
        version: version,
        commercialHash: 'abcdef1234567890',
        lines: const <DraftLine>[
          DraftLine(
            lineKey: 'line_board',
            productId: 'prod_board',
            variantId: 'variant_board',
            sellerId: 'seller_urban',
            offerId: 'offer_board',
            quantity: 4,
            unitAmountMinor: 43690,
            currencyCode: 'INR',
            productTitle: "Action Tesa HDHMR Board, Plain, 8' X 4'",
            sellerName: 'UrbanBuild Supply',
          ),
        ],
      ),
      approval: approval,
      proposals: List<DraftProposal>.unmodifiable(proposals),
    );
  }

  @override
  Future<void> proposeDraftChange({
    required String draftId,
    required int expectedVersion,
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    proposedKinds.add(kind);
    proposals.insert(
      0,
      DraftProposal(
        id: 'prop_${proposals.length + 1}',
        kind: kind,
        status: 'pending',
        proposedBy: 'pilot_buyer_b2b01',
        expectedVersion: expectedVersion,
        payload: payload,
      ),
    );
  }

  @override
  Future<void> acceptProposal(String proposalId) async {
    acceptedProposals += 1;
    proposals.removeWhere((proposal) => proposal.id == proposalId);
    version += 1;
  }

  @override
  Future<void> rejectProposal(String proposalId) async {
    proposals.removeWhere((proposal) => proposal.id == proposalId);
  }

  @override
  Future<void> requestDraftApproval({
    required String draftId,
    required int expectedVersion,
    required String revisionId,
    required String commercialHash,
    String? comment,
  }) async {
    approvalRequests += 1;
    approvalActive = true;
    lifecycle = 'review_requested';
  }

  @override
  Future<void> decideDraftApproval(
    String approvalId,
    String action, {
    String? comment,
  }) async {
    approvalDecisions.add(action);
    lifecycle = action == 'approve'
        ? 'approved'
        : action == 'request-changes'
            ? 'changes_requested'
            : 'draft';
  }
}

Widget _app(_FakeWorkspaceApi api) => ProviderScope(
      overrides: <Override>[experienceApiProvider.overrideWithValue(api)],
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: const WorkspaceScreen(),
      ),
    );

void main() {
  test('workspace models accept bigint sequence values serialized as strings',
      () {
    final message = WorkspaceMessage.fromJson(const <String, dynamic>{
      'id': 'msg_1',
      'channel_id': 'ch_1',
      'actor_id': 'pilot_buyer_b2b01',
      'actor_name': 'Buyer',
      'body': 'Hello',
      'message_type': 'text',
      'sequence': '42',
    });
    final workspace = WorkspaceSummary.fromJson(const <String, dynamic>{
      'id': 'ws_1',
      'name': 'Workspace',
      'role': 'buyer',
      'unread_count': '3',
    });

    expect(message.sequence, 42);
    expect(workspace.unreadCount, 3);
  });

  test('draft models parse string versions and line snapshots', () {
    final view = WorkspaceDraftView.fromJson(const <String, dynamic>{
      'draft': <String, dynamic>{
        'id': 'drf_1',
        'workspace_id': 'ws_1',
        'channel_id': 'ch_1',
        'name': 'Replenishment',
        'lifecycle_status': 'review_requested',
        'validation_status': 'unvalidated',
        'current_version': '2',
        'role': 'buyer',
      },
      'revision': <String, dynamic>{
        'id': 'rev_1',
        'version': '2',
        'commercial_hash': 'hash',
        'lines': <dynamic>[
          <String, dynamic>{
            'line_key': 'line_board',
            'product_id': 'prod_1',
            'variant_id': 'variant_1',
            'seller_id': 'seller_1',
            'offer_id': 'offer_1',
            'quantity': '3',
            'commercial_snapshot': <String, dynamic>{
              'unit_amount_minor': 43690,
              'currency_code': 'INR',
              'product_title': 'Board',
            },
          },
        ],
      },
      'approval': <String, dynamic>{
        'id': 'apr_1',
        'revision_id': 'rev_1',
        'commercial_hash': 'hash',
        'decision': 'pending',
        'requested_by': 'pilot_admin_b2b01',
      },
      'proposals': <dynamic>[],
    });

    expect(view.draft.currentVersion, 2);
    expect(view.revision!.version, 2);
    expect(view.revision!.lines.single.quantity, 3);
    expect(view.revision!.totalMinor, 131070);
    expect(view.approval!.isPending, isTrue);
  });

  testWidgets('workspace loads channels, messages and sends a message',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _FakeWorkspaceApi();

    await tester.pumpWidget(_app(api));
    await tester.pumpAndSettle();

    expect(find.text('Workspace'), findsOneWidget);
    expect(find.text('Procurement'), findsOneWidget);
    expect(find.text('Approvals'), findsOneWidget);
    expect(find.text('Procurement workspace ready.'), findsOneWidget);
    expect(find.textContaining('Phase 2 conversation'), findsOneWidget);
    expect(api.readCalls, greaterThan(0));

    await tester.enterText(find.byType(TextField), 'Need 50 more units');
    await tester.tap(find.byTooltip('Send message'));
    await tester.pumpAndSettle();

    expect(api.sent, <String>['Need 50 more units']);
    expect(find.text('Need 50 more units'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('buyer can propose a quantity change and request approval',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _FakeWorkspaceApi();

    await tester.pumpWidget(_app(api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Purchase draft'));
    await tester.pumpAndSettle();

    expect(find.text('Arjun site replenishment'), findsOneWidget);
    expect(find.text('Qty 4'), findsOneWidget);
    expect(find.text('Request approval for this revision'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(api.proposedKinds, <String>['update_quantity']);
    expect(find.text('Change quantity to 5'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget);

    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();
    expect(api.acceptedProposals, 1);

    await tester.tap(find.text('Request approval for this revision'));
    await tester.pumpAndSettle();
    expect(api.approvalRequests, 1);
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for an approver. Any edit supersedes this request.'),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('approver sees the bound revision and decides it',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _FakeWorkspaceApi(
      draftRole: 'approver',
      pendingApproval: true,
    );

    await tester.pumpWidget(_app(api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Purchase draft'));
    await tester.pumpAndSettle();

    expect(find.text('Approve'), findsOneWidget);
    expect(find.text('Request changes'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsNothing);

    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    expect(api.approvalDecisions, <String>['approve']);
    expect(tester.takeException(), isNull);
  });
}
