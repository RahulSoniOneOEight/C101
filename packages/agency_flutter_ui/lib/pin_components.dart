part of 'agency_flutter_ui.dart';

/// Governed (`Pin*`) Flutter components declared in the UI Implementation
/// Registry (`commerce.*`, `b2b.*`, `workflow.*`, `fulfilment.*`, `layout.*`,
/// `analytics.*`, `feedback.*`, `navigation.*`, `overlay.*`, `input.*`).
///
/// Presentation-only: primitives + callbacks so the app layer binds models.
/// All colours/spacing/radius resolve through the shared design system.

// ---------------------------------------------------------------------------
// commerce.search -> PinSearch
// ---------------------------------------------------------------------------

class PinSearch extends StatelessWidget {
  const PinSearch({
    this.controller,
    this.focusNode,
    this.hintText = 'Search products, brands, sellers',
    this.onChanged,
    this.onSubmitted,
    this.onFilterTap,
    this.autofocus = false,
    super.key,
  });

  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onFilterTap;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return TextField(
      controller: controller,
      focusNode: focusNode,
      autofocus: autofocus,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hintText,
        prefixIcon: const Icon(Icons.search, size: 18),
        suffixIcon: onFilterTap == null
            ? null
            : IconButton(
                tooltip: 'Filters',
                onPressed: onFilterTap,
                icon: const Icon(Icons.tune, size: 18),
              ),
        isDense: true,
        filled: true,
        fillColor: colors.surfacePage,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          borderSide: BorderSide(color: colors.borderDefault),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AgencyRadius.md),
          borderSide: BorderSide(color: colors.borderDefault),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// commerce.cart-line -> PinCartLine
// ---------------------------------------------------------------------------

class PinCartLine extends StatelessWidget {
  const PinCartLine({
    required this.title,
    required this.quantity,
    this.subtitle,
    this.unitPriceLabel,
    this.imageUrl,
    this.onIncrement,
    this.onDecrement,
    this.onRemove,
    super.key,
  });

  final String title;
  final int quantity;
  final String? subtitle;
  final String? unitPriceLabel;
  final String? imageUrl;
  final VoidCallback? onIncrement;
  final VoidCallback? onDecrement;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
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
            clipBehavior: Clip.antiAlias,
            child: imageUrl == null
                ? Icon(Icons.image_outlined,
                    size: 22, color: colors.contentSecondary)
                : Image.network(imageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Icon(Icons.image_outlined,
                        size: 22, color: colors.contentSecondary)),
          ),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                if (subtitle != null)
                  Text(subtitle!,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                if (unitPriceLabel != null) ...<Widget>[
                  const SizedBox(height: 2),
                  Text(unitPriceLabel!,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: colors.contentPrimary)),
                ],
              ],
            ),
          ),
          QuantityStepper(
            value: quantity,
            min: 0,
            compact: true,
            onChanged: (v) {
              if (v > quantity) {
                onIncrement?.call();
              } else {
                onDecrement?.call();
              }
            },
          ),
          if (onRemove != null)
            IconButton(
              tooltip: 'Remove',
              onPressed: onRemove,
              icon: const Icon(Icons.close, size: 16),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// commerce.order-card -> PinOrderCard
// ---------------------------------------------------------------------------

enum PinOrderTone { neutral, success, warning, error }

class PinOrderCard extends StatelessWidget {
  const PinOrderCard({
    required this.orderRef,
    required this.status,
    required this.meta,
    required this.totalLabel,
    this.tone = PinOrderTone.neutral,
    this.actions,
    this.onTap,
    super.key,
  });

  final String orderRef;
  final String status;
  final String meta;
  final String totalLabel;
  final PinOrderTone tone;
  final List<Widget>? actions;
  final VoidCallback? onTap;

  Color _toneColor(AgencyColors c) => switch (tone) {
        PinOrderTone.neutral => c.actionPrimary,
        PinOrderTone.success => c.feedbackSuccess,
        PinOrderTone.warning => c.feedbackWarning,
        PinOrderTone.error => c.feedbackError,
      };

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final toneColor = _toneColor(colors);
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(orderRef,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.contentPrimary)),
                ),
                _StatusPill(label: status, color: toneColor),
              ],
            ),
            const SizedBox(height: AgencySpacing.xs),
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ),
                Text(totalLabel,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.contentPrimary)),
              ],
            ),
            if (actions != null) ...<Widget>[
              const SizedBox(height: AgencySpacing.sm),
              Row(children: actions!),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

// ---------------------------------------------------------------------------
// fulfilment.shipment-status -> PinShipmentStatus
// ---------------------------------------------------------------------------

enum PinShipmentState {
  processing,
  shipped,
  outForDelivery,
  delivered,
  exception,
}

class PinShipmentStatus extends StatelessWidget {
  const PinShipmentStatus({required this.state, super.key});

  final PinShipmentState state;

  static String _label(PinShipmentState s) => switch (s) {
        PinShipmentState.processing => 'Processing',
        PinShipmentState.shipped => 'Shipped',
        PinShipmentState.outForDelivery => 'Out for delivery',
        PinShipmentState.delivered => 'Delivered',
        PinShipmentState.exception => 'Exception',
      };

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final color = switch (state) {
      PinShipmentState.processing => colors.feedbackInfo,
      PinShipmentState.shipped => colors.actionPrimary,
      PinShipmentState.outForDelivery => colors.feedbackWarning,
      PinShipmentState.delivered => colors.feedbackSuccess,
      PinShipmentState.exception => colors.feedbackError,
    };
    return _StatusPill(label: _label(state), color: color);
  }
}

// ---------------------------------------------------------------------------
// commerce.return-status -> PinReturnStatus
// ---------------------------------------------------------------------------

enum PinReturnState { request, reviewing, accepted, refunded, rejected }

class PinReturnStatus extends StatelessWidget {
  const PinReturnStatus({required this.state, super.key});

  final PinReturnState state;

  static String _label(PinReturnState s) => switch (s) {
        PinReturnState.request => 'Requested',
        PinReturnState.reviewing => 'Reviewing',
        PinReturnState.accepted => 'Accepted',
        PinReturnState.refunded => 'Refunded',
        PinReturnState.rejected => 'Rejected',
      };

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final color = switch (state) {
      PinReturnState.request => colors.feedbackInfo,
      PinReturnState.reviewing => colors.feedbackWarning,
      PinReturnState.accepted => colors.actionPrimary,
      PinReturnState.refunded => colors.feedbackSuccess,
      PinReturnState.rejected => colors.feedbackError,
    };
    return _StatusPill(label: _label(state), color: color);
  }
}

// ---------------------------------------------------------------------------
// workflow.approval-status -> PinApprovalStatus
// ---------------------------------------------------------------------------

enum PinApprovalState { pending, approved, rejected }

class PinApprovalStatus extends StatelessWidget {
  const PinApprovalStatus({required this.state, super.key});

  final PinApprovalState state;

  static String _label(PinApprovalState s) => switch (s) {
        PinApprovalState.pending => 'Pending',
        PinApprovalState.approved => 'Approved',
        PinApprovalState.rejected => 'Rejected',
      };

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final color = switch (state) {
      PinApprovalState.pending => colors.feedbackWarning,
      PinApprovalState.approved => colors.feedbackSuccess,
      PinApprovalState.rejected => colors.feedbackError,
    };
    return _StatusPill(label: _label(state), color: color);
  }
}

// ---------------------------------------------------------------------------
// b2b.credit-limit -> PinCreditLimit
// ---------------------------------------------------------------------------

enum PinCreditHealth { available, warning, blocked }

class PinCreditLimit extends StatelessWidget {
  const PinCreditLimit({
    required this.availableLabel,
    required this.limitLabel,
    this.health = PinCreditHealth.available,
    this.usedFraction = 0,
    super.key,
  });

  final String availableLabel;
  final String limitLabel;
  final PinCreditHealth health;
  final double usedFraction;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    final color = switch (health) {
      PinCreditHealth.available => colors.feedbackSuccess,
      PinCreditHealth.warning => colors.feedbackWarning,
      PinCreditHealth.blocked => colors.feedbackError,
    };
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
          Row(
            children: <Widget>[
              Text('Available credit',
                  style: TextStyle(
                      fontSize: 11, color: colors.contentSecondary)),
              const Spacer(),
              _StatusPill(
                  label: switch (health) {
                    PinCreditHealth.available => 'Available',
                    PinCreditHealth.warning => 'Low credit',
                    PinCreditHealth.blocked => 'Blocked',
                  },
                  color: color),
            ],
          ),
          const SizedBox(height: 4),
          Text(availableLabel,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: colors.contentPrimary)),
          const SizedBox(height: 2),
          Text(limitLabel,
              style:
                  TextStyle(fontSize: 11, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AgencyRadius.sm),
            child: LinearProgressIndicator(
              value: usedFraction.clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: colors.surfaceInteractive,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// workflow.action -> PinWorkflowAction
// ---------------------------------------------------------------------------

enum PinWorkflowHierarchy { primary, secondary, destructive }

class PinWorkflowAction extends StatelessWidget {
  const PinWorkflowAction({
    required this.label,
    this.hierarchy = PinWorkflowHierarchy.primary,
    this.onPressed,
    this.icon,
    super.key,
  });

  final String label;
  final PinWorkflowHierarchy hierarchy;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    switch (hierarchy) {
      case PinWorkflowHierarchy.primary:
        return FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: colors.actionPrimary,
            minimumSize: const Size.fromHeight(48),
          ),
          child: Text(label),
        );
      case PinWorkflowHierarchy.destructive:
        return FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: colors.feedbackError,
            minimumSize: const Size.fromHeight(48),
          ),
          child: Text(label),
        );
      case PinWorkflowHierarchy.secondary:
        return OutlinedButton.icon(
          onPressed: onPressed,
          icon: icon == null ? null : Icon(icon, size: 18),
          label: Text(label),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            side: BorderSide(color: colors.borderDefault),
            foregroundColor: colors.actionPrimary,
          ),
        );
    }
  }
}

// ---------------------------------------------------------------------------
// b2b.reorder-action -> PinReorderAction
// ---------------------------------------------------------------------------

class PinReorderAction extends StatelessWidget {
  const PinReorderAction({
    this.label = 'Reorder',
    this.detailed = false,
    this.onPressed,
    super.key,
  });

  final String label;
  final bool detailed;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(detailed ? Icons.refresh : Icons.replay, size: 16),
      label: Text(detailed ? '$label details' : label),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: colors.borderDefault),
        foregroundColor: colors.actionPrimary,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// commerce.form -> PinForm (field + form)
// ---------------------------------------------------------------------------

class PinFormField {
  const PinFormField({
    required this.label,
    this.value = '',
    this.helper,
    this.error,
    this.keyboardType,
  });

  final String label;
  final String value;
  final String? helper;
  final String? error;
  final TextInputType? keyboardType;
}

class PinForm extends StatelessWidget {
  const PinForm({
    required this.fields,
    this.onChanged,
    this.onSubmit,
    this.submitLabel = 'Submit',
    this.dense = false,
    super.key,
  });

  final List<PinFormField> fields;
  final void Function(String label, String value)? onChanged;
  final VoidCallback? onSubmit;
  final String submitLabel;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final f in fields)
          Padding(
            padding: EdgeInsets.only(
                bottom: dense ? AgencySpacing.sm : AgencySpacing.md),
            child: TextFormField(
              initialValue: f.value,
              keyboardType: f.keyboardType,
              onChanged:
                  onChanged == null ? null : (v) => onChanged!(f.label, v),
              decoration: InputDecoration(
                labelText: f.label,
                helperText: f.helper,
                errorText: f.error,
                isDense: dense,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AgencyRadius.md)),
              ),
            ),
          ),
        if (onSubmit != null)
          FilledButton(
            onPressed: onSubmit,
            style: FilledButton.styleFrom(
              backgroundColor: colors.actionPrimary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(submitLabel),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// b2b.rfq-form -> PinRFQForm
// ---------------------------------------------------------------------------

class PinRFQForm extends StatefulWidget {
  const PinRFQForm({
    this.title = 'Request a quote',
    this.onSubmit,
    super.key,
  });

  final String title;
  final void Function(String material, String quantity, String targetPrice)?
      onSubmit;

  @override
  State<PinRFQForm> createState() => _PinRFQFormState();
}

class _PinRFQFormState extends State<PinRFQForm> {
  final Map<String, String> _values = <String, String>{};

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(widget.title,
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: colors.contentPrimary)),
        const SizedBox(height: AgencySpacing.md),
        PinForm(
          fields: const <PinFormField>[
            PinFormField(label: 'Material / SKU'),
            PinFormField(label: 'Quantity', keyboardType: TextInputType.number),
            PinFormField(
                label: 'Target price', keyboardType: TextInputType.number),
          ],
          onChanged: (label, value) => _values[label] = value,
        ),
        const SizedBox(height: AgencySpacing.lg),
        FilledButton(
          onPressed: () => widget.onSubmit?.call(
            _values['Material / SKU'] ?? '',
            _values['Quantity'] ?? '',
            _values['Target price'] ?? '',
          ),
          style: FilledButton.styleFrom(
            backgroundColor: colors.actionPrimary,
            minimumSize: const Size.fromHeight(48),
          ),
          child: const Text('Submit RFQ'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// analytics.chart -> PinChart
// ---------------------------------------------------------------------------

enum PinChartKind { line, bar, area, donut }

class PinChart extends StatelessWidget {
  const PinChart({
    required this.kind,
    required this.values,
    this.height = 160,
    this.color,
    super.key,
  });

  final PinChartKind kind;
  final List<double> values;
  final double height;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Semantics(
      label: '${kind.name} chart',
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: values.isEmpty
            ? Center(
                child: Text('No data',
                    style: TextStyle(color: colors.contentSecondary)))
            : CustomPaint(
                painter: _PinChartPainter(
                  kind: kind,
                  values: values,
                  color: color ?? colors.actionPrimary,
                  grid: colors.borderDefault,
                ),
              ),
      ),
    );
  }
}

class _PinChartPainter extends CustomPainter {
  _PinChartPainter({
    required this.kind,
    required this.values,
    required this.color,
    required this.grid,
  });

  final PinChartKind kind;
  final List<double> values;
  final Color color;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    final maxValue = values.reduce((a, b) => a > b ? a : b);
    final safeMax = maxValue <= 0 ? 1.0 : maxValue;

    if (kind == PinChartKind.donut) {
      final total = values.fold<double>(0, (s, v) => s + v);
      final rect = Rect.fromCircle(
          center: size.center(Offset.zero),
          radius: size.shortestSide / 2 - 4);
      var start = -math.pi / 2;
      for (var i = 0; i < values.length; i++) {
        final sweep = total <= 0 ? 0.0 : (values[i] / total) * 2 * math.pi;
        final paint = Paint()
          ..color = color.withValues(alpha: 1 - (i * 0.18).clamp(0, 0.6))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 18;
        canvas.drawArc(rect, start, sweep, false, paint);
        start += sweep;
      }
      return;
    }

    final baseline = size.height - 2;
    canvas.drawLine(
      Offset(0, baseline),
      Offset(size.width, baseline),
      Paint()
        ..color = grid
        ..strokeWidth = 1,
    );
    final barWidth = size.width / (values.length * 1.6);
    for (var i = 0; i < values.length; i++) {
      final x = (i + 0.5) * (size.width / values.length);
      final h = (values[i] / safeMax) * (size.height - 8);
      if (kind == PinChartKind.bar || kind == PinChartKind.area) {
        final paint = Paint()..color = color;
        if (kind == PinChartKind.bar) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(x - barWidth / 2, baseline - h, barWidth, h),
              const Radius.circular(4),
            ),
            paint,
          );
        } else {
          final path = Path()..moveTo(0, baseline);
          for (var j = 0; j < values.length; j++) {
            final px = (j + 0.5) * (size.width / values.length);
            final ph = (values[j] / safeMax) * (size.height - 8);
            path.lineTo(px, baseline - ph);
          }
          path
            ..lineTo(size.width, baseline)
            ..close();
          canvas.drawPath(path, Paint()..color = color.withValues(alpha: 0.18));
        }
      }
    }

    // Line overlay for line/area.
    final linePath = Path();
    for (var i = 0; i < values.length; i++) {
      final x = (i + 0.5) * (size.width / values.length);
      final y = baseline - (values[i] / safeMax) * (size.height - 8);
      if (i == 0) {
        linePath.moveTo(x, y);
      } else {
        linePath.lineTo(x, y);
      }
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_PinChartPainter old) =>
      old.values != values || old.kind != kind || old.color != color;
}

// ---------------------------------------------------------------------------
// layout.carousel -> PinCarousel
// ---------------------------------------------------------------------------

class PinCarousel extends StatefulWidget {
  const PinCarousel({
    required this.children,
    this.height = 220,
    this.viewportFraction = 0.9,
    super.key,
  });

  final List<Widget> children;
  final double height;
  final double viewportFraction;

  @override
  State<PinCarousel> createState() => _PinCarouselState();
}

class _PinCarouselState extends State<PinCarousel> {
  late final PageController _controller =
      PageController(viewportFraction: widget.viewportFraction);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    if (widget.children.isEmpty) return const SizedBox.shrink();
    return Column(
      children: <Widget>[
        SizedBox(
          height: widget.height,
          child: PageView(
            controller: _controller,
            onPageChanged: (i) => setState(() => _page = i),
            children: <Widget>[
              for (final child in widget.children)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: AgencySpacing.xs),
                  child: child,
                ),
            ],
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            for (var i = 0; i < widget.children.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                margin: const EdgeInsets.symmetric(horizontal: 2),
                width: i == _page ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color:
                      i == _page ? colors.actionPrimary : colors.borderDefault,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// layout.standard-grid -> PinResponsiveGrid
// ---------------------------------------------------------------------------

class PinResponsiveGrid extends StatelessWidget {
  const PinResponsiveGrid({
    required this.children,
    this.mobileColumns = 2,
    this.tabletColumns = 3,
    this.desktopColumns = 4,
    this.mainAxisExtent = 280,
    super.key,
  });

  final List<Widget> children;
  final int mobileColumns;
  final int tabletColumns;
  final int desktopColumns;
  final double mainAxisExtent;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900
            ? desktopColumns
            : constraints.maxWidth >= 600
                ? tabletColumns
                : mobileColumns;
        return GridView(
          primary: false,
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisExtent: mainAxisExtent,
            mainAxisSpacing: AgencySpacing.sm,
            crossAxisSpacing: AgencySpacing.sm,
          ),
          children: children,
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// layout.masonry -> PinMasonryGrid
// ---------------------------------------------------------------------------

class PinMasonryGrid extends StatelessWidget {
  const PinMasonryGrid({
    required this.children,
    this.columns = 2,
    this.spacing = AgencySpacing.sm,
    super.key,
  });

  final List<Widget> children;
  final int columns;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    final buckets = List<List<Widget>>.generate(columns, (_) => <Widget>[]);
    for (var i = 0; i < children.length; i++) {
      buckets[i % columns].add(children[i]);
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (var c = 0; c < columns; c++) ...<Widget>[
          if (c > 0) SizedBox(width: spacing),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                for (final child in buckets[c])
                  Padding(
                    padding: EdgeInsets.only(bottom: spacing),
                    child: child,
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// feedback.toast -> PinToast
// ---------------------------------------------------------------------------

enum PinToastTone { success, error, warning, info }

abstract final class PinToast {
  static void show(
    BuildContext context,
    String message, {
    PinToastTone tone = PinToastTone.info,
  }) {
    final colors = _colors(context);
    final (Color bg, IconData icon) = switch (tone) {
      PinToastTone.success => (colors.feedbackSuccess, Icons.check_circle_outline),
      PinToastTone.error => (colors.feedbackError, Icons.error_outline),
      PinToastTone.warning => (colors.feedbackWarning, Icons.warning_amber_outlined),
      PinToastTone.info => (colors.feedbackInfo, Icons.info_outline),
    };
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          backgroundColor: bg,
          content: Row(
            children: <Widget>[
              Icon(icon, color: colors.contentInverse, size: 18),
              const SizedBox(width: AgencySpacing.sm),
              Expanded(
                child: Text(message,
                    style: TextStyle(color: colors.contentInverse)),
              ),
            ],
          ),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// navigation.tabs -> PinTabs
// ---------------------------------------------------------------------------

class PinTabs extends StatelessWidget {
  const PinTabs({
    required this.tabs,
    required this.index,
    this.onChanged,
    super.key,
  });

  final List<String> tabs;
  final int index;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surfaceInteractive,
        borderRadius: BorderRadius.circular(AgencyRadius.md),
      ),
      child: Row(
        children: <Widget>[
          for (var i = 0; i < tabs.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: onChanged == null ? null : () => onChanged!(i),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: i == index ? colors.surfaceRaised : null,
                    borderRadius: BorderRadius.circular(AgencyRadius.sm),
                  ),
                  child: Text(
                    tabs[i],
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight:
                          i == index ? FontWeight.w600 : FontWeight.w400,
                      color: i == index
                          ? colors.contentPrimary
                          : colors.contentSecondary,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// overlay.dialog -> PinDialog
// ---------------------------------------------------------------------------

abstract final class PinDialog {
  static Future<bool?> confirm(
    BuildContext context, {
    required String title,
    String? message,
    String confirmLabel = 'Confirm',
    String cancelLabel = 'Cancel',
    bool destructive = false,
  }) {
    final colors = _colors(context);
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: message == null ? null : Text(message),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(cancelLabel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor:
                  destructive ? colors.feedbackError : colors.actionPrimary,
            ),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }

  static Future<T?> sheet<T>(BuildContext context, {required Widget child}) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(child: child),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// input.date-time -> PinDateTimeField
// ---------------------------------------------------------------------------

class PinDateTimeField extends StatelessWidget {
  const PinDateTimeField({
    required this.label,
    this.value,
    this.onChanged,
    super.key,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return InkWell(
      onTap: onChanged == null
          ? null
          : () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: value ?? now,
                firstDate: now,
                lastDate: DateTime(now.year + 2),
              );
              if (picked != null) onChanged!(picked);
            },
      borderRadius: BorderRadius.circular(AgencyRadius.md),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AgencyRadius.md)),
          prefixIcon: const Icon(Icons.event, size: 18),
        ),
        child: Text(
          value == null ? 'Select date' : '${value!.day}/${value!.month}/${value!.year}',
          style: TextStyle(
              color: value == null
                  ? colors.contentSecondary
                  : colors.contentPrimary),
        ),
      ),
    );
  }
}
