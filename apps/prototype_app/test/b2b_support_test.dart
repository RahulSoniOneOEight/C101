import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prototype_app/domain/b2b_support_models.dart';
import 'package:prototype_app/providers/b2b_support_providers.dart';
import 'package:prototype_app/screens/b2b_project_screens.dart';
import 'package:prototype_app/screens/b2b_quote_screens.dart';
import 'package:prototype_app/screens/b2b_support_screens.dart';

void main() {
  testWidgets('Approvals render from the provider', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        approvalItemsProvider.overrideWithValue(const <ApprovalItem>[
          ApprovalItem(
              ref: 'Order #TEST-1',
              amountLabel: '₹1',
              state: ApprovalState.approved),
        ]),
      ],
      child: MaterialApp(
          theme: AgencyTheme.light(), home: const B2BApprovalsScreen()),
    ));
    expect(find.text('Order #TEST-1'), findsOneWidget);
    expect(find.text('Approved'), findsOneWidget);
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
        teamMembersProvider.overrideWithValue(const <TeamMember>[
          TeamMember(name: 'Test User', role: 'Approver'),
        ]),
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
        projectsProvider.overrideWithValue(const <ProjectSummary>[
          ProjectSummary(
              id: 'test', name: 'Test Project', meta: 'Nowhere · 1 site'),
        ]),
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
