/// Domain models for the B2B support surfaces (GST invoices, approvals,
/// team & roles, split shipment tracking).
///
/// The screens render whatever the corresponding providers supply; the demo
/// fixtures live in the provider layer, not in the widgets.
library;

enum GstInvoiceStatus { due, overdue, paid }

class GstInvoice {
  const GstInvoice({
    required this.ref,
    required this.amountLabel,
    required this.meta,
    required this.status,
  });

  final String ref;
  final String amountLabel;
  final String meta;
  final GstInvoiceStatus status;
}

enum ApprovalState { pending, approved, rejected }

class ApprovalItem {
  const ApprovalItem({
    required this.ref,
    required this.amountLabel,
    required this.state,
  });

  final String ref;
  final String amountLabel;
  final ApprovalState state;
}

class TeamMember {
  const TeamMember({required this.name, required this.role});

  final String name;
  final String role;
}

enum ShipmentState { processing, shipped, outForDelivery, delivered, exception }

class ShipmentLeg {
  const ShipmentLeg({
    required this.seller,
    required this.awb,
    required this.state,
  });

  final String seller;
  final String awb;
  final ShipmentState state;
}

/// A project in the buyer's Projects & Sites list.
class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.name,
    required this.meta,
  });

  final String id;
  final String name;
  final String meta;
}

/// A material list / bundle within a project.
class ProjectBundle {
  const ProjectBundle({required this.title, required this.meta});

  final String title;
  final String meta;
}

/// A single line in a material list.
class MaterialLine {
  const MaterialLine({
    required this.name,
    required this.qtyLabel,
    required this.priceLabel,
  });

  final String name;
  final String qtyLabel;
  final String priceLabel;
}

/// A delivery site option for a project.
class SiteOption {
  const SiteOption({required this.name, required this.city});

  final String name;
  final String city;
}

