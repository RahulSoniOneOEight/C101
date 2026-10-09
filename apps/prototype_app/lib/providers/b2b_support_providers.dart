import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local_store.dart';
import '../domain/b2b_support_models.dart';

/// GST invoices for the business account. In production this is fed by the
/// invoicing/GST backend; the demo fixture mirrors the reference profile.
final gstInvoicesProvider = Provider<List<GstInvoice>>((ref) {
  return const <GstInvoice>[
    GstInvoice(
        ref: 'INV-9921',
        amountLabel: '₹48,900',
        meta: '30 Sep',
        status: GstInvoiceStatus.due),
    GstInvoice(
        ref: 'INV-9904',
        amountLabel: '₹96,300',
        meta: 'Overdue',
        status: GstInvoiceStatus.overdue),
    GstInvoice(
        ref: 'INV-9877',
        amountLabel: '₹12,450',
        meta: 'Paid',
        status: GstInvoiceStatus.paid),
  ];
});

/// Orders awaiting/cleared approval for the business account. Backed by a
/// device-local store so approver decisions and credit-limit requests persist.
const List<ApprovalItem> _seedApprovals = <ApprovalItem>[
  ApprovalItem(
      ref: 'Order #B-2231', amountLabel: '₹48,900', state: ApprovalState.pending),
  ApprovalItem(
      ref: 'Order #B-2228', amountLabel: '₹12,450', state: ApprovalState.approved),
  ApprovalItem(
      ref: 'Order #B-2210', amountLabel: '₹96,300', state: ApprovalState.rejected),
];

class ApprovalsNotifier extends Notifier<List<ApprovalItem>> {
  @override
  List<ApprovalItem> build() {
    try {
      final store = ref.read(localStoreProvider);
      if (!store.hasApprovals()) {
        store.writeApprovals(_seedApprovals); // first-run seed (fire-and-forget)
        return _seedApprovals;
      }
      return store.readApprovals();
    } catch (_) {
      return _seedApprovals;
    }
  }

  Future<void> _commit(List<ApprovalItem> next) async {
    state = next;
    try {
      await ref.read(localStoreProvider).writeApprovals(next);
    } catch (_) {
      // Persistence unavailable — the in-memory change still stands.
    }
  }

  /// Record an approver decision on a pending item.
  Future<void> decide(String ref, ApprovalState decision) => _commit(<ApprovalItem>[
        for (final item in state)
          item.ref == ref && item.state == ApprovalState.pending
              ? item.copyWith(state: decision)
              : item,
      ]);

  /// Raise a new pending item (e.g. a credit-limit increase request).
  Future<void> addPending({required String ref, required String amountLabel}) async {
    if (state.any((i) => i.ref == ref)) return;
    await _commit(<ApprovalItem>[
      ApprovalItem(ref: ref, amountLabel: amountLabel, state: ApprovalState.pending),
      ...state,
    ]);
  }
}

final approvalItemsProvider =
    NotifierProvider<ApprovalsNotifier, List<ApprovalItem>>(
        ApprovalsNotifier.new);

/// Business team members and their roles. Buyer additions / role edits persist
/// across restarts (device-local stand-in for the team-management API).
const List<TeamMember> _seedTeamMembers = <TeamMember>[
  TeamMember(name: 'Rahul Sharma', role: 'Admin'),
  TeamMember(name: 'Priya Nair', role: 'Buyer'),
  TeamMember(name: 'Amit Rao', role: 'Approver'),
];

class TeamMembersNotifier extends Notifier<List<TeamMember>> {
  @override
  List<TeamMember> build() {
    try {
      final store = ref.read(localStoreProvider);
      if (!store.hasTeamMembers()) {
        store.writeTeamMembers(_seedTeamMembers); // first-run seed
        return _seedTeamMembers;
      }
      return store.readTeamMembers();
    } catch (_) {
      return _seedTeamMembers;
    }
  }

  Future<void> _commit(List<TeamMember> next) async {
    state = next;
    try {
      await ref.read(localStoreProvider).writeTeamMembers(next);
    } catch (_) {
      // Persistence unavailable — the in-memory change still stands.
    }
  }

  /// Invite a member. Returns false for a blank or duplicate name.
  Future<bool> invite({required String name, required String role}) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return false;
    if (state.any((m) => m.name.toLowerCase() == trimmed.toLowerCase())) {
      return false;
    }
    await _commit(<TeamMember>[...state, TeamMember(name: trimmed, role: role)]);
    return true;
  }

  Future<void> updateRole(String name, String role) => _commit(<TeamMember>[
        for (final m in state) m.name == name ? m.copyWith(role: role) : m,
      ]);
}

final teamMembersProvider =
    NotifierProvider<TeamMembersNotifier, List<TeamMember>>(
        TeamMembersNotifier.new);

/// Per-seller shipment legs for a split order.
final splitShipmentsProvider = Provider<List<ShipmentLeg>>((ref) {
  return const <ShipmentLeg>[
    ShipmentLeg(
        seller: 'Ceramica Traders',
        awb: 'AWB 1230456',
        state: ShipmentState.shipped),
    ShipmentLeg(
        seller: 'TileHub Supplies',
        awb: 'AWB 1231456',
        state: ShipmentState.processing),
    ShipmentLeg(
        seller: 'BuildMart',
        awb: 'AWB 1232456',
        state: ShipmentState.processing),
  ];
});

/// The buyer's projects (Projects & Sites). Buyer-created projects persist.
const List<ProjectSummary> _seedProjects = <ProjectSummary>[
  ProjectSummary(id: 'skyline', name: 'Skyline Tower', meta: 'Pune · 3 sites'),
  ProjectSummary(
      id: 'green-park', name: 'Green Park Villas', meta: 'Mumbai · 2 sites'),
  ProjectSummary(id: 'metro', name: 'Metro Depot', meta: 'Nashik · 1 site'),
];

class ProjectsNotifier extends Notifier<List<ProjectSummary>> {
  @override
  List<ProjectSummary> build() {
    try {
      final store = ref.read(localStoreProvider);
      if (!store.hasProjects()) {
        store.writeProjects(_seedProjects); // first-run seed
        return _seedProjects;
      }
      return store.readProjects();
    } catch (_) {
      return _seedProjects;
    }
  }

  Future<void> _commit(List<ProjectSummary> next) async {
    state = next;
    try {
      await ref.read(localStoreProvider).writeProjects(next);
    } catch (_) {
      // Persistence unavailable — the in-memory change still stands.
    }
  }

  /// Create a project and return it. `location` supplies the meta line.
  Future<ProjectSummary?> create({
    required String name,
    String location = 'Pune',
  }) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return null;
    final project = ProjectSummary(
      id: 'prj_${DateTime.now().microsecondsSinceEpoch}',
      name: trimmed,
      meta: '$location · 0 sites',
    );
    await _commit(<ProjectSummary>[...state, project]);
    return project;
  }
}

final projectsProvider =
    NotifierProvider<ProjectsNotifier, List<ProjectSummary>>(
        ProjectsNotifier.new);

/// Material lists / bundles within a project.
final projectBundlesProvider = Provider<List<ProjectBundle>>((ref) {
  return const <ProjectBundle>[
    ProjectBundle(title: 'Tile Package A', meta: '8 items · ₹42,300'),
    ProjectBundle(title: 'Electrical Bundle', meta: '5 items · ₹18,900'),
  ];
});

/// Lines in the active material list.
final materialLinesProvider = Provider<List<MaterialLine>>((ref) {
  return const <MaterialLine>[
    MaterialLine(
        name: 'Ceramic Floor Tiles',
        qtyLabel: '200×',
        priceLabel: '₹1,150',
        sku: 'prod_tiles',
        quantity: 200,
        unitPriceRupees: 1150),
    MaterialLine(
        name: 'Vitrified Tiles',
        qtyLabel: '150×',
        priceLabel: '₹890',
        sku: 'prod_tiles_vitrified',
        quantity: 150,
        unitPriceRupees: 890),
    MaterialLine(
        name: 'Plywood 18mm',
        qtyLabel: '40×',
        priceLabel: '₹2,100',
        sku: 'prod_plywood',
        quantity: 40,
        unitPriceRupees: 2100),
    MaterialLine(
        name: 'Adhesive 20kg',
        qtyLabel: '60×',
        priceLabel: '₹420',
        sku: 'prod_adhesive',
        quantity: 60,
        unitPriceRupees: 420),
  ];
});

/// Delivery site options.
final sitesProvider = Provider<List<SiteOption>>((ref) {
  return const <SiteOption>[
    SiteOption(name: 'Site A — Main block', city: 'Pune'),
    SiteOption(name: 'Site B — Warehouse', city: 'Pune'),
    SiteOption(name: 'Site C — Annexe', city: 'Pune'),
    SiteOption(name: 'Project office', city: 'Mumbai'),
  ];
});
