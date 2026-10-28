import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../domain/order_models.dart';
import '../providers/orders_providers.dart';
import '../widgets/status_views.dart';

/// Phase 1 return request. Eligibility, policy snapshots and idempotency are server-owned.
Future<void> showReturnRequestSheet(
  BuildContext context,
  WidgetRef ref,
  CustomerOrder order,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ReturnRequestSheet(order: order),
  );
}

class _ReturnRequestSheet extends ConsumerStatefulWidget {
  const _ReturnRequestSheet({required this.order});

  final CustomerOrder order;

  @override
  ConsumerState<_ReturnRequestSheet> createState() =>
      _ReturnRequestSheetState();
}

class _ReturnRequestSheetState extends ConsumerState<_ReturnRequestSheet> {
  final Map<String, int> _quantities = <String, int>{};
  final TextEditingController _comment = TextEditingController();
  String _resolution = 'refund';
  String? _reason;
  bool _busy = false;
  String? _error;

  List<OrderLine> get _eligible =>
      widget.order.lines.where((line) => line.returnEligible).toList();

  @override
  void initState() {
    super.initState();
    for (final line in _eligible) {
      _quantities[line.lineKey] = line.returnableQty.clamp(1, line.returnableQty);
    }
    _reason = _eligible.expand((line) => line.allowedReasons).firstOrNull;
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final selected = _eligible
        .where((line) => (_quantities[line.lineKey] ?? 0) > 0)
        .toList();
    if (selected.isEmpty) {
      setState(() => _error = 'Select at least one item to return.');
      return;
    }
    final reason = _reason;
    if (reason == null || reason.isEmpty) {
      setState(() => _error = 'Choose a return reason.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final idempotencyKey =
          'return_${widget.order.id}_${DateTime.now().microsecondsSinceEpoch}';
      await ref.read(experienceApiProvider).requestReturn(
            orderId: widget.order.id,
            idempotencyKey: idempotencyKey,
            resolution: _resolution,
            reasonCode: reason,
            customerComment:
                _comment.text.trim().isEmpty ? null : _comment.text.trim(),
            lines: selected
                .map((line) => <String, dynamic>{
                      'line_key': line.lineKey,
                      'requested_qty': _quantities[line.lineKey],
                      'reason_code': reason,
                    })
                .toList(),
          );
      ref.invalidate(apiOrderProvider(widget.order.id));
      ref.invalidate(apiOrdersProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      PinToast.show(
        context,
        'Return requested. A support operator will review it.',
        tone: PinToastTone.success,
      );
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error is Exception
              ? 'The return could not be submitted. Check the selected quantities and retry.'
              : 'The return could not be submitted.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AgencySpacing.md,
          0,
          AgencySpacing.md,
          MediaQuery.viewInsetsOf(context).bottom + AgencySpacing.md,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.9,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      'Request a return',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close return request',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Text(
                'Eligibility and the policy snapshot are checked by the server. '
                'This phase records a case only; no refund or stock movement is executed.',
                style: TextStyle(fontSize: 11, color: colors.contentSecondary),
              ),
              const SizedBox(height: AgencySpacing.sm),
              if (_eligible.isEmpty)
                Text(
                  'No line is currently eligible for return. Check the delivery date and any existing return.',
                  style: TextStyle(color: colors.feedbackWarning),
                )
              else
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    children: <Widget>[
                      for (final line in _eligible)
                        Container(
                          margin: const EdgeInsets.only(
                              bottom: AgencySpacing.sm),
                          padding: const EdgeInsets.all(AgencySpacing.sm),
                          decoration: BoxDecoration(
                            color: colors.surfaceRaised,
                            borderRadius:
                                BorderRadius.circular(AgencyRadius.md),
                            border: Border.all(color: colors.borderDefault),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(
                                line.title,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: colors.contentPrimary,
                                ),
                              ),
                              Text(
                                'Delivered ${line.deliveredQty} · '
                                'Returnable ${line.returnableQty}'
                                '${line.deadline == null ? '' : ' · by ${line.deadline!.day}/${line.deadline!.month}'}',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: colors.contentSecondary,
                                ),
                              ),
                              Row(
                                children: <Widget>[
                                  const Text('Quantity'),
                                  const Spacer(),
                                  IconButton(
                                    tooltip: 'Decrease return quantity',
                                    onPressed: () => setState(() {
                                      final current =
                                          _quantities[line.lineKey] ?? 0;
                                      _quantities[line.lineKey] =
                                          (current - 1).clamp(0, line.returnableQty);
                                    }),
                                    icon: const Icon(Icons.remove, size: 17),
                                  ),
                                  Text('${_quantities[line.lineKey] ?? 0}'),
                                  IconButton(
                                    tooltip: 'Increase return quantity',
                                    onPressed: () => setState(() {
                                      final current =
                                          _quantities[line.lineKey] ?? 0;
                                      _quantities[line.lineKey] =
                                          (current + 1).clamp(0, line.returnableQty);
                                    }),
                                    icon: const Icon(Icons.add, size: 17),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      DropdownButtonFormField<String>(
                        initialValue: _reason,
                        decoration: const InputDecoration(
                          labelText: 'Reason',
                        ),
                        items: _eligible
                            .expand((line) => line.allowedReasons)
                            .toSet()
                            .map((reason) => DropdownMenuItem<String>(
                                  value: reason,
                                  child: Text(reason.replaceAll('_', ' ')),
                                ))
                            .toList(),
                        onChanged: (value) => setState(() => _reason = value),
                      ),
                      const SizedBox(height: AgencySpacing.sm),
                      SegmentedButton<String>(
                        segments: const <ButtonSegment<String>>[
                          ButtonSegment(value: 'refund', label: Text('Refund')),
                          ButtonSegment(
                              value: 'replacement',
                              label: Text('Replacement')),
                        ],
                        selected: <String>{_resolution},
                        onSelectionChanged: (value) =>
                            setState(() => _resolution = value.first),
                      ),
                      const SizedBox(height: AgencySpacing.sm),
                      TextField(
                        controller: _comment,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Comment (optional)',
                        ),
                      ),
                    ],
                  ),
                ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: AgencySpacing.xs),
                Text(_error!, style: TextStyle(color: colors.feedbackError)),
              ],
              const SizedBox(height: AgencySpacing.sm),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy || _eligible.isEmpty ? null : _submit,
                  child: Text(_busy ? 'Submitting…' : 'Submit return request'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Deep-linkable return entry point. The form itself is a reviewable bottom sheet.
class ReturnRequestScreen extends ConsumerWidget {
  const ReturnRequestScreen({required this.orderId, super.key});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(apiOrderProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Return / Replace')),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const EmptyView(message: 'Order could not be loaded'),
        data: (order) {
          if (order == null) {
            return const EmptyView(message: 'Order not found');
          }
          final eligible =
              order.lines.where((line) => line.returnEligible).toList();
          if (eligible.isEmpty) {
            return const EmptyView(
              message: 'No item on this order is currently eligible for return.',
            );
          }
          return ListView(
            padding: const EdgeInsets.all(AgencySpacing.md),
            children: <Widget>[
              Text(
                'Eligible items',
                style: AgencyText.title,
              ),
              const SizedBox(height: AgencySpacing.xs),
              for (final line in eligible)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(line.title),
                  subtitle: Text(
                    'Delivered ${line.deliveredQty} � Returnable ${line.returnableQty}',
                  ),
                ),
              const SizedBox(height: AgencySpacing.md),
              FilledButton(
                onPressed: () => showReturnRequestSheet(context, ref, order),
                child: const Text('Start return request'),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Customer-owned return status, including explicitly simulated refund evidence.
class ReturnStatusScreen extends ConsumerWidget {
  const ReturnStatusScreen({required this.returnId, super.key});

  final String returnId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final returnAsync = ref.watch(returnByIdProvider(returnId));
    return Scaffold(
      appBar: AppBar(title: const Text('Return status')),
      body: returnAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const EmptyView(message: 'Return could not be loaded'),
        data: (data) {
          final record = data['return'] as Map<String, dynamic>? ?? data;
          final lines = (record['lines'] as List? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .toList();
          final refundSimulation =
              record['refundSimulation'] as Map<String, dynamic>?;
          final refundAmount = refundSimulation?['amountMinor'] is num
              ? '₹${((refundSimulation!['amountMinor'] as num) / 100).toStringAsFixed(2)}'
              : null;
          final status = record['status'] as String? ?? 'requested';
          return ListView(
            padding: const EdgeInsets.all(AgencySpacing.md),
            children: <Widget>[
              Text(
                'Return ${record['id'] ?? returnId}',
                style: AgencyText.title,
              ),
              const SizedBox(height: AgencySpacing.xs),
              Text(
                'Status: $status',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary,
                ),
              ),
              Text(
                'Resolution: ${record['resolution'] ?? 'refund'}',
                style: TextStyle(fontSize: 12, color: colors.contentSecondary),
              ),
              if (refundSimulation != null)
                Text(
                  'Refund simulation: ${refundSimulation['status'] ?? 'simulated_pending'}'
                  '${refundAmount == null ? '' : ' · $refundAmount'}',
                  style: TextStyle(fontSize: 12, color: colors.contentSecondary),
                ),
              if (refundSimulation != null)
                Text(
                  'Reference: ${refundSimulation['simulationReference'] ?? 'SIM pending'}',
                  style: TextStyle(fontSize: 12, color: colors.contentSecondary),
                ),
              const SizedBox(height: AgencySpacing.sm),
              Text(
                refundSimulation != null
                    ? 'This is simulated evidence only. No real money moved and no stock was posted.'
                    : status == 'inspection_complete'
                        ? 'Inspection evidence is complete. Admin may now record a simulated refund; no real money or stock moves.'
                        : 'This case records return evidence. Refund simulation becomes available only after inspection.',
                style: TextStyle(fontSize: 11, color: colors.feedbackWarning),
              ),
              const SizedBox(height: AgencySpacing.md),
              for (final line in lines)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(line['sku'] as String? ?? 'Returned item'),
                  subtitle: Text(
                    'Requested ${line['requestedQty'] ?? line['requested_qty'] ?? 0}'
                    '${(line['approvedQty'] ?? line['approved_qty']) == null ? '' : ' · Approved ${line['approvedQty'] ?? line['approved_qty']}'}'
                    '${line['condition'] == null ? '' : ' · ${line['condition']}'}'
                    '${line['disposition'] == null ? '' : ' · ${line['disposition']} intent (evidence only)'}',
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
