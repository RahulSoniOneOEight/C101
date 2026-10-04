import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/b2b_support_models.dart';
import '../providers/b2b_support_providers.dart';

AgencyColors _c(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

PinShipmentState _shipmentState(ShipmentState s) => switch (s) {
      ShipmentState.processing => PinShipmentState.processing,
      ShipmentState.shipped => PinShipmentState.shipped,
      ShipmentState.outForDelivery => PinShipmentState.outForDelivery,
      ShipmentState.delivered => PinShipmentState.delivered,
      ShipmentState.exception => PinShipmentState.exception,
    };

PinApprovalState _approvalState(ApprovalState s) => switch (s) {
      ApprovalState.pending => PinApprovalState.pending,
      ApprovalState.approved => PinApprovalState.approved,
      ApprovalState.rejected => PinApprovalState.rejected,
    };

Color _gstColor(GstInvoiceStatus status, AgencyColors colors) =>
    switch (status) {
      GstInvoiceStatus.due => colors.feedbackWarning,
      GstInvoiceStatus.overdue => colors.feedbackError,
      GstInvoiceStatus.paid => colors.feedbackSuccess,
    };

// ---------------------------------------------------------------------------
// B2B Split Order Tracking
// ---------------------------------------------------------------------------

class B2BSplitTrackingScreen extends ConsumerWidget {
  const B2BSplitTrackingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final legs = ref.watch(splitShipmentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Track Order PO-3374')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (final leg in legs) _ShipmentRow(leg: leg),
        ],
      ),
    );
  }
}

class _ShipmentRow extends StatelessWidget {
  const _ShipmentRow({required this.leg});

  final ShipmentLeg leg;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.local_shipping_outlined, color: colors.actionPrimary),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(leg.seller,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                Text(leg.awb,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          PinShipmentStatus(state: _shipmentState(leg.state)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Buyer-Seller Chat
// ---------------------------------------------------------------------------

class B2BBuyerSellerChatScreen extends StatefulWidget {
  const B2BBuyerSellerChatScreen({super.key});

  @override
  State<B2BBuyerSellerChatScreen> createState() =>
      _B2BBuyerSellerChatScreenState();
}

class _B2BBuyerSellerChatScreenState extends State<B2BBuyerSellerChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final List<(String, bool)> _messages = <(String, bool)>[
    ('Can you do ₹985/unit for 200 units?', true),
    ('Yes, at 200 units we can offer ₹985.', false),
    ('Include GST invoice and delivery to Site A?', true),
    ('Confirmed — GST invoice, delivery to Site A.', false),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add((text, true));
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Ceramica Traders')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                for (final m in _messages) _Bubble(text: m.$1, mine: m.$2),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AgencySpacing.md),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: 'Type a message…',
                        filled: true,
                        fillColor: colors.surfacePage,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AgencyRadius.lg),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: AgencySpacing.md, vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: AgencySpacing.sm),
                  IconButton.filled(
                    onPressed: _send,
                    icon: const Icon(Icons.send),
                    style: IconButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.mine});

  final String text;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
        padding: const EdgeInsets.symmetric(
            horizontal: AgencySpacing.md, vertical: AgencySpacing.sm),
        decoration: BoxDecoration(
          color: mine ? colors.actionPrimary : colors.surfaceInteractive,
          borderRadius: BorderRadius.circular(AgencyRadius.md),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 13,
                color: mine ? colors.contentInverse : colors.contentPrimary)),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B GST Invoices
// ---------------------------------------------------------------------------

class B2BGstInvoicesScreen extends ConsumerWidget {
  const B2BGstInvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final invoices = ref.watch(gstInvoicesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('GST Invoices')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (final invoice in invoices)
            _GstRow(
              invoice: invoice,
              color: _gstColor(invoice.status, colors),
            ),
          const SizedBox(height: AgencySpacing.lg),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => PinToast.show(context, 'Downloading all invoices…'),
              icon: const Icon(Icons.download_outlined),
              label: const Text('Download All'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(color: colors.borderDefault),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GstRow extends StatelessWidget {
  const _GstRow({required this.invoice, required this.color});

  final GstInvoice invoice;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.description_outlined),
      title: Text(invoice.ref,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.contentPrimary)),
      subtitle: Text(invoice.meta,
          style: TextStyle(fontSize: 11, color: color)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(invoice.amountLabel,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(width: AgencySpacing.sm),
          IconButton(
            onPressed: () =>
                PinToast.show(context, 'Downloading ${invoice.ref}…'),
            icon: const Icon(Icons.download_outlined, size: 18),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Team & Roles
// ---------------------------------------------------------------------------

class B2BTeamRolesScreen extends ConsumerWidget {
  const B2BTeamRolesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = ref.watch(teamMembersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Team & Roles')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (final member in members) _MemberRow(member: member),
          const SizedBox(height: AgencySpacing.lg),
          PinWorkflowAction(
            label: 'Invite Member',
            hierarchy: PinWorkflowHierarchy.secondary,
            icon: Icons.person_add_outlined,
            onPressed: () => PinToast.show(
                context, 'Member invitations are not part of this prototype yet'),
          ),
          const SizedBox(height: AgencySpacing.xs),
        ],
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member});

  final TeamMember member;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: colors.surfaceInteractive,
        child: Icon(Icons.person_outline, color: colors.actionPrimary),
      ),
      title: Text(member.name,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.contentPrimary)),
      subtitle: Text(member.role,
          style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
      trailing: TextButton(
        onPressed: () => PinToast.show(
            context, 'Editing ${member.name} is not part of this prototype yet'),
        child: const Text('Edit'),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Approvals
// ---------------------------------------------------------------------------

class B2BApprovalsScreen extends ConsumerWidget {
  const B2BApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(approvalItemsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Approvals')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (final item in items) _ApprovalRow(item: item),
        ],
      ),
    );
  }
}

class _ApprovalRow extends StatelessWidget {
  const _ApprovalRow({required this.item});

  final ApprovalItem item;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(item.ref,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
          ),
          Text(item.amountLabel,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(width: AgencySpacing.md),
          PinApprovalStatus(state: _approvalState(item.state)),
        ],
      ),
    );
  }
}
