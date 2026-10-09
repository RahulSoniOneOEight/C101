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

  ApprovalItem copyWith({ApprovalState? state}) =>
      ApprovalItem(ref: ref, amountLabel: amountLabel, state: state ?? this.state);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'ref': ref,
        'amountLabel': amountLabel,
        'state': state.name,
      };

  factory ApprovalItem.fromJson(Map<String, dynamic> json) => ApprovalItem(
        ref: json['ref'] as String? ?? '',
        amountLabel: json['amountLabel'] as String? ?? '',
        state: ApprovalState.values.firstWhere(
          (s) => s.name == json['state'],
          orElse: () => ApprovalState.pending,
        ),
      );
}

class TeamMember {
  const TeamMember({required this.name, required this.role});

  final String name;
  final String role;

  TeamMember copyWith({String? role}) =>
      TeamMember(name: name, role: role ?? this.role);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'name': name,
        'role': role,
      };

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(
        name: json['name'] as String? ?? '',
        role: json['role'] as String? ?? 'Buyer',
      );
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

  ProjectSummary copyWith({String? name, String? meta}) =>
      ProjectSummary(id: id, name: name ?? this.name, meta: meta ?? this.meta);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'name': name,
        'meta': meta,
      };

  factory ProjectSummary.fromJson(Map<String, dynamic> json) => ProjectSummary(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        meta: json['meta'] as String? ?? '',
      );
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
    this.sku = '',
    this.quantity = 0,
    this.unitPriceRupees = 0,
  });

  final String name;
  final String qtyLabel;
  final String priceLabel;

  /// SKU / quantity / unit price carried for the "Add to Quotation Cart" action.
  final String sku;
  final int quantity;
  final int unitPriceRupees;
}

/// A delivery site option for a project.
class SiteOption {
  const SiteOption({required this.name, required this.city});

  final String name;
  final String city;
}

