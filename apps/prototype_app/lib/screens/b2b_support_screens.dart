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

  static const List<String> _roles = <String>['Admin', 'Buyer', 'Approver'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = ref.watch(teamMembersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Team & Roles')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (final member in members)
            _MemberRow(
              member: member,
              onEdit: () => _editMember(context, ref, member),
            ),
          const SizedBox(height: AgencySpacing.lg),
          PinWorkflowAction(
            label: 'Invite Member',
            hierarchy: PinWorkflowHierarchy.secondary,
            icon: Icons.person_add_outlined,
            onPressed: () => _inviteMember(context, ref),
          ),
          const SizedBox(height: AgencySpacing.xs),
        ],
      ),
    );
  }

  Future<void> _inviteMember(BuildContext context, WidgetRef ref) async {
    final draft = await showDialog<TeamMember>(
      context: context,
      builder: (_) => const _InviteMemberDialog(roles: _roles),
    );
    if (draft == null) return;
    final ok = await ref
        .read(teamMembersProvider.notifier)
        .invite(name: draft.name, role: draft.role);
    if (!context.mounted) return;
    PinToast.show(
      context,
      ok
          ? 'Invitation sent to ${draft.name}'
          : '${draft.name} is already on the team',
      tone: ok ? PinToastTone.success : PinToastTone.warning,
    );
  }

  Future<void> _editMember(
      BuildContext context, WidgetRef ref, TeamMember member) async {
    final role = await showDialog<String>(
      context: context,
      builder: (_) => _EditRoleDialog(
        roles: _roles,
        name: member.name,
        initial: member.role,
      ),
    );
    if (role == null || role == member.role) return;
    await ref.read(teamMembersProvider.notifier).updateRole(member.name, role);
    if (!context.mounted) return;
    PinToast.show(context, '${member.name} is now $role',
        tone: PinToastTone.success);
  }
}

class _InviteMemberDialog extends StatefulWidget {
  const _InviteMemberDialog({required this.roles});

  final List<String> roles;

  @override
  State<_InviteMemberDialog> createState() => _InviteMemberDialogState();
}

class _InviteMemberDialogState extends State<_InviteMemberDialog> {
  final TextEditingController _name = TextEditingController();
  late String _role = widget.roles.length > 1 ? widget.roles[1] : widget.roles.first;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Invite member'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          TextField(
            controller: _name,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          const SizedBox(height: AgencySpacing.md),
          DropdownButtonFormField<String>(
            initialValue: _role,
            decoration: const InputDecoration(labelText: 'Role'),
            items: <DropdownMenuItem<String>>[
              for (final r in widget.roles)
                DropdownMenuItem<String>(value: r, child: Text(r)),
            ],
            onChanged: (v) => setState(() => _role = v ?? _role),
          ),
        ],
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final name = _name.text.trim();
            if (name.isEmpty) return;
            Navigator.of(context).pop(TeamMember(name: name, role: _role));
          },
          child: const Text('Invite'),
        ),
      ],
    );
  }
}

class _EditRoleDialog extends StatefulWidget {
  const _EditRoleDialog({
    required this.roles,
    required this.name,
    required this.initial,
  });

  final List<String> roles;
  final String name;
  final String initial;

  @override
  State<_EditRoleDialog> createState() => _EditRoleDialogState();
}

class _EditRoleDialogState extends State<_EditRoleDialog> {
  late String _role = widget.initial;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Edit ${widget.name}'),
      content: DropdownButtonFormField<String>(
        initialValue: _role,
        decoration: const InputDecoration(labelText: 'Role'),
        items: <DropdownMenuItem<String>>[
          for (final r in widget.roles)
            DropdownMenuItem<String>(value: r, child: Text(r)),
        ],
        onChanged: (v) => setState(() => _role = v ?? _role),
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_role),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.onEdit});

  final TeamMember member;
  final VoidCallback onEdit;

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
        onPressed: onEdit,
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
      body: items.isEmpty
          ? const Center(child: Text('Nothing is waiting on you'))
          : ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                for (final item in items)
                  _ApprovalRow(
                    item: item,
                    onDecide: (decision) => ref
                        .read(approvalItemsProvider.notifier)
                        .decide(item.ref, decision),
                  ),
              ],
            ),
    );
  }
}

class _ApprovalRow extends StatelessWidget {
  const _ApprovalRow({required this.item, required this.onDecide});

  final ApprovalItem item;
  final ValueChanged<ApprovalState> onDecide;

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
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
          if (item.state == ApprovalState.pending) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => onDecide(ApprovalState.rejected),
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Reject'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.feedbackError,
                      side: BorderSide(color: colors.borderDefault),
                    ),
                  ),
                ),
                const SizedBox(width: AgencySpacing.sm),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => onDecide(ApprovalState.approved),
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Approve'),
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
