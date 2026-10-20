import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/data/experience_api.dart';
import 'package:prototype_app/domain/conversation_models.dart';
import 'package:prototype_app/domain/models.dart';
import 'package:prototype_app/domain/workspace_models.dart';
import 'package:prototype_app/providers/catalog_providers.dart';
import 'package:prototype_app/providers/conversation_dock_provider.dart';
import 'package:prototype_app/widgets/conversation_bell.dart';
import 'package:prototype_app/widgets/conversation_dock.dart';

class _DockApi extends ExperienceApi {
  _DockApi({
    this.householdMember = false,
    this.householdRole = 'member',
    this.withAssistant = false,
  }) : super(Dio());

  final bool householdMember;
  final String householdRole;
  final bool withAssistant;
  bool draftCreated = false;
  bool proposalCreated = false;
  int shareCalls = 0;
  int acceptCalls = 0;
  int proposalExpectedVersion = -1;
  String? proposalKind;
  List<Map<String, dynamic>>? initialDraftLines;

  static const channel = WorkspaceChannel(
    id: 'ch_project',
    workspaceId: 'ws_household',
    kind: 'project',
    name: 'Kitchen renovation',
  );

  static const assistantChannel = WorkspaceChannel(
    id: 'ch_assistant',
    workspaceId: 'ws_household',
    kind: 'assistant',
    name: 'BuildKart Cart Assistant',
  );

  static const assistantMessage = WorkspaceMessage(
    id: 'msg_assistant',
    channelId: 'ch_assistant',
    actorId: 'assistant_cart',
    actorName: 'BuildKart Cart Assistant',
    body: 'Shared list has 2 lines and 4 units. I cannot build a cart.',
    messageType: 'text',
    sequence: 2,
  );

  WorkspaceSummary get workspace => WorkspaceSummary(
        id: 'ws_household',
        name: 'Kitchen renovation',
        role: householdRole,
        scopeType: 'household',
      );

  WorkspaceDraft get draft => WorkspaceDraft(
        id: 'drf_shared',
        workspaceId: 'ws_household',
        channelId: 'ch_project',
        name: 'Kitchen renovation shared list',
        lifecycleStatus: 'draft',
        validationStatus: 'unvalidated',
        currentVersion: 0,
        role: householdRole,
      );

  DraftProposal get proposal => const DraftProposal(
        id: 'prop_first_line',
        kind: 'add_line',
        status: 'pending',
        proposedBy: 'participant_1',
        expectedVersion: 0,
        payload: <String, dynamic>{
          'line': <String, dynamic>{
            'product_id': 'prod_smoke',
            'variant_id': 'variant_smoke',
            'commercial_snapshot': <String, dynamic>{
              'product_title': 'Smoke tile',
            },
          },
        },
      );

  WorkspaceMessage get sharedMessage => const WorkspaceMessage(
        id: 'msg_share',
        channelId: 'ch_project',
        actorId: 'participant_1',
        actorName: 'Participant',
        body: 'Shared Smoke tile for discussion.',
        messageType: 'product_share',
        sequence: 1,
        references: <WorkspaceMessageReference>[
          WorkspaceMessageReference(
            referenceType: 'product',
            referenceId: 'variant_smoke',
            snapshot: <String, dynamic>{
              'product_title': 'Smoke tile',
              'quantity': 1,
              'unit_amount_minor': 12500,
              'currency_code': 'INR',
            },
          ),
        ],
      );

  @override
  Future<List<WorkspaceSummary>> getWorkspaces() async =>
      householdMember ? <WorkspaceSummary>[workspace] : const [];

  @override
  Future<List<WorkspaceChannel>> getWorkspaceChannels(
          String workspaceId) async =>
      <WorkspaceChannel>[
        channel,
        if (withAssistant) assistantChannel,
      ];

  @override
  Future<List<WorkspaceDraft>> getWorkspaceDrafts(String workspaceId) async =>
      draftCreated ? <WorkspaceDraft>[draft] : const <WorkspaceDraft>[];

  @override
  Future<WorkspaceDraftView> getWorkspaceDraft(String draftId) async =>
      WorkspaceDraftView(
        draft: draft,
        proposals: proposalCreated
            ? <DraftProposal>[proposal]
            : const <DraftProposal>[],
      );

  @override
  Future<WorkspaceDraftView> createWorkspaceDraft({
    required String workspaceId,
    required String channelId,
    required String name,
    required List<Map<String, dynamic>> lines,
  }) async {
    draftCreated = true;
    initialDraftLines = List<Map<String, dynamic>>.of(lines);
    return WorkspaceDraftView(
      draft: draft,
      proposals: const <DraftProposal>[],
    );
  }

  @override
  Future<String> createDraftProposal({
    required String draftId,
    required int expectedVersion,
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    proposalCreated = true;
    proposalExpectedVersion = expectedVersion;
    proposalKind = kind;
    return proposal.id;
  }

  @override
  Future<void> acceptProposal(String proposalId) async {
    acceptCalls += 1;
  }

  @override
  Future<WorkspaceMessage> shareProductToWorkspace({
    required String channelId,
    required String productId,
    required String variantId,
    required String offerId,
    required int quantity,
    String? sellerId,
    String? productTitle,
    String? materialInstruction,
    Map<String, dynamic>? commercialSnapshot,
  }) async {
    shareCalls += 1;
    return sharedMessage;
  }

  @override
  Future<WorkspaceMessagePage> getWorkspaceMessages(
    String channelId, {
    String? cursor,
  }) async {
    if (channelId == assistantChannel.id) {
      return const WorkspaceMessagePage(
        messages: <WorkspaceMessage>[assistantMessage],
        nextCursor: '2',
      );
    }
    return WorkspaceMessagePage(
      messages: shareCalls == 0
          ? const <WorkspaceMessage>[]
          : <WorkspaceMessage>[sharedMessage],
      nextCursor: shareCalls == 0 ? '0' : '1',
    );
  }

  @override
  Future<WorkspaceInvitationPage> getWorkspaceInvitations(
          String workspaceId) async =>
      const WorkspaceInvitationPage(
        invitations: <WorkspaceInvitation>[],
        participants: 0,
        capacity: 3,
      );

  @override
  Future<void> markWorkspaceRead(String channelId, int sequence) async {}
}

class _StateProbe extends StatefulWidget {
  const _StateProbe();

  @override
  State<_StateProbe> createState() => _StateProbeState();
}

class _StateProbeState extends State<_StateProbe> {
  int value = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: FilledButton(
            onPressed: () => setState(() => value += 1),
            child: Text('Underlying state $value'),
          ),
        ),
      );
}

List<Override> _overrides(ExperienceApi api) => <Override>[
      experienceApiProvider.overrideWithValue(api),
    ];

Widget _host(ExperienceApi api) => ProviderScope(
      overrides: _overrides(api),
      child: MaterialApp(
        theme: AgencyTheme.light(),
        home: Scaffold(
          appBar: AppBar(
            actions: const <Widget>[
              ConversationBellButton(audience: ConversationAudience.household),
            ],
          ),
          body: const ConversationDockHost(
            audience: ConversationAudience.household,
            enabled: true,
            child: _StateProbe(),
          ),
        ),
      ),
    );

void main() {
  test('dock state keeps a product capture separate from cart state', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    const capture = ConversationProductCapture(
      productId: 'prod_1',
      variantId: 'variant_1',
      offerId: 'offer_1',
      title: 'Tile',
      quantity: 2,
      unitAmountMinor: 25000,
      currencyCode: 'INR',
    );

    container
        .read(conversationDockProvider.notifier)
        .discuss(ConversationAudience.household, capture);
    final opened = container.read(conversationDockProvider);

    expect(opened.isOpen, isTrue);
    expect(opened.pendingCapture, same(capture));
    expect(opened.tab, ConversationDockTab.chat);
    container
        .read(conversationDockProvider.notifier)
        .clearCapture(opened.captureRequest - 1);
    expect(
        container.read(conversationDockProvider).pendingCapture, same(capture));
    container
        .read(conversationDockProvider.notifier)
        .clearCapture(opened.captureRequest);
    expect(container.read(conversationDockProvider).pendingCapture, isNull);
  });

  testWidgets('chat can add a catalogue product without leaving the dock',
      (tester) async {
    final api = _DockApi(householdMember: true, householdRole: 'owner');
    const product = Product(
      id: 'prod_smoke',
      title: 'Smoke tile',
      variants: <ProductVariant>[
        ProductVariant(
          id: 'variant_smoke',
          label: 'Default',
          sku: 'SKU-SMOKE',
          offerId: 'offer_smoke',
          price: Money(amount: 12500, currencyCode: 'INR'),
        ),
      ],
    );
    final container = ProviderContainer(
      overrides: <Override>[
        experienceApiProvider.overrideWithValue(api),
        productsProvider.overrideWith((ref) => const <Product>[product]),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: Scaffold(
            appBar: AppBar(
              actions: const <Widget>[
                ConversationBellButton(
                    audience: ConversationAudience.household),
              ],
            ),
            body: const ConversationDockHost(
              audience: ConversationAudience.household,
              enabled: true,
              child: _StateProbe(),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.text('Project conversation'), findsOneWidget);

    await tester.tap(find.byTooltip('Add product'));
    await tester.pumpAndSettle();
    expect(find.text('Add a product'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Search catalogue'), 'smoke');
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add_circle_outline).last);
    await tester.pumpAndSettle();

    expect(api.shareCalls, 1);
    expect(api.draftCreated, isTrue);
    expect(api.proposalCreated, isTrue);
    expect(api.acceptCalls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('header bell opens the conversation without a bottom launcher',
      (tester) async {
    await tester.pumpWidget(_host(_DockApi(householdMember: true)));
    await tester.pumpAndSettle();
    expect(find.text('Conversations'), findsNothing);

    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();
    expect(find.text('Project conversation'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('assistant has a separate, visibly automated thread at 360',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(_DockApi(
      householdMember: true,
      householdRole: 'owner',
      withAssistant: true,
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Conversations'));
    await tester.pumpAndSettle();

    expect(find.text('Assistant'), findsOneWidget);
    await tester.tap(find.text('Assistant'));
    await tester.pumpAndSettle();

    expect(find.text('BuildKart Cart Assistant'), findsWidgets);
    expect(find.text('Automated · BuildKart Cart Assistant'), findsOneWidget);
    expect(
      find.text('Shared list has 2 lines and 4 units. I cannot build a cart.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Chat'));
    await tester.pumpAndSettle();
    expect(find.text('Project conversation'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final size in <Size>[const Size(390, 844), const Size(360, 800)]) {
    testWidgets(
        'dock preserves its page at ${size.width.toInt()}x${size.height.toInt()}',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_host(_DockApi()));
      await tester.tap(find.text('Underlying state 0'));
      await tester.pump();
      expect(find.text('Underlying state 1'), findsOneWidget);

      await tester.tap(find.byTooltip('Conversations'));
      await tester.pumpAndSettle();
      expect(find.text('Start a renovation project'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byTooltip('Close conversations'));
      await tester.pumpAndSettle();
      expect(find.text('Underlying state 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('participant capture creates a proposal, never a direct revision',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final api = _DockApi(householdMember: true);
    final container = ProviderContainer(overrides: _overrides(api));
    addTearDown(container.dispose);
    const product = Product(
      id: 'prod_smoke',
      title: 'Smoke tile',
      variants: <ProductVariant>[
        ProductVariant(
          id: 'variant_smoke',
          label: 'Default',
          offerId: 'offer_smoke',
          price: Money(amount: 12500, currencyCode: 'INR'),
        ),
      ],
    );
    container.read(conversationDockProvider.notifier).discuss(
          ConversationAudience.household,
          ConversationProductCapture.fromProduct(product),
        );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AgencyTheme.light(),
          home: const ConversationDockHost(
            audience: ConversationAudience.household,
            enabled: true,
            child: _StateProbe(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(api.shareCalls, 1);
    expect(api.initialDraftLines, isEmpty);
    expect(api.proposalKind, 'add_line');
    expect(api.proposalExpectedVersion, 0);
    expect(api.acceptCalls, 0);
    container
        .read(conversationDockProvider.notifier)
        .selectTab(ConversationDockTab.sharedList);
    await tester.pumpAndSettle();
    expect(find.text('Pending proposals'), findsOneWidget);
    expect(find.text('Accept'), findsNothing);
    expect(find.byTooltip('Project actions'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
