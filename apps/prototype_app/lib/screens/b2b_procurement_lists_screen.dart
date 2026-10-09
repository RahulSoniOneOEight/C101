import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../providers/b2b_trade_providers.dart';

AgencyColors _colors(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

String _sourceLabel(ProcurementListSourceType type) => switch (type) {
      ProcurementListSourceType.buyerSaved => 'Saved',
      ProcurementListSourceType.seasonal => 'Seasonal',
      ProcurementListSourceType.backendCurated => 'Curated',
      ProcurementListSourceType.categoryBased => 'Category',
      ProcurementListSourceType.personalized => 'For you',
    };

/// Small 44px thumbnail used across the list manager + editor.
Widget _thumb(BuildContext context, String? url) {
  final colors = _colors(context);
  return Container(
    width: 44,
    height: 44,
    decoration: BoxDecoration(
      color: colors.surfacePage,
      borderRadius: BorderRadius.circular(AgencyRadius.sm),
    ),
    clipBehavior: Clip.antiAlias,
    child: url == null
        ? Icon(Icons.image_outlined, size: 20, color: colors.contentSecondary)
        : Image.network(url,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Icon(Icons.image_outlined,
                size: 20, color: colors.contentSecondary)),
  );
}

// ---------------------------------------------------------------------------
// Manage Lists — My Procurement Lists (secondary)
// ---------------------------------------------------------------------------

/// **Manage Lists:** the buyer's procurement lists, with create / rename /
/// duplicate / delete. Deliberately contains **no** purchasing controls.
class ProcurementListsManagerScreen extends ConsumerStatefulWidget {
  const ProcurementListsManagerScreen({super.key});

  @override
  ConsumerState<ProcurementListsManagerScreen> createState() =>
      _ProcurementListsManagerScreenState();
}

class _ProcurementListsManagerScreenState
    extends ConsumerState<ProcurementListsManagerScreen> {
  final TextEditingController _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<ProcurementList> _filtered(List<ProcurementList> lists) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return lists;
    return lists
        .where((l) =>
            l.title.toLowerCase().contains(q) ||
            l.description.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final lists = ref.watch(procurementListsProvider);
    final filtered = _filtered(lists);

    return Scaffold(
      appBar: AppBar(title: const Text('My Procurement Lists')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          PinSearch(
            controller: _search,
            hintText: 'Search lists',
            onChanged: (v) => setState(() => _query = v),
            onSubmitted: (v) => setState(() => _query = v),
          ),
          const SizedBox(height: AgencySpacing.md),
          PinWorkflowAction(
            label: 'Create New List',
            icon: Icons.add,
            onPressed: () => context.push('/b2b/procurement-lists/new'),
          ),
          const SizedBox(height: AgencySpacing.md),
          if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xl),
              child: Text(
                _query.trim().isEmpty
                    ? 'No procurement lists yet.'
                    : 'No lists match "${_query.trim()}".',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: colors.contentSecondary),
              ),
            )
          else
            for (final list in filtered) _listCard(context, colors, list),
        ],
      ),
    );
  }

  Widget _listCard(
      BuildContext context, AgencyColors colors, ProcurementList list) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: Material(
        color: colors.surfaceRaised,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AgencyRadius.lg),
          side: BorderSide(color: colors.borderDefault),
        ),
        child: ListTile(
          onTap: () => context.push('/b2b/procurement-lists/${list.id}/edit'),
          title: Row(
            children: <Widget>[
              Flexible(
                child: Text(list.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
              ),
              const SizedBox(width: AgencySpacing.xs),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: colors.surfaceInteractive,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(_sourceLabel(list.sourceType),
                    style:
                        TextStyle(fontSize: 9, color: colors.contentSecondary)),
              ),
            ],
          ),
          subtitle: Text('${list.itemCount} SKUs · ${list.description}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: colors.contentSecondary)),
          trailing: PopupMenuButton<String>(
            tooltip: 'List actions',
            onSelected: (action) => _onAction(action, list),
            itemBuilder: (context) => const <PopupMenuEntry<String>>[
              PopupMenuItem<String>(value: 'rename', child: Text('Rename')),
              PopupMenuItem<String>(
                  value: 'duplicate', child: Text('Duplicate')),
              PopupMenuItem<String>(value: 'delete', child: Text('Delete')),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _onAction(String action, ProcurementList list) async {
    switch (action) {
      case 'rename':
        await _rename(list);
      case 'duplicate':
        await ref
            .read(procurementListsProvider.notifier)
            .duplicateList(list.id);
        if (!mounted) return;
        PinToast.show(context, 'Duplicated "${list.title}".',
            tone: PinToastTone.success);
      case 'delete':
        await _delete(list);
    }
  }

  Future<void> _rename(ProcurementList list) async {
    final controller = TextEditingController(text: list.title);
    final name = await PinDialog.sheet<String>(
      context,
      child: Padding(
        padding: const EdgeInsets.all(AgencySpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Rename list', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AgencySpacing.sm),
            TextField(controller: controller, autofocus: true),
            const SizedBox(height: AgencySpacing.md),
            PinWorkflowAction(
              label: 'Save',
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty || !mounted) return;
    final duplicate = ref.read(procurementListsProvider).any(
        (l) => l.id != list.id && l.title.toLowerCase() == name.toLowerCase());
    if (duplicate) {
      PinToast.show(context, 'A list named "$name" already exists.',
          tone: PinToastTone.warning);
      return;
    }
    await ref.read(procurementListsProvider.notifier).renameList(list.id, name);
    if (!mounted) return;
    PinToast.show(context, 'Renamed to "$name".', tone: PinToastTone.success);
  }

  Future<void> _delete(ProcurementList list) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Delete "${list.title}"?',
      message:
          'This removes the list and its ${list.itemCount} saved SKUs. Your cart will not change.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!(ok ?? false) || !mounted) return;
    await ref.read(procurementListsProvider.notifier).deleteList(list.id);
    if (!mounted) return;
    PinToast.show(context, 'Deleted "${list.title}".', tone: PinToastTone.info);
  }
}

// ---------------------------------------------------------------------------
// Create / Edit Procurement List (one reusable editor)
// ---------------------------------------------------------------------------

/// Reusable editor for **Create** (`listId == null`) and **Edit** modes.
///
/// Adding / editing SKUs here only changes the reusable list; it never adds
/// anything to the cart. Curated/suggested lists save as an editable
/// buyer-owned copy (handled by [ProcurementListsNotifier.saveEdited]).
class ProcurementListEditorScreen extends ConsumerStatefulWidget {
  const ProcurementListEditorScreen({this.listId, super.key});

  final String? listId;

  @override
  ConsumerState<ProcurementListEditorScreen> createState() =>
      _ProcurementListEditorScreenState();
}

class _ProcurementListEditorScreenState
    extends ConsumerState<ProcurementListEditorScreen> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _search = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  final List<ProcurementListItem> _items = <ProcurementListItem>[];
  bool _dirty = false;

  /// Browse category for the add-products section (null = All).
  String? _catId;

  /// How many addable catalogue products are currently revealed.
  int _addVisible = 6;

  bool get _isEdit => widget.listId != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final lists = ref.read(procurementListsProvider);
    ProcurementList? list;
    for (final l in lists) {
      if (l.id == widget.listId) {
        list = l;
      }
    }
    if (list != null) {
      _name.text = list.title;
      _items
        ..clear()
        ..addAll(list.items);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _markDirty() => setState(() => _dirty = true);

  // ---- adding products -----------------------------------------------------

  /// Catalogue products that can be added: filtered by the browse category and
  /// the search box, excluding SKUs already in the list. Shown by default so
  /// browsing works without typing.
  List<TradeProduct> _addable(List<TradeProduct> catalogue) {
    final q = _search.text.trim().toLowerCase();
    final inList = _items.map((i) => i.sku).toSet();
    return catalogue
        .where((p) {
          if (inList.contains(p.product.id)) return false;
          if (_catId != null && p.categoryId != _catId) return false;
          if (q.isEmpty) return true;
          return p.product.title.toLowerCase().contains(q) ||
              (p.product.brand ?? '').toLowerCase().contains(q) ||
              p.product.id.toLowerCase().contains(q);
        })
        .take(_addVisible)
        .toList();
  }

  /// Whether more addable products exist beyond those currently shown.
  bool _hasMoreAddable(List<TradeProduct> catalogue) {
    final q = _search.text.trim().toLowerCase();
    final inList = _items.map((i) => i.sku).toSet();
    return catalogue.where((p) {
          if (inList.contains(p.product.id)) return false;
          if (_catId != null && p.categoryId != _catId) return false;
          if (q.isEmpty) return true;
          return p.product.title.toLowerCase().contains(q) ||
              (p.product.brand ?? '').toLowerCase().contains(q) ||
              p.product.id.toLowerCase().contains(q);
        }).length >
        _addVisible;
  }

  void _addProduct(TradeProduct p) {
    if (_items.any((i) => i.sku == p.product.id)) {
      PinToast.show(context, '${p.product.id} is already in this list.',
          tone: PinToastTone.info);
      return;
    }
    _items.add(ProcurementListItem(
      sku: p.product.id,
      name: p.product.title,
      quantity: p.moq,
      unitPrice: p.tradePrice,
    ));
    _search.clear();
    _markDirty();
  }

  void _remove(String sku) {
    setState(() {
      _items.removeWhere((i) => i.sku == sku);
      _dirty = true;
    });
  }

  void _setDefaultQty(String sku, int qty) {
    if (qty <= 0) return;
    final idx = _items.indexWhere((i) => i.sku == sku);
    if (idx < 0) return;
    setState(() {
      _items[idx] = ProcurementListItem(
        sku: _items[idx].sku,
        name: _items[idx].name,
        quantity: qty,
        unitPrice: _items[idx].unitPrice,
      );
      _dirty = true;
    });
  }

  // ---- save ----------------------------------------------------------------

  String? _validate() {
    final name = _name.text.trim();
    if (name.isEmpty) return 'Enter a list name.';
    if (name.length > 50) return 'Use 50 characters or fewer.';
    final duplicate = ref.read(procurementListsProvider).any((l) =>
        l.id != widget.listId && l.title.toLowerCase() == name.toLowerCase());
    if (duplicate) return 'A list named "$name" already exists.';
    if (_items.any((i) => i.quantity <= 0)) {
      return 'Quantities must be 1 or more.';
    }
    final skus = _items.map((i) => i.sku).toList();
    if (skus.toSet().length != skus.length) {
      return 'Duplicate SKUs are not allowed.';
    }
    return null;
  }

  Future<void> _save() async {
    final error = _validate();
    if (error != null) {
      PinToast.show(context, error, tone: PinToastTone.warning);
      return;
    }
    await ref.read(procurementListsProvider.notifier).saveEdited(
          listId: widget.listId,
          title: _name.text.trim(),
          items: List<ProcurementListItem>.of(_items),
        );
    if (!mounted) return;
    _dirty = false;
    PinToast.show(context, 'List saved.', tone: PinToastTone.success);
    Navigator.of(context).maybePop();
  }

  // ---- upload --------------------------------------------------------------

  void _upload() {
    // Development fixture: the CSV/Excel/PDF parser is not wired in this build.
    PinToast.show(
        context, 'Upload list (CSV/Excel/PDF) is a development fixture.',
        tone: PinToastTone.info);
  }

  // ---- build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final catalogue = ref.watch(tradeCatalogueProvider);
    final addable = _addable(catalogue);
    final tradeCategories = ref.watch(tradeDashboardProvider).categories;
    final selectedCatLabel = _catId == null
        ? null
        : tradeCategories
            .where((c) => c.id == _catId)
            .map((c) => c.label)
            .firstOrNull;

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        final leave = await PinDialog.confirm(
          context,
          title: 'Discard changes?',
          message: 'You have unsaved changes to this list.',
          confirmLabel: 'Discard',
          destructive: true,
        );
        if (!mounted) return;
        if (leave ?? false) {
          setState(() => _dirty = false);
          navigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title:
              Text(_isEdit ? 'Edit Procurement List' : 'New Procurement List'),
          actions: <Widget>[
            TextButton(
              onPressed: _save,
              child: const Text('Save'),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(AgencySpacing.md),
          children: <Widget>[
            Text('List Name',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.xs),
            TextField(
              controller: _name,
              onChanged: (_) => _markDirty(),
              decoration: const InputDecoration(
                hintText: 'e.g. Renovation Essentials',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: AgencySpacing.lg),
            Text('ADD PRODUCTS',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                    color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.xs),
            TextField(
              controller: _search,
              focusNode: _searchFocus,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search products / SKU',
                prefixIcon: Icon(Icons.search, size: 18),
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: AgencySpacing.sm),
            CategoryIconRail(
              categories: <Category>[
                const Category(label: 'All', icon: Icons.apps_outlined),
                for (final c in tradeCategories)
                  Category(label: c.label, icon: c.icon),
              ],
              selectedLabel: selectedCatLabel ?? 'All',
              onSelected: (c) => setState(() {
                _catId = c.label == 'All'
                    ? null
                    : tradeCategories
                        .firstWhere((t) => t.label == c.label,
                            orElse: () => tradeCategories.first)
                        .id;
                _addVisible = 6;
              }),
            ),
            const SizedBox(height: AgencySpacing.sm),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _upload,
                icon: const Icon(Icons.upload_file, size: 18),
                label: const Text('Upload list'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(40),
                  side: BorderSide(color: colors.borderDefault),
                  foregroundColor: colors.actionPrimary,
                ),
              ),
            ),
            const SizedBox(height: AgencySpacing.sm),
            if (addable.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
                child: Text(
                    'No more products match — try another search or category.',
                    style: TextStyle(
                        fontSize: 13, color: colors.contentSecondary)),
              )
            else ...<Widget>[
              Container(
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(AgencyRadius.lg),
                  border: Border.all(color: colors.borderDefault),
                ),
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    children: <Widget>[
                      for (final p in addable)
                        ListTile(
                          dense: true,
                          leading: _thumb(context, p.product.thumbnail),
                          title: Text(p.product.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 13, color: colors.contentPrimary)),
                          subtitle: Text(
                              '${p.product.id} · ${p.tradePrice.formatted}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: colors.contentSecondary)),
                          trailing: Icon(Icons.add_circle_outline,
                              color: colors.actionPrimary),
                          onTap: () => _addProduct(p),
                        ),
                    ],
                  ),
                ),
              ),
              if (_hasMoreAddable(catalogue))
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _addVisible += 6),
                    child: const Text('Show more products'),
                  ),
                ),
            ],
            const SizedBox(height: AgencySpacing.lg),
            Text('SKUS IN THIS LIST (${_items.length})',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                    color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.sm),
            if (_items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AgencySpacing.lg),
                child: Text('No SKUs yet — search above to add products.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 13, color: colors.contentSecondary)),
              )
            else
              for (final item in _items) _itemRow(colors, item),
            const SizedBox(height: AgencySpacing.md),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _save,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Save Changes'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _itemRow(AgencyColors colors, ProcurementListItem item) {
    final product = _catalogueProduct(item.sku);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.sm),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          _thumb(context, product?.product.thumbnail),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(item.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text(item.sku,
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
                const SizedBox(height: 4),
                Row(
                  children: <Widget>[
                    Text('Default Qty',
                        style: TextStyle(
                            fontSize: 11, color: colors.contentSecondary)),
                    const SizedBox(width: AgencySpacing.sm),
                    QuantityStepper(
                      value: item.quantity,
                      min: 1,
                      compact: true,
                      dense: true,
                      onChanged: (v) => _setDefaultQty(item.sku, v),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => _remove(item.sku),
                      style: TextButton.styleFrom(
                        minimumSize: Size.zero,
                        padding: const EdgeInsets.symmetric(
                            horizontal: AgencySpacing.xs,
                            vertical: AgencySpacing.xs),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('Remove',
                          style: TextStyle(
                              fontSize: 12, color: colors.feedbackError)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  TradeProduct? _catalogueProduct(String sku) {
    for (final p in ref.read(tradeCatalogueProvider)) {
      if (p.product.id == sku) return p;
    }
    return null;
  }
}
