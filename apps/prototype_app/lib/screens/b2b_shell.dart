import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/b2b_trade_models.dart';
import '../domain/models.dart';
import '../providers/b2b_support_providers.dart';
import '../providers/b2b_trade_providers.dart';

/// Host scaffold for the B2B section: owns the persistent bottom navigation
/// and delegates content to the active branch of the [StatefulNavigationShell].
class B2BShell extends StatelessWidget {
  const B2BShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: AppBottomNavigation(
        items: const <BottomNavItem>[
          BottomNavItem(label: 'Trade', icon: Icons.storefront_outlined),
          BottomNavItem(label: 'Credit', icon: Icons.credit_card_outlined),
          BottomNavItem(label: 'Cart', icon: Icons.shopping_cart_outlined),
          BottomNavItem(label: 'Account', icon: Icons.person_outline),
        ],
        currentIndex: navigationShell.currentIndex,
        onSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

AgencyColors _colors(BuildContext context) =>
    Theme.of(context).extension<AgencyColors>() ?? AgencyColors.light;

Widget _sectionLabel(BuildContext context, String text) {
  final colors = _colors(context);
  return Padding(
    padding: const EdgeInsets.fromLTRB(
        AgencySpacing.md, AgencySpacing.lg, AgencySpacing.md, AgencySpacing.sm),
    child: Text(text,
        style: TextStyle(
            fontSize: 16,
            color: colors.contentPrimary,
            fontWeight: FontWeight.w600)),
  );
}

Widget _statusBadge(BuildContext context, String label, Color color) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(label,
        style:
            TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
  );
}

// ---------------------------------------------------------------------------
// B2B Credit
// ---------------------------------------------------------------------------

class B2BCreditScreen extends ConsumerStatefulWidget {
  const B2BCreditScreen({super.key});

  @override
  ConsumerState<B2BCreditScreen> createState() => _B2BCreditScreenState();
}

class _B2BCreditScreenState extends ConsumerState<B2BCreditScreen> {
  int _tab = 0;
  final TextEditingController _requestedLimit = TextEditingController();

  @override
  void dispose() {
    _requestedLimit.dispose();
    super.dispose();
  }

  Future<void> _requestIncrease() async {
    final amount = _requestedLimit.text.trim();
    final label = amount.isEmpty ? '₹3,00,000' : amount;
    await ref.read(approvalItemsProvider.notifier).addPending(
          ref: 'Credit limit · $label',
          amountLabel: label,
        );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
          content: Text('Credit-limit increase requested — pending approval')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Credit Account')),
      body: Column(
        children: <Widget>[
          _header(context),
          _tabs(context),
          Expanded(
            child: switch (_tab) {
              0 => _dashboard(context),
              1 => _invoices(context),
              2 => _payNow(context),
              _ => _limit(context),
            },
          ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(AgencySpacing.md, AgencySpacing.md,
          AgencySpacing.md, AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text("Rajesh Enterprise's Trade Enterprise",
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: colors.contentPrimary)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text('AVAILABLE',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: colors.contentSecondary)),
              Text('₹1.72L',
                  style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: colors.trust)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tabs(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
      child: Row(
        children: <Widget>[
          _CreditTab(
              label: 'Dashboard',
              active: _tab == 0,
              onTap: () => setState(() => _tab = 0)),
          _CreditTab(
              label: 'Invoices',
              active: _tab == 1,
              onTap: () => setState(() => _tab = 1)),
          _CreditTab(
              label: 'Pay Now',
              active: _tab == 2,
              onTap: () => setState(() => _tab = 2)),
          _CreditTab(
              label: 'Limit',
              active: _tab == 3,
              onTap: () => setState(() => _tab = 3)),
        ],
      ),
    );
  }

  Widget _dashboard(BuildContext context) {
    final colors = _colors(context);
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        const PinCreditLimit(
          availableLabel: '₹1.72L',
          limitLabel: 'Sanctioned ₹2L · Utilized ₹28,450',
          health: PinCreditHealth.available,
          usedFraction: 0.14,
        ),
        const SizedBox(height: AgencySpacing.md),
        const PinChart(
          kind: PinChartKind.bar,
          values: <double>[124000, 51100, 8600],
          height: 140,
        ),
        const SizedBox(height: AgencySpacing.md),
        Text('CREDIT SUMMARY',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: colors.contentSecondary)),
        const SizedBox(height: AgencySpacing.sm),
        Row(
          children: <Widget>[
            _summaryStat(context, 'Sanctioned', '₹2L', colors.contentPrimary),
            _summaryStat(context, 'Utilized', '₹28,450', colors.contentPrimary),
            _summaryStat(context, 'Available', '₹1.72L', colors.trust),
          ],
        ),
        const SizedBox(height: AgencySpacing.md),
        Row(
          children: <Widget>[
            Text('Overdue',
                style: TextStyle(fontSize: 12, color: colors.feedbackError)),
            const SizedBox(width: AgencySpacing.sm),
            Text('₹59,700',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.feedbackError)),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: 0.14,
            minHeight: 8,
            backgroundColor: colors.surfaceInteractive,
            color: colors.actionPrimary,
          ),
        ),
        const SizedBox(height: AgencySpacing.xs),
        Align(
          alignment: Alignment.centerRight,
          child: Text('14% used',
              style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
        ),
        const SizedBox(height: AgencySpacing.lg),
        _sectionLabel(context, 'CREDIT HEALTH'),
        Row(
          children: <Widget>[
            Expanded(
              child: CreditMetricCard(
                  label: 'AVG. DAYS DUE',
                  value: '18 days',
                  detail: '↓ 6 vs last mo',
                  detailColor: colors.trust),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: CreditMetricCard(
                  label: 'NEXT DUE',
                  value: '15 Sep',
                  detail: '₹75,000 · INV-2024'),
            ),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        Row(
          children: <Widget>[
            Expanded(
              child: CreditMetricCard(
                  label: 'OVERDUE',
                  value: '₹59,700',
                  detail: '3 invoices',
                  valueColor: colors.feedbackError,
                  detailColor: colors.feedbackError),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: CreditMetricCard(
                  label: 'TOTAL INVOICES', value: '5', detail: '₹1.83L total'),
            ),
          ],
        ),
        const SizedBox(height: AgencySpacing.lg),
        _sectionLabel(context, 'AGEING SUMMARY'),
        _AgeingRow(
            bucket: '0–30 days',
            amount: '₹1.24L',
            count: '2 inv',
            fraction: 1.0,
            color: colors.actionPrimary),
        _AgeingRow(
            bucket: '31–60 days',
            amount: '₹51,100',
            count: '2 inv',
            fraction: 0.58,
            color: colors.actionPrimary),
        _AgeingRow(
            bucket: '61+ days',
            amount: '₹8,600',
            count: '1 inv',
            fraction: 0.12,
            color: colors.feedbackError),
        const SizedBox(height: AgencySpacing.lg),
        _sectionLabel(context, 'CREDIT ACTIONS'),
        Row(
          children: <Widget>[
            Expanded(
              child: CreditActionCard(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Pay Outstanding',
                  subtitle: '₹1.83L due',
                  accent: colors.actionPrimary,
                  onTap: () => setState(() => _tab = 2)),
            ),
            const SizedBox(width: AgencySpacing.sm),
            Expanded(
              child: CreditActionCard(
                  icon: Icons.trending_up,
                  title: 'Limit Increase',
                  subtitle: '₹2L sanctioned',
                  accent: colors.actionPrimary,
                  onTap: () => setState(() => _tab = 3)),
            ),
          ],
        ),
        const SizedBox(height: AgencySpacing.sm),
        Row(
          children: <Widget>[
            Expanded(
              child: CreditActionCard(
                  icon: Icons.receipt_long_outlined,
                  title: 'Transaction History',
                  subtitle: 'Credits/paymts',
                  accent: colors.actionPrimary,
                  onTap: () => context.push('/b2b/gst-invoices')),
            ),
            const SizedBox(width: AgencySpacing.sm),
            const Expanded(child: SizedBox()),
          ],
        ),
      ],
    );
  }

  Widget _invoices(BuildContext context) {
    final colors = _colors(context);
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        _invoiceTile(context, 'INV-9921', '₹48,900', 'Due 30 Sep',
            colors.feedbackWarning),
        _invoiceTile(
            context, 'INV-9904', '₹96,300', 'Overdue', colors.feedbackError),
        _invoiceTile(
            context, 'INV-9877', '₹12,450', 'Paid', colors.feedbackSuccess),
      ],
    );
  }

  Widget _payNow(BuildContext context) {
    final colors = _colors(context);
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        _paymentMethod(context, 'On credit (30 days)', '₹0 today',
            selected: true),
        _paymentMethod(context, 'UPI', 'Pay now'),
        _paymentMethod(context, 'Bank transfer', 'Pay now'),
        _paymentMethod(context, 'Cash on delivery', 'Pay on delivery'),
        const SizedBox(height: AgencySpacing.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => context.push('/b2b/checkout'),
            style: FilledButton.styleFrom(
              backgroundColor: colors.actionPrimary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Continue'),
          ),
        ),
      ],
    );
  }

  Widget _limit(BuildContext context) {
    final colors = _colors(context);
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(AgencySpacing.md),
          decoration: BoxDecoration(
            color: colors.surfaceInteractive,
            borderRadius: BorderRadius.circular(AgencyRadius.lg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Current limit',
                  style:
                      TextStyle(fontSize: 12, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.xs),
              Text('₹2L sanctioned',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
            ],
          ),
        ),
        const SizedBox(height: AgencySpacing.lg),
        TextField(
          controller: _requestedLimit,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Requested limit',
            hintText: '₹3,00,000',
            filled: true,
            fillColor: colors.surfacePage,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AgencyRadius.md),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: AgencySpacing.sm),
        TextField(
          decoration: InputDecoration(
            labelText: 'Reason (optional)',
            hintText: 'Seasonal demand',
            filled: true,
            fillColor: colors.surfacePage,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AgencyRadius.md),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: AgencySpacing.lg),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _requestIncrease,
            style: FilledButton.styleFrom(
              backgroundColor: colors.actionPrimary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Request Increase'),
          ),
        ),
      ],
    );
  }

  Widget _summaryStat(
      BuildContext context, String label, String value, Color color) {
    final colors = _colors(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style: TextStyle(fontSize: 10, color: colors.contentSecondary)),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }

  Widget _invoiceTile(BuildContext context, String ref, String amount,
      String status, Color color) {
    final colors = _colors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AgencySpacing.sm),
      padding: const EdgeInsets.all(AgencySpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.description_outlined, color: colors.actionPrimary),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(ref,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                Text('GST invoice',
                    style: TextStyle(
                        fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text(amount,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary)),
              const SizedBox(height: 2),
              _statusBadge(context, status, color),
            ],
          ),
        ],
      ),
    );
  }

  Widget _paymentMethod(BuildContext context, String title, String action,
      {bool selected = false}) {
    final colors = _colors(context);
    return Container(
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
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off,
              size: 20,
              color: selected ? colors.actionPrimary : colors.contentSecondary),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Text(title,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: colors.contentPrimary)),
          ),
          Text(action,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: colors.actionPrimary)),
        ],
      ),
    );
  }
}

class _CreditTab extends StatelessWidget {
  const _CreditTab({required this.label, required this.active, this.onTap});

  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? colors.actionPrimary : colors.surfaceRaised,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color:
                      active ? colors.contentInverse : colors.contentPrimary)),
        ),
      ),
    );
  }
}

class _AgeingRow extends StatelessWidget {
  const _AgeingRow({
    required this.bucket,
    required this.amount,
    required this.count,
    required this.fraction,
    required this.color,
  });

  final String bucket;
  final String amount;
  final String count;
  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(bucket,
                  style: TextStyle(fontSize: 11, color: colors.contentPrimary)),
              const Spacer(),
              Text(amount,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
              const SizedBox(width: AgencySpacing.md),
              SizedBox(
                width: 40,
                child: Text(count,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: 10, color: colors.contentSecondary)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 8,
              backgroundColor: colors.surfaceInteractive,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Orders
// ---------------------------------------------------------------------------

class B2BOrdersScreen extends ConsumerWidget {
  const B2BOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = <B2BOrder>[
      ...ref.watch(tradeDashboardProvider).repeatOrders,
      const B2BOrder(
        reference: 'Order #PO-3350',
        dateLabel: '12 Sep',
        itemSummary: '11 items',
        total: Money(amount: 6410000, currencyCode: 'INR'),
      ),
    ];
    const statuses = <(String, PinOrderTone)>[
      ('Delivered', PinOrderTone.success),
      ('Shipped', PinOrderTone.neutral),
      ('Processing', PinOrderTone.warning),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Order History')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          for (var i = 0; i < orders.length; i++)
            PinOrderCard(
              orderRef: orders[i].reference.replaceFirst('Order #', ''),
              status: statuses[i % statuses.length].$1,
              tone: statuses[i % statuses.length].$2,
              meta: orders[i].itemSummary,
              totalLabel: orders[i].total.formatted,
              actions: <Widget>[
                PinReorderAction(
                  onPressed: () {
                    ref
                        .read(b2bQuotationCartProvider.notifier)
                        .addRepeatOrder(orders[i]);
                    context.push('/b2b/quotation-cart');
                  },
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => context.push('/b2b/tracking'),
                  child: const Text('Track'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Account
// ---------------------------------------------------------------------------

class B2BAccountScreen extends StatelessWidget {
  const B2BAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Business Account')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AgencySpacing.md),
            child: Container(
              padding: const EdgeInsets.all(AgencySpacing.md),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: BorderRadius.circular(AgencyRadius.lg),
                border: Border.all(color: colors.borderDefault),
              ),
              child: Row(
                children: <Widget>[
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: colors.surfaceInteractive,
                    child: Icon(Icons.storefront_outlined,
                        color: colors.actionPrimary),
                  ),
                  const SizedBox(width: AgencySpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('BuildPro Traders Pvt Ltd',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: colors.contentPrimary)),
                        const SizedBox(height: 2),
                        Text('GSTIN 27ABCDE1234F1Z5',
                            style: TextStyle(
                                fontSize: 11, color: colors.contentSecondary)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          _sectionLabel(context, 'Account'),
          for (final item in const <(IconData, String, String)>[
            (Icons.group_outlined, 'Team & Roles', '/b2b/team'),
            (Icons.credit_card_outlined, 'Credit Overview', '/b2b/credit'),
            (
              Icons.percent_outlined,
              'My Price Advantage',
              '/b2b/price-advantage'
            ),
            (Icons.note_add_outlined, 'RFQ Basket', '/b2b/rfq'),
            (Icons.location_city_outlined, 'Projects & Sites', '/b2b/projects'),
            (Icons.description_outlined, 'GST Invoices', '/b2b/gst-invoices'),
            (Icons.receipt_long_outlined, 'Order History', '/b2b/orders'),
            (Icons.fact_check_outlined, 'Approvals', '/b2b/approvals'),
          ])
            ListTile(
              leading: Icon(item.$1, color: colors.actionPrimary),
              title: Text(item.$2,
                  style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => _openAccountRoute(context, item.$3),
            ),
          const Divider(height: AgencySpacing.xl),
          ListTile(
            leading:
                const Icon(Icons.storefront_outlined, color: Color(0xFF66708A)),
            title: Text('Switch to consumer',
                style: TextStyle(fontSize: 13, color: colors.contentSecondary)),
            trailing: const Icon(Icons.swap_horiz, size: 18),
            onTap: () => context.go('/'),
          ),
        ],
      ),
    );
  }

  /// Branch routes belong to the B2B [StatefulShellRoute]; navigating to them
  /// with `go` switches the shell tab, while leaf routes are pushed.
  void _openAccountRoute(BuildContext context, String route) {
    const branchRoutes = <String>{
      '/b2b',
      '/b2b/credit',
      '/b2b/orders',
      '/b2b/account',
    };
    if (branchRoutes.contains(route)) {
      context.go(route);
    } else {
      context.push(route);
    }
  }
}
