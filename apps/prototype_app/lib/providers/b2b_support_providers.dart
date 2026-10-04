import 'package:flutter_riverpod/flutter_riverpod.dart';

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

/// Orders awaiting/cleared approval for the business account.
final approvalItemsProvider = Provider<List<ApprovalItem>>((ref) {
  return const <ApprovalItem>[
    ApprovalItem(
        ref: 'Order #B-2231',
        amountLabel: '₹48,900',
        state: ApprovalState.pending),
    ApprovalItem(
        ref: 'Order #B-2228',
        amountLabel: '₹12,450',
        state: ApprovalState.approved),
    ApprovalItem(
        ref: 'Order #B-2210',
        amountLabel: '₹96,300',
        state: ApprovalState.rejected),
  ];
});

/// Business team members and their roles.
final teamMembersProvider = Provider<List<TeamMember>>((ref) {
  return const <TeamMember>[
    TeamMember(name: 'Rahul Sharma', role: 'Admin'),
    TeamMember(name: 'Priya Nair', role: 'Buyer'),
    TeamMember(name: 'Amit Rao', role: 'Approver'),
  ];
});

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

/// The buyer's projects (Projects & Sites).
final projectsProvider = Provider<List<ProjectSummary>>((ref) {
  return const <ProjectSummary>[
    ProjectSummary(id: 'skyline', name: 'Skyline Tower', meta: 'Pune · 3 sites'),
    ProjectSummary(
        id: 'green-park', name: 'Green Park Villas', meta: 'Mumbai · 2 sites'),
    ProjectSummary(id: 'metro', name: 'Metro Depot', meta: 'Nashik · 1 site'),
  ];
});

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
        name: 'Ceramic Floor Tiles', qtyLabel: '200×', priceLabel: '₹1,150'),
    MaterialLine(name: 'Vitrified Tiles', qtyLabel: '150×', priceLabel: '₹890'),
    MaterialLine(name: 'Plywood 18mm', qtyLabel: '40×', priceLabel: '₹2,100'),
    MaterialLine(name: 'Adhesive 20kg', qtyLabel: '60×', priceLabel: '₹420'),
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
