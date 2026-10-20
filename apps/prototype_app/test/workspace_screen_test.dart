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
  _FakeWorkspaceApi() : super(Dio());

  final List<String> sent = <String>[];
  int readCalls = 0;

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
}

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

  testWidgets('workspace loads channels, messages and sends a message',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _FakeWorkspaceApi();

    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[experienceApiProvider.overrideWithValue(api)],
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const WorkspaceScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Workspace'), findsOneWidget);
    expect(find.text('Procurement'), findsOneWidget);
    expect(find.text('Approvals'), findsOneWidget);
    expect(find.text('Procurement workspace ready.'), findsOneWidget);
    expect(find.textContaining('Phase 1 conversation only'), findsOneWidget);
    expect(api.readCalls, greaterThan(0));

    await tester.enterText(find.byType(TextField), 'Need 50 more units');
    await tester.tap(find.byTooltip('Send message'));
    await tester.pumpAndSettle();

    expect(api.sent, <String>['Need 50 more units']);
    expect(find.text('Need 50 more units'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
