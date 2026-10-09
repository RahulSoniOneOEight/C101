import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/b2b_support_models.dart';
import 'package:prototype_app/providers/b2b_support_providers.dart';
import 'package:prototype_app/screens/b2b_project_screens.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:prototype_app/screens/b2b_support_screens.dart';

/// In-memory stand-ins for the persisted notifiers so widget tests can inject a
/// known fixture without a SharedPreferences-backed store.
class _FakeApprovals extends ApprovalsNotifier {
  _FakeApprovals(this._items);
  final List<ApprovalItem> _items;
  @override
  List<ApprovalItem> build() => _items;
}

class _FakeTeam extends TeamMembersNotifier {
  _FakeTeam(this._items);
  final List<TeamMember> _items;
  @override
  List<TeamMember> build() => _items;
}

class _FakeProjects extends ProjectsNotifier {
  _FakeProjects(this._projects);
  final List<ProjectSummary> _projects;
  @override
  List<ProjectSummary> build() => _projects;
}

void main() {
  testWidgets('Approvals render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        approvalItemsProvider.overrideWith(() => _FakeApprovals(const <ApprovalItem>[
              ApprovalItem(
                  ref: 'Order #TEST-1',
                  amountLabel: '₹1',
                  state: ApprovalState.approved),
            ])),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BApprovalsScreen()),
    ));
    expect(find.text('Order #TEST-1'), findsOneWidget);
    expect(find.text('Approved'), findsOneWidget);
  });

  testWidgets('Approver decision updates a pending approval', (tester) async {
    final container = ProviderContainer(overrides: [
      approvalItemsProvider.overrideWith(() => _FakeApprovals(const <ApprovalItem>[
            ApprovalItem(
                ref: 'Order #B-2231',
                amountLabel: '₹48,900',
                state: ApprovalState.pending),
          ])),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BApprovalsScreen()),
    ));
    expect(find.text('Approve'), findsOneWidget);
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();

    expect(container.read(approvalItemsProvider).single.state,
        ApprovalState.approved);
    expect(find.text('Approve'), findsNothing);
  });

  test('Team invite and role edit persist in state', () async {
    final container = ProviderContainer(overrides: [
      teamMembersProvider.overrideWith(() => _FakeTeam(const <TeamMember>[])),
    ]);
    addTearDown(container.dispose);

    final notifier = container.read(teamMembersProvider.notifier);
    expect(await notifier.invite(name: 'Asha Menon', role: 'Buyer'), isTrue);
    expect(container.read(teamMembersProvider).single.name, 'Asha Menon');
    // Duplicate names are rejected.
    expect(await notifier.invite(name: 'asha menon', role: 'Admin'), isFalse);
    await notifier.updateRole('Asha Menon', 'Approver');
    expect(container.read(teamMembersProvider).single.role, 'Approver');
  });

  test('Project creation appends a persisted project', () async {
    final container = ProviderContainer(overrides: [
      projectsProvider.overrideWith(() => _FakeProjects(const <ProjectSummary>[])),
    ]);
    addTearDown(container.dispose);

    final created = await container
        .read(projectsProvider.notifier)
        .create(name: 'Harbour Depot', location: 'Kochi');
    expect(created, isNotNull);
    expect(container.read(projectsProvider).single.name, 'Harbour Depot');
    expect(container.read(projectsProvider).single.meta, contains('Kochi'));
  });

  testWidgets('GST invoices render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        gstInvoicesProvider.overrideWithValue(const <GstInvoice>[
          GstInvoice(
              ref: 'INV-TEST',
              amountLabel: '₹9',
              meta: 'Overdue',
              status: GstInvoiceStatus.overdue),
        ]),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BGstInvoicesScreen()),
    ));
    expect(find.text('INV-TEST'), findsOneWidget);
  });

  testWidgets('Team members render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        teamMembersProvider.overrideWith(() => _FakeTeam(const <TeamMember>[
              TeamMember(name: 'Test User', role: 'Approver'),
            ])),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BTeamRolesScreen()),
    ));
    expect(find.text('Test User'), findsOneWidget);
  });

  testWidgets('Split shipments render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        splitShipmentsProvider.overrideWithValue(const <ShipmentLeg>[
          ShipmentLeg(
              seller: 'Test Seller',
              awb: 'AWB-TEST',
              state: ShipmentState.delivered),
        ]),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BSplitTrackingScreen()),
    ));
    expect(find.text('Test Seller'), findsOneWidget);
    expect(find.text('Delivered'), findsOneWidget);
  });

  testWidgets('Projects render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        projectsProvider.overrideWith(() => _FakeProjects(const <ProjectSummary>[
              ProjectSummary(
                  id: 'test', name: 'Test Project', meta: 'Nowhere · 1 site'),
            ])),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BProjectsListScreen()),
    ));
    expect(find.text('Test Project'), findsOneWidget);
    expect(find.text('New Project'), findsOneWidget);
  });

  testWidgets('Create RFQ warns on empty submit', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AgencyTheme.light(),
      home: const B2BCreateRfqScreen(),
    ));
    await tester.tap(find.text('Submit RFQ'));
    await tester.pump();
    expect(find.text('Add a material and quantity first'), findsOneWidget);
  });
}
