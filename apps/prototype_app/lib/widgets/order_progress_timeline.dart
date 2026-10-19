import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';

import '../domain/order_models.dart';

/// Shared, semantic order progress timeline used by order detail and tracking.
class OrderProgressTimeline extends StatelessWidget {
  const OrderProgressTimeline({
    required this.events,
    this.compact = false,
    super.key,
  });

  final List<OrderEvent> events;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        for (var index = 0; index < events.length; index++)
          _step(
            context,
            events[index],
            last: index == events.length - 1,
          ),
      ],
    );
  }

  Widget _step(BuildContext context, OrderEvent event, {required bool last}) {
    final colors =
        Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;
    final color = event.active
        ? colors.actionPrimary
        : event.done
            ? colors.feedbackSuccess
            : colors.borderStrong;
    final semantics = event.active
        ? '${event.label}, current, ${event.timeLabel}'
        : event.done
            ? '${event.label}, complete, ${event.timeLabel}'
            : '${event.label}, pending, ${event.timeLabel}';
    return Semantics(
      label: semantics,
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Column(
            children: <Widget>[
              Icon(
                event.done ? Icons.check_circle : Icons.circle_outlined,
                size: 20,
                color: color,
              ),
              if (!last)
                Container(
                  width: 2,
                  height: compact ? 24 : 34,
                  color:
                      event.done ? colors.feedbackSuccess : colors.borderStrong,
                ),
            ],
          ),
          const SizedBox(width: AgencySpacing.sm),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                  bottom: compact ? AgencySpacing.sm : AgencySpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(event.label,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: event.active || event.done
                              ? FontWeight.w600
                              : FontWeight.w400,
                          color: colors.contentPrimary)),
                  Text(event.timeLabel,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
