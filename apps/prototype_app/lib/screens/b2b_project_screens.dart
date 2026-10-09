import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_support_models.dart';
import '../domain/models.dart';
import '../providers/b2b_support_providers.dart';
import '../providers/b2b_trade_providers.dart';

AgencyColors _c(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

// ---------------------------------------------------------------------------
// B2B Projects List
// ---------------------------------------------------------------------------

class B2BProjectsListScreen extends ConsumerWidget {
  const B2BProjectsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Projects & Sites')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          if (projects.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.lg),
              child: Center(
                child: Text('No projects yet',
                    style: TextStyle(color: _c(context).contentSecondary)),
              ),
            )
          else
            PinResponsiveGrid(
              mobileColumns: 1,
              tabletColumns: 2,
              desktopColumns: 3,
              mainAxisExtent: 88,
              children: <Widget>[
                for (final project in projects)
                  _ProjectCard(
                    project: project,
                    onTap: () => context.push('/b2b/projects/${project.id}'),
                  ),
              ],
            ),
          const SizedBox(height: AgencySpacing.lg),
          PinWorkflowAction(
            label: 'New Project',
            hierarchy: PinWorkflowHierarchy.secondary,
            icon: Icons.add,
            onPressed: () => _newProject(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _newProject(BuildContext context, WidgetRef ref) async {
    final draft = await showDialog<(String, String)>(
      context: context,
      builder: (_) => const _NewProjectDialog(),
    );
    if (draft == null) return;
    final project = await ref
        .read(projectsProvider.notifier)
        .create(name: draft.$1, location: draft.$2);
    if (project == null || !context.mounted) return;
    PinToast.show(context, 'Project "${project.name}" created',
        tone: PinToastTone.success);
    context.push('/b2b/projects/${project.id}');
  }
}

class _NewProjectDialog extends StatefulWidget {
  const _NewProjectDialog();

  @override
  State<_NewProjectDialog> createState() => _NewProjectDialogState();
}

class _NewProjectDialogState extends State<_NewProjectDialog> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _location = TextEditingController(text: 'Pune');

  @override
  void dispose() {
    _name.dispose();
    _location.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('New project'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          TextField(
            controller: _name,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Project name'),
          ),
          const SizedBox(height: AgencySpacing.md),
          TextField(
            controller: _location,
            decoration: const InputDecoration(labelText: 'Location'),
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
            Navigator.of(context).pop((
              name,
              _location.text.trim().isEmpty ? 'Pune' : _location.text.trim()
            ));
          },
          child: const Text('Create'),
        ),
      ],
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.onTap});

  final ProjectSummary project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(Icons.location_city_outlined, color: colors.actionPrimary),
            const SizedBox(width: AgencySpacing.md),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(project.name,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                  Text(project.meta,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Project Detail
// ---------------------------------------------------------------------------

class B2BProjectDetailScreen extends ConsumerStatefulWidget {
  const B2BProjectDetailScreen({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<B2BProjectDetailScreen> createState() =>
      _B2BProjectDetailScreenState();
}

class _B2BProjectDetailScreenState
    extends ConsumerState<B2BProjectDetailScreen> {
  static const List<String> _tabs = <String>[
    'Material Lists',
    'Orders',
    'Sites',
    'RFQs',
  ];

  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    final project = ref
        .watch(projectsProvider)
        .where((p) => p.id == widget.projectId)
        .firstOrNull;
    final name = project?.name ?? 'Project';
    final meta = project?.meta ?? '';

    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          if (meta.isNotEmpty)
            Text(meta,
                style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.md),
          PinTabs(
            tabs: _tabs,
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: AgencySpacing.md),
          ..._tabBody(),
          const SizedBox(height: AgencySpacing.lg),
          if (_tab == 0)
            PinWorkflowAction(
              label: 'Create Material List',
              hierarchy: PinWorkflowHierarchy.secondary,
              icon: Icons.add,
              onPressed: () => context.push('/b2b/material-list'),
            ),
        ],
      ),
    );
  }

  List<Widget> _tabBody() {
    switch (_tab) {
      case 0:
        final bundles = ref.watch(projectBundlesProvider);
        return <Widget>[
          for (final bundle in bundles)
            _MaterialCard(
              title: bundle.title,
              meta: bundle.meta,
              onTap: () => context.push('/b2b/material-list'),
            ),
        ];
      case 1:
        final orders = ref.watch(tradeDashboardProvider).repeatOrders;
        return <Widget>[
          for (final order in orders)
            _SimpleRow(
              icon: Icons.receipt_long_outlined,
              title: order.reference,
              subtitle: '${order.dateLabel} · ${order.itemSummary}',
              trailing: order.total.formatted,
              onTap: () => context.push('/b2b/tracking'),
            ),
        ];
      case 2:
        final sites = ref.watch(sitesProvider);
        return <Widget>[
          for (final site in sites)
            _SimpleRow(
              icon: Icons.location_on_outlined,
              title: site.name,
              subtitle: site.city,
              onTap: () => context.push('/b2b/site-selector'),
            ),
        ];
      default:
        final rfqs = ref.watch(tradeDashboardProvider).quotations;
        return <Widget>[
          for (final rfq in rfqs)
            _SimpleRow(
              icon: Icons.request_quote_outlined,
              title: rfq.reference,
              subtitle: rfq.summary,
              trailing: '${rfq.quoteCount} quotes',
              onTap: () => context.push('/b2b/quotes-received'),
            ),
        ];
    }
  }
}

class _SimpleRow extends StatelessWidget {
  const _SimpleRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(icon, color: colors.actionPrimary),
            const SizedBox(width: AgencySpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(title,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                  Text(subtitle,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
            if (trailing != null)
              Text(trailing!,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary)),
          ],
        ),
      ),
    );
  }
}

class _MaterialCard extends StatelessWidget {
  const _MaterialCard({
    required this.title,
    required this.meta,
    required this.onTap,
  });

  final String title;
  final String meta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(Icons.list_alt_outlined, color: colors.actionPrimary),
            const SizedBox(width: AgencySpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(title,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                  Text(meta,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Material List
// ---------------------------------------------------------------------------

class B2BMaterialListScreen extends ConsumerWidget {
  const B2BMaterialListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(materialLinesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Material List · Site A')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                for (final line in lines) _MaterialRow(line: line),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                PinWorkflowAction(
                  label: 'Choose delivery site',
                  hierarchy: PinWorkflowHierarchy.secondary,
                  icon: Icons.location_on_outlined,
                  onPressed: () => context.push('/b2b/site-selector'),
                ),
                const SizedBox(height: AgencySpacing.sm),
                PinWorkflowAction(
                  label: 'Add to Quotation Cart',
                  onPressed: () => _addToCart(context, ref, lines),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _addToCart(
      BuildContext context, WidgetRef ref, List<MaterialLine> lines) {
    final notifier = ref.read(b2bQuotationCartProvider.notifier);
    var added = 0;
    for (final line in lines) {
      if (line.sku.isEmpty || line.quantity <= 0) continue;
      notifier.addSku(
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice:
            Money(amount: line.unitPriceRupees * 100, currencyCode: 'INR'),
      );
      added++;
    }
    if (added == 0) {
      PinToast.show(context, 'This material list has no orderable lines',
          tone: PinToastTone.warning);
      return;
    }
    PinToast.show(context, '$added lines added to the quotation cart',
        tone: PinToastTone.success);
    context.go('/b2b/cart');
  }
}

class _MaterialRow extends StatelessWidget {
  const _MaterialRow({required this.line});

  final MaterialLine line;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: colors.surfacePage,
              borderRadius: BorderRadius.circular(AgencyRadius.sm),
            ),
            child: Icon(Icons.image_outlined,
                size: 24, color: colors.contentSecondary),
          ),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(line.name,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text(line.qtyLabel,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text(line.priceLabel,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
              const SizedBox(height: 2),
              Text('/unit',
                  style:
                      TextStyle(fontSize: 10, color: colors.contentSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Site Selector
// ---------------------------------------------------------------------------

class B2BSiteSelectorScreen extends ConsumerStatefulWidget {
  const B2BSiteSelectorScreen({super.key});

  @override
  ConsumerState<B2BSiteSelectorScreen> createState() =>
      _B2BSiteSelectorScreenState();
}

class _B2BSiteSelectorScreenState extends ConsumerState<B2BSiteSelectorScreen> {
  int _selected = 0;

  Future<void> _confirm(List<SiteOption> sites) async {
    final choice = sites[_selected];
    final ok = await PinDialog.confirm(
      context,
      title: 'Confirm delivery site',
      message: 'Deliver this order to ${choice.name} (${choice.city})?',
      confirmLabel: 'Confirm',
    );
    if ((ok ?? false) && mounted) {
      // Persist the site onto the quotation draft so checkout shows it.
      ref
          .read(b2bQuotationCartProvider.notifier)
          .setDeliveryLocation('${choice.name} (${choice.city})');
      context.go('/b2b/cart/checkout');
    }
  }

  @override
  Widget build(BuildContext context) {
    final sites = ref.watch(sitesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Select Delivery Site')),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                for (var i = 0; i < sites.length; i++)
                  _SiteRow(
                    site: sites[i],
                    selected: i == _selected,
                    onTap: () => setState(() => _selected = i),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: PinWorkflowAction(
              label: 'Confirm Site',
              onPressed: () => _confirm(sites),
            ),
          ),
        ],
      ),
    );
  }
}

class _SiteRow extends StatelessWidget {
  const _SiteRow({
    required this.site,
    required this.selected,
    required this.onTap,
  });

  final SiteOption site;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AgencyRadius.lg),
      child: Container(
        margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
        padding: const EdgeInsets.all(AgencySpacing.md),
        decoration: BoxDecoration(
          color: selected ? colors.surfaceInteractive : colors.surfaceRaised,
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          border: Border.all(
              color: selected ? colors.actionPrimary : colors.borderDefault),
        ),
        child: Row(
          children: <Widget>[
            Icon(Icons.location_on_outlined,
                color:
                    selected ? colors.actionPrimary : colors.contentSecondary),
            const SizedBox(width: AgencySpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(site.name,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                  Text(site.city,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, color: colors.actionPrimary, size: 20),
          ],
        ),
      ),
    );
  }
}
