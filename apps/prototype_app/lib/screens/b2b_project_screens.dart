import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_support_models.dart';
import '../providers/b2b_support_providers.dart';

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
            onPressed: () => PinToast.show(
                context, 'Project creation is not part of this prototype yet'),
          ),
        ],
      ),
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
  const B2BProjectDetailScreen({super.key, required this.projectName});

  final String projectName;

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
    final bundles = ref.watch(projectBundlesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(widget.projectName)),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('Pune · 3 sites · 12 orders',
              style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.md),
          PinTabs(
            tabs: _tabs,
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: AgencySpacing.md),
          if (_tab == 0)
            for (final bundle in bundles)
              _MaterialCard(
                title: bundle.title,
                meta: bundle.meta,
                onTap: () => context.push('/b2b/material-list'),
              )
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.lg),
              child: Center(
                child: Text('${_tabs[_tab]} — coming soon',
                    style: TextStyle(color: colors.contentSecondary)),
              ),
            ),
          const SizedBox(height: AgencySpacing.lg),
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
                  onPressed: () => context.push('/b2b/quotation-cart'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
                  style: TextStyle(
                      fontSize: 10, color: colors.contentSecondary)),
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

class _B2BSiteSelectorScreenState
    extends ConsumerState<B2BSiteSelectorScreen> {
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
      context.push('/b2b/checkout');
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
