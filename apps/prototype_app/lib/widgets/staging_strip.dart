import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

/// A thin, full-width environment marker for staging builds.
///
/// It replaces the Material corner [Banner]: a diagonal ribbon always covers a control (on the Home
/// screen it covered the cart), while a strip across the very top cannot sit on a tap target.
class StagingStrip extends StatelessWidget {
  const StagingStrip({this.height = 16, super.key});

  final double height;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).extension<AgencyHomePalette>();
    final alert = palette?.alert ?? Theme.of(context).colorScheme.error;
    return ExcludeSemantics(
      child: Material(
        color: alert,
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: Center(
            child: Text(
              'STAGING',
              style: TextStyle(
                fontSize: 10,
                height: 1,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.4,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
