import 'models.dart';

/// Result of the reciprocal Bought Together read.
class BoughtTogether {
  const BoughtTogether({
    required this.pairId,
    required this.channel,
    required this.pairedAvailability,
    this.paired,
  });

  final String pairId;
  final String channel;
  final String pairedAvailability;
  final Product? paired;

  bool get isOutOfStock => pairedAvailability == 'out_of_stock';
  bool get hasPair => paired != null;

  factory BoughtTogether.fromJson(Map<String, dynamic> json) {
    final pairedJson = json['paired'] as Map<String, dynamic>?;
    return BoughtTogether(
      pairId: json['pair_id'] as String? ?? '',
      channel: json['channel'] as String? ?? 'b2c',
      pairedAvailability: json['paired_availability'] as String? ?? 'in_stock',
      paired: pairedJson == null ? null : Product.fromComposedJson(pairedJson),
    );
  }
}
