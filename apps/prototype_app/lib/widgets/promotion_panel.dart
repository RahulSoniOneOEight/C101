import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/experience_api.dart';
import '../domain/models.dart';
import '../providers/cart_providers.dart';

/// Promo-code entry against the canonical cart.
///
/// The panel never decides eligibility: it sends the code, renders the engine's
/// discount, and explains a rejection using the reason the API returned.
class PromotionPanel extends ConsumerStatefulWidget {
  const PromotionPanel({required this.cart, super.key});

  final Cart cart;

  @override
  ConsumerState<PromotionPanel> createState() => _PromotionPanelState();
}

class _PromotionPanelState extends ConsumerState<PromotionPanel> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final code = _controller.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(cartProvider.notifier).applyPromotion(code);
      _controller.clear();
    } on PromotionRejected catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(String code) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(cartProvider.notifier).removePromotion(code);
    } on PromotionRejected catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final promotions = widget.cart.promotions;
    final automatic =
        promotions.where((promotion) => promotion.isAutomatic).toList();
    final codes =
        promotions.where((promotion) => !promotion.isAutomatic).toList();
    return Container(
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Offers & promo codes',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          Row(
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _controller,
                  textCapitalization: TextCapitalization.characters,
                  enabled: !_busy,
                  decoration: InputDecoration(
                    hintText: 'Enter code',
                    isDense: true,
                    filled: true,
                    fillColor: colors.surfacePage,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AgencyRadius.md),
                    ),
                  ),
                  onSubmitted: (_) => _apply(),
                ),
              ),
              const SizedBox(width: AgencySpacing.sm),
              FilledButton(
                onPressed: _busy ? null : _apply,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size(80, 44),
                ),
                child: Text(_busy ? '...' : 'Apply'),
              ),
            ],
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: AgencySpacing.xs),
            Text(_error!,
                style: TextStyle(fontSize: 12, color: colors.promotion)),
          ],
          if (automatic.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            Wrap(
              spacing: AgencySpacing.xs,
              runSpacing: AgencySpacing.xs,
              children: <Widget>[
                for (final promotion in automatic)
                  Chip(
                    avatar: const Icon(Icons.auto_awesome, size: 14),
                    label: Text('${promotion.code} · Auto',
                        style: const TextStyle(fontSize: 11)),
                  ),
              ],
            ),
            const SizedBox(height: AgencySpacing.xs),
            Text(
              'Store-applied offers stay active. You can still add a code and the engine will decide the final discount.',
              style: TextStyle(fontSize: 11, color: colors.contentSecondary),
            ),
          ],
          if (codes.isNotEmpty) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            Wrap(
              spacing: AgencySpacing.xs,
              runSpacing: AgencySpacing.xs,
              children: <Widget>[
                for (final promotion in codes)
                  InputChip(
                    label: Text(promotion.code,
                        style: const TextStyle(fontSize: 11)),
                    onDeleted: _busy ? null : () => _remove(promotion.code),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
