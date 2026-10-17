part of 'agency_flutter_ui.dart';

/// Paints the home header: vertical gradient, one soft cyan glow, and hairline wave lines.
///
/// The painter is static by design. There is no animation, so it is drawn once per layout inside a
/// [RepaintBoundary]; [shouldRepaint] only answers when the palette changes. The paint and path are
/// static, so a repaint allocates no per-frame objects.
class HomeHeaderBackdropPainter extends CustomPainter {
  const HomeHeaderBackdropPainter({required this.palette});

  final AgencyHomePalette palette;

  static const int waveCount = 8;

  /// Wave band as a fraction of the header. It starts below the title and icon row so a hairline can
  /// never cross the title, the bell or the action icons.
  static const double waveTopFraction = 0.50;
  static const double waveHeightFraction = 0.42;
  static const double waveRotationDegrees = 7;
  static const double waveStrokeWidth = 0.8;
  static const double waveGroupOpacity = 0.45;

  static final Paint _paint = Paint();
  static final Path _path = Path();

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;

    _paint
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: <Color>[
          palette.navy,
          palette.navyMid,
          palette.cobalt,
          palette.haze,
          palette.surface,
        ],
        stops: const <double>[0, 0.36, 0.60, 0.84, 1],
      ).createShader(bounds)
      ..style = PaintingStyle.fill;
    canvas.drawRect(bounds, _paint);

    final glowCenter = Offset(size.width - 20, -10);
    _paint.shader = ui.Gradient.radial(
      glowCenter,
      230,
      <Color>[
        palette.glow.withValues(alpha: 0.65),
        palette.glow.withValues(alpha: 0),
      ],
      const <double>[0, 1],
    );
    canvas.drawCircle(glowCenter, 230, _paint);

    _paintWaves(canvas, size);
  }

  void _paintWaves(Canvas canvas, Size size) {
    final band = Rect.fromLTWH(
      0,
      size.height * waveTopFraction,
      size.width,
      size.height * waveHeightFraction,
    );

    // The 45% group opacity is folded into each stop, so no offscreen layer is needed.
    _paint
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: <Color>[
          palette.line.withValues(alpha: 0.10 * waveGroupOpacity),
          palette.line.withValues(alpha: 0.70 * waveGroupOpacity),
          palette.cyanSoft.withValues(alpha: 0.95 * waveGroupOpacity),
          palette.line.withValues(alpha: 0.25 * waveGroupOpacity),
        ],
        stops: const <double>[0, 0.30, 0.65, 1],
      ).createShader(band)
      ..style = PaintingStyle.stroke
      ..strokeWidth = waveStrokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.save();
    final pivot = size.center(Offset.zero);
    canvas.translate(pivot.dx, pivot.dy);
    canvas.rotate(waveRotationDegrees * math.pi / 180);
    canvas.translate(-pivot.dx, -pivot.dy);

    final step = band.height / (waveCount + 1);
    for (var i = 0; i < waveCount; i++) {
      final y = band.top + step * (i + 1);
      final amplitude = 10.0 + (i % 3) * 4;
      _path
        ..reset()
        ..moveTo(-24, y)
        ..cubicTo(
          size.width * 0.28,
          y - amplitude,
          size.width * 0.55,
          y + amplitude,
          size.width + 24,
          y - amplitude * 0.4,
        );
      canvas.drawPath(_path, _paint);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(HomeHeaderBackdropPainter oldDelegate) =>
      oldDelegate.palette != palette;
}

/// Paints a home banner card: navy gradient, top-right cyan glow, six hairline waves on the right.
///
/// Same static contract as [HomeHeaderBackdropPainter]: one draw per layout, nothing per frame.
class HomeBannerBackdropPainter extends CustomPainter {
  const HomeBannerBackdropPainter({required this.palette});

  final AgencyHomePalette palette;

  static const int waveCount = 6;
  static const double waveGroupOpacity = 0.5;
  static const double waveRotationDegrees = 6;
  static const double waveStrokeWidth = 0.8;

  static final Paint _paint = Paint();
  static final Path _path = Path();

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;

    _paint
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[palette.navy, palette.cardEnd],
      ).createShader(bounds)
      ..style = PaintingStyle.fill;
    canvas.drawRect(bounds, _paint);

    final glowCenter = Offset(size.width, 0);
    _paint.shader = ui.Gradient.radial(
      glowCenter,
      150,
      <Color>[
        palette.glow.withValues(alpha: 0.55),
        palette.glow.withValues(alpha: 0),
      ],
      const <double>[0, 1],
    );
    canvas.drawCircle(glowCenter, 150, _paint);

    _paintWaves(canvas, size);
  }

  void _paintWaves(Canvas canvas, Size size) {
    final band = Rect.fromLTWH(
      size.width * 0.45,
      0,
      size.width * 0.55,
      size.height * 0.88,
    );

    _paint
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: <Color>[
          palette.line.withValues(alpha: 0.10 * waveGroupOpacity),
          palette.line.withValues(alpha: 0.70 * waveGroupOpacity),
          palette.cyanSoft.withValues(alpha: 0.95 * waveGroupOpacity),
          palette.line.withValues(alpha: 0.25 * waveGroupOpacity),
        ],
        stops: const <double>[0, 0.30, 0.65, 1],
      ).createShader(band)
      ..style = PaintingStyle.stroke
      ..strokeWidth = waveStrokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.save();
    final pivot = size.center(Offset.zero);
    canvas.translate(pivot.dx, pivot.dy);
    canvas.rotate(waveRotationDegrees * math.pi / 180);
    canvas.translate(-pivot.dx, -pivot.dy);

    final step = band.height / (waveCount + 1);
    for (var i = 0; i < waveCount; i++) {
      final y = band.top + step * (i + 1);
      final amplitude = 6.0 + (i % 2) * 3;
      _path
        ..reset()
        ..moveTo(band.left - 12, y)
        ..cubicTo(
          band.left + band.width * 0.30,
          y - amplitude,
          band.left + band.width * 0.62,
          y + amplitude,
          band.right + 12,
          y - amplitude * 0.5,
        );
      canvas.drawPath(_path, _paint);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(HomeBannerBackdropPainter oldDelegate) =>
      oldDelegate.palette != palette;
}
