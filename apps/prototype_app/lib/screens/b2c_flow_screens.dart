import 'package:agency_flutter_ui/agency_flutter_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';
import '../domain/order_models.dart';
import '../providers/cart_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/orders_providers.dart';
import '../providers/account_providers.dart';
import '../providers/pilot_providers.dart';
import '../widgets/status_views.dart';

AgencyColors _c(BuildContext c) =>
    Theme.of(c).extension<AgencyColors>() ?? AgencyColors.light;

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  static const List<(IconData, String, String)> _benefits =
      <(IconData, String, String)>[
    (
      Icons.local_shipping_outlined,
      'Delivery to your doorstep',
      'Convenient delivery for home and project needs.',
    ),
    (
      Icons.percent,
      'Better prices for every buyer',
      'Retail deals and exclusive B2B trade pricing.',
    ),
    (
      Icons.receipt_long_outlined,
      'Business buying made easy',
      'GST invoices, eligible credit and flexible payments.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.xl),
          child: Column(
            children: <Widget>[
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: <Widget>[
                      const SizedBox(height: AgencySpacing.lg),
                      Icon(Icons.storefront_outlined,
                          size: 64, color: colors.actionPrimary),
                      const SizedBox(height: AgencySpacing.lg),
                      Text('Everything you need, delivered to your site.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 24,
                              height: 1.25,
                              fontWeight: FontWeight.w700,
                              color: colors.contentPrimary)),
                      const SizedBox(height: AgencySpacing.sm),
                      Text(
                          'Shop for your home or business—from everyday '
                          'essentials to bulk building supplies.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 14,
                              height: 1.4,
                              color: colors.contentSecondary)),
                      const SizedBox(height: AgencySpacing.lg),
                      for (final b in _benefits)
                        _Benefit(icon: b.$1, title: b.$2, subtitle: b.$3),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AgencySpacing.md),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.go('/login'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(52),
                  ),
                  child: const Text('Get Started'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A single onboarding value proposition: icon + title + supporting line.
class _Benefit extends StatelessWidget {
  const _Benefit(
      {required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.surfaceInteractive,
              borderRadius: BorderRadius.circular(AgencyRadius.md),
            ),
            child: Icon(icon, size: 20, color: colors.actionPrimary),
          ),
          const SizedBox(width: AgencySpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(title,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colors.contentPrimary)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: colors.contentSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Login (two-mode: Consumer D2C / B2B Trade)
// ---------------------------------------------------------------------------

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _isB2B = false;
  bool _busy = false;
  final TextEditingController _identifierController = TextEditingController();

  @override
  void dispose() {
    _identifierController.dispose();
    super.dispose();
  }

  /// Accepts a pilot email or an India phone number (prefix +91 applied).
  String _identifier() {
    final text = _identifierController.text.trim();
    if (text.contains('@')) return text;
    return '+91$text';
  }

  Future<void> _requestOtp() async {
    final identifier = _identifier();
    setState(() => _busy = true);
    try {
      await ref.read(pilotOtpProvider.notifier).requestChallenge(identifier);
      if (mounted) context.go('/otp?mode=${_isB2B ? 'b2b' : 'b2c'}');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Login failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const SizedBox(height: AgencySpacing.lg),
              Center(
                child: Text('BuildKart',
                    style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: colors.actionPrimary)),
              ),
              const SizedBox(height: AgencySpacing.xl),
              SegmentedButton<bool>(
                segments: const <ButtonSegment<bool>>[
                  ButtonSegment(value: false, label: Text('Consumer D2C')),
                  ButtonSegment(value: true, label: Text('B2B Trade')),
                ],
                selected: <bool>{_isB2B},
                onSelectionChanged: (s) => setState(() => _isB2B = s.first),
              ),
              const SizedBox(height: AgencySpacing.lg),
              Text(_isB2B ? 'B2B Trade Portal Sign-In' : 'Welcome back',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: colors.contentPrimary)),
              const SizedBox(height: AgencySpacing.sm),
              Text(
                  _isB2B
                      ? 'Enter your phone to access wholesale pricing & credit.'
                      : 'Sign in to shop across 10 sellers.',
                  style:
                      TextStyle(fontSize: 13, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.lg),
              TextField(
                controller: _identifierController,
                decoration: InputDecoration(
                  hintText: 'Pilot email or 10-digit phone',
                  helperText:
                      'Only allowlisted staging identities can sign in.',
                  filled: true,
                  fillColor: colors.surfacePage,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AgencyRadius.md),
                    borderSide: BorderSide.none,
                  ),
                ),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: AgencySpacing.lg),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : _requestOtp,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: Text(_busy ? 'Sending…' : 'Get OTP'),
                ),
              ),
              if (_isB2B) ...<Widget>[
                const SizedBox(height: AgencySpacing.md),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Icon(Icons.lock_outline, size: 14, color: colors.trust),
                    const SizedBox(width: AgencySpacing.xs),
                    Text(
                        'No lengthy forms or extra details collected during login.',
                        style: TextStyle(
                            fontSize: 11, color: colors.contentSecondary)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// OTP verification
// ---------------------------------------------------------------------------

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({required this.isB2B, super.key});

  final bool isB2B;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final TextEditingController _codeController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(pilotOtpProvider.notifier)
          .verify(_codeController.text.trim());
      if (mounted) context.go(widget.isB2B ? '/b2b' : '/');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Verification failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: Padding(
        padding: const EdgeInsets.all(AgencySpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Enter the 6-digit code (pilot test code: 123456)',
                style: TextStyle(fontSize: 13, color: colors.contentSecondary)),
            const SizedBox(height: AgencySpacing.lg),
            TextField(
              controller: _codeController,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              style: TextStyle(fontSize: 22, letterSpacing: 8),
              decoration: InputDecoration(
                hintText: '••••••',
                filled: true,
                fillColor: colors.surfacePage,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AgencyRadius.md),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: AgencySpacing.md),
            Center(
              child: Text('Resend code in 00:28',
                  style:
                      TextStyle(fontSize: 12, color: colors.contentSecondary)),
            ),
            const SizedBox(height: AgencySpacing.lg),
            FilledButton(
              onPressed: _busy ? null : _verify,
              style: FilledButton.styleFrom(
                backgroundColor: colors.actionPrimary,
                minimumSize: const Size.fromHeight(48),
              ),
              child: Text(_busy ? 'Verifying…' : 'Verify'),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

class SignUpScreen extends StatelessWidget {
  const SignUpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Sign Up')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          _field(context, 'Full name', 'Rahul Sharma'),
          _field(context, 'Mobile number', '+91 98765 43210'),
          _field(context, 'Email (optional)', 'you@example.com'),
          _field(context, 'GSTIN (business, optional)', '27ABCDE1234F1Z5',
              helper: 'Enter a valid 15-digit GSTIN'),
          const SizedBox(height: AgencySpacing.lg),
          FilledButton(
            onPressed: () => context.push('/'),
            style: FilledButton.styleFrom(
              backgroundColor: colors.actionPrimary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Create Account'),
          ),
        ],
      ),
    );
  }

  Widget _field(BuildContext context, String label, String hint,
      {String? helper}) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.md),
      child: TextField(
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          filled: true,
          fillColor: colors.surfacePage,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AgencyRadius.md),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  static const List<String> _recent = <String>[
    'drill bit set',
    'ceramic floor tiles',
    'cpvc pipe 3/4',
  ];
  static const List<String> _popular = <String>[
    'Bathroom',
    'Tiles',
    'Electrical',
    'Agriculture',
    'Pumps',
    'Construction',
  ];

  final TextEditingController _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit(String value) => setState(() => _query = value);

  List<Product> _match(List<Product> products) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return const <Product>[];
    return products
        .where((p) =>
            p.title.toLowerCase().contains(q) ||
            (p.brand?.toLowerCase().contains(q) ?? false))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    final products = ref.watch(productsProvider).value ?? const <Product>[];
    final results = _match(products);
    final suggestions = products.take(6).toList();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: PinSearch(
          controller: _controller,
          autofocus: true,
          onChanged: _submit,
          onSubmitted: _submit,
          onFilterTap: () => context.push('/filter'),
        ),
      ),
      body: _query.trim().isEmpty
          ? _idle(context, colors)
          : results.isEmpty
              ? _noResults(context, colors, suggestions)
              : ListView(
                  padding: const EdgeInsets.all(AgencySpacing.md),
                  children: <Widget>[
                    for (final p in results) _productTile(context, colors, p),
                  ],
                ),
    );
  }

  Widget _idle(BuildContext context, AgencyColors colors) {
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        _sectionTitle(context, 'Recent searches'),
        for (final term in _recent)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.history, size: 18),
            title: Text(term,
                style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
            trailing: const Icon(Icons.close, size: 16),
            onTap: () {
              _controller.text = term;
              _submit(term);
            },
          ),
        const SizedBox(height: AgencySpacing.md),
        _sectionTitle(context, 'Popular categories'),
        _chips(context, _popular),
      ],
    );
  }

  /// Shown when a query yields nothing: suggested searches + a few products so
  /// the screen is never a dead end.
  Widget _noResults(
      BuildContext context, AgencyColors colors, List<Product> suggestions) {
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        Icon(Icons.search_off, color: colors.contentSecondary, size: 32),
        const SizedBox(height: AgencySpacing.sm),
        Center(
          child: Text('No matches for "$_query"',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
        ),
        const SizedBox(height: AgencySpacing.lg),
        _sectionTitle(context, 'Suggested searches'),
        _chips(context, const <String>[
          'Tiles',
          'Drill',
          'Pipe',
          'Paint',
          'LED',
          'Valve',
        ]),
        const SizedBox(height: AgencySpacing.lg),
        _sectionTitle(context, 'Popular products'),
        for (final p in suggestions) _productTile(context, colors, p),
      ],
    );
  }

  Widget _chips(BuildContext context, List<String> labels) {
    return Wrap(
      spacing: AgencySpacing.sm,
      runSpacing: AgencySpacing.sm,
      children: labels
          .map((c) => ActionChip(
                label: Text(c, style: const TextStyle(fontSize: 12)),
                onPressed: () {
                  _controller.text = c;
                  _submit(c);
                },
              ))
          .toList(),
    );
  }

  Widget _productTile(BuildContext context, AgencyColors colors, Product p) {
    final placeholder = Container(
      color: colors.surfacePage,
      child: Icon(Icons.image_outlined, size: 20, color: colors.contentSecondary),
    );
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(AgencyRadius.sm),
        child: SizedBox(
          width: 44,
          height: 44,
          child: p.thumbnail == null
              ? placeholder
              : Image.network(p.thumbnail!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => placeholder),
        ),
      ),
      title: Text(p.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
      subtitle: Text(p.brand ?? '',
          style: TextStyle(fontSize: 11, color: colors.contentSecondary)),
      trailing: Text(p.price?.formatted ?? '',
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: colors.actionPrimary)),
      onTap: () => context.push('/product/${p.id}'),
    );
  }

  Widget _sectionTitle(BuildContext context, String text) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.sm),
      child: Text(text,
          style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.contentPrimary)),
    );
  }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

class FilterScreen extends StatefulWidget {
  const FilterScreen({super.key});

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  final Set<String> _selected = <String>{};

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Filters'),
        actions: <Widget>[
          if (_selected.isNotEmpty)
            TextButton(
              onPressed: () => setState(_selected.clear),
              child: const Text('Clear'),
            ),
        ],
      ),
      body: Column(
        children: <Widget>[
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AgencySpacing.md),
              children: <Widget>[
                _filterSection(context, 'Category', const <String>[
                  'Bathroom & plumbing',
                  'Tiles & plywood',
                  'Electrical',
                  'Agriculture'
                ]),
                _filterSection(context, 'Price range',
                    const <String>['Under ₹500', '₹500 – ₹5,000', '₹5,000+']),
                _filterSection(
                    context, 'Rating', const <String>['4★ and above']),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.md),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => context.pop(_selected.toList()),
                style: FilledButton.styleFrom(
                  backgroundColor: colors.actionPrimary,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Apply Filters'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterSection(
      BuildContext context, String title, List<String> options) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AgencySpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.sm),
          for (final o in options)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _selected.contains(o),
              onChanged: (v) => setState(() {
                if (v ?? false) {
                  _selected.add(o);
                } else {
                  _selected.remove(o);
                }
              }),
              title: Text(o,
                  style: TextStyle(fontSize: 13, color: colors.contentPrimary)),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// D2C Orders
// ---------------------------------------------------------------------------

class D2COrdersScreen extends ConsumerWidget {
  const D2COrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    if (orders.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('My Orders')),
        body: const EmptyView(message: 'No orders yet'),
      );
    }
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('My Orders'),
          bottom: const TabBar(
            isScrollable: false,
            tabs: <Widget>[
              Tab(text: 'All'),
              Tab(text: 'Processing'),
              Tab(text: 'Shipped'),
              Tab(text: 'Delivered'),
            ],
          ),
        ),
        body: TabBarView(
          children: <Widget>[
            _OrderList(orders: orders),
            _OrderList(
                orders: orders
                    .where((o) => o.stage == OrderStage.processing)
                    .toList()),
            _OrderList(
                orders: orders
                    .where((o) => o.stage == OrderStage.shipped)
                    .toList()),
            _OrderList(
                orders: orders
                    .where((o) => o.stage == OrderStage.delivered)
                    .toList()),
          ],
        ),
      ),
    );
  }
}

class _OrderList extends StatelessWidget {
  const _OrderList({required this.orders});

  final List<CustomerOrder> orders;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return const EmptyView(message: 'No orders in this stage');
    }
    return ListView(
      padding: const EdgeInsets.all(AgencySpacing.md),
      children: <Widget>[
        for (final o in orders)
          PinOrderCard(
            orderRef: o.number.replaceFirst('Order #', ''),
            status: o.stage.label,
            meta: '${o.dateLabel} · ${o.itemCount} items',
            totalLabel: o.total.formatted,
            tone: switch (o.stage) {
              OrderStage.delivered => PinOrderTone.success,
              OrderStage.shipped => PinOrderTone.neutral,
              OrderStage.processing => PinOrderTone.warning,
              OrderStage.cancelled || OrderStage.returned => PinOrderTone.error,
            },
            actions: <Widget>[
              TextButton(
                onPressed: () => context.push('/orders/${o.id}'),
                child: const Text('Details'),
              ),
              if (o.stage == OrderStage.shipped)
                TextButton(
                  onPressed: () => context.push('/track?order=${o.id}'),
                  child: const Text('Track'),
                ),
            ],
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Track Package (timeline)
// ---------------------------------------------------------------------------

class TrackPackageScreen extends ConsumerWidget {
  const TrackPackageScreen({this.orderId, super.key});

  final String? orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final order = ref.watch(orderByIdProvider(orderId ?? ''));
    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Track Package')),
        body: const EmptyView(message: 'Order not found'),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Track Package')),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Text('${order.number}  ·  ${order.stage.label}',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
          const SizedBox(height: AgencySpacing.lg),
          for (var i = 0; i < order.timeline.length; i++)
            _step(
              context,
              order.timeline[i].label,
              order.timeline[i].timeLabel,
              done: order.timeline[i].done,
              active: order.timeline[i].active,
              last: i == order.timeline.length - 1,
            ),
        ],
      ),
    );
  }

  Widget _step(BuildContext context, String label, String time,
      {bool done = false, bool active = false, bool last = false}) {
    final colors = _c(context);
    final color = active
        ? colors.actionPrimary
        : done
            ? colors.feedbackSuccess
            : colors.borderStrong;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Column(
          children: <Widget>[
            Icon(done ? Icons.check_circle : Icons.circle_outlined,
                size: 18, color: color),
            if (!last)
              Container(
                  width: 2,
                  height: 36,
                  color: active ? colors.actionPrimary : colors.borderStrong),
          ],
        ),
        const SizedBox(width: AgencySpacing.md),
        Padding(
          padding: const EdgeInsets.only(bottom: AgencySpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight:
                          active || done ? FontWeight.w600 : FontWeight.w400,
                      color: colors.contentPrimary)),
              Text(time,
                  style:
                      TextStyle(fontSize: 11, color: colors.contentSecondary)),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// D2C Order detail
// ---------------------------------------------------------------------------

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({required this.orderId, super.key});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    final order = ref.watch(orderByIdProvider(orderId));
    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Order')),
        body: const EmptyView(message: 'Order not found'),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(order.number)),
      body: ListView(
        padding: const EdgeInsets.all(AgencySpacing.md),
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(order.dateLabel,
                        style: TextStyle(
                            fontSize: 12, color: colors.contentSecondary)),
                    const SizedBox(height: 2),
                    Text(order.stage.label,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                  ],
                ),
              ),
              if (order.stage == OrderStage.shipped)
                TextButton(
                  onPressed: () => context.push('/track?order=${order.id}'),
                  child: const Text('Track'),
                ),
            ],
          ),
          const SizedBox(height: AgencySpacing.md),
          _section(context, 'Items'),
          for (final line in order.lines) _line(context, line),
          const SizedBox(height: AgencySpacing.md),
          _section(context, 'Delivery address'),
          Text(order.addressLabel,
              style: TextStyle(
                  fontSize: 12, height: 1.4, color: colors.contentSecondary)),
          const SizedBox(height: AgencySpacing.md),
          _section(context, 'Payment summary'),
          _row(context, 'Items total', order.total.formatted),
          _row(context, 'Shipping', 'Free'),
          const Divider(),
          _row(context, 'Total paid', order.total.formatted, bold: true),
          const SizedBox(height: AgencySpacing.lg),
          if (order.cancelEligible)
            PinWorkflowAction(
              label: 'Cancel order',
              hierarchy: PinWorkflowHierarchy.destructive,
              onPressed: () => _cancel(context, ref, order),
            ),
          if (order.returnEligible) ...<Widget>[
            const SizedBox(height: AgencySpacing.sm),
            PinWorkflowAction(
              label: 'Return / Replace',
              hierarchy: PinWorkflowHierarchy.secondary,
              onPressed: () => _return(context, ref, order),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _cancel(
      BuildContext context, WidgetRef ref, CustomerOrder order) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Cancel this order?',
      message:
          'Order ${order.number} will be cancelled. This cannot be undone.',
      confirmLabel: 'Cancel order',
      destructive: true,
    );
    if (!(ok ?? false) || !context.mounted) return;
    ref.read(ordersProvider.notifier).cancel(order.id);
    PinToast.show(context, 'Order cancelled', tone: PinToastTone.info);
  }

  Future<void> _return(
      BuildContext context, WidgetRef ref, CustomerOrder order) async {
    final ok = await PinDialog.confirm(
      context,
      title: 'Request a return?',
      message:
          'We will arrange a pickup for ${order.number}. Refunds are issued to '
          'the original payment method after inspection.',
      confirmLabel: 'Request return',
    );
    if (!(ok ?? false) || !context.mounted) return;
    ref.read(ordersProvider.notifier).requestReturn(order.id);
    PinToast.show(context, 'Return requested', tone: PinToastTone.success);
  }

  Widget _section(BuildContext context, String title) => Padding(
        padding: const EdgeInsets.only(bottom: AgencySpacing.xs),
        child: Text(title,
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: _c(context).contentPrimary)),
      );

  Widget _line(BuildContext context, OrderLine line) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AgencySpacing.xs),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('${line.title}  ×${line.quantity}',
                    style:
                        TextStyle(fontSize: 13, color: colors.contentPrimary)),
                if (line.brand != null)
                  Text(line.brand!,
                      style: TextStyle(
                          fontSize: 11, color: colors.contentSecondary)),
              ],
            ),
          ),
          Text(line.lineTotal.formatted,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.contentPrimary)),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value,
      {bool bold = false}) {
    final colors = _c(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: bold ? 14 : 12,
                    fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                    color: colors.contentSecondary)),
          ),
          Text(value,
              style: TextStyle(
                  fontSize: bold ? 15 : 13,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                  color: bold ? colors.actionPrimary : colors.contentPrimary)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ids = ref.watch(wishlistProvider);
    final products = ref.watch(productsProvider).value ?? const <Product>[];
    final items = <Product>[
      for (final id in ids) ...products.where((p) => p.id == id),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Wishlist')),
      body: items.isEmpty
          ? const EmptyView(message: 'Your wishlist is empty')
          : GridView.builder(
              padding: const EdgeInsets.all(AgencySpacing.md),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AgencySpacing.sm,
                crossAxisSpacing: AgencySpacing.sm,
                mainAxisExtent: 292,
              ),
              itemCount: items.length,
              itemBuilder: (context, i) => _WishlistTile(product: items[i]),
            ),
    );
  }
}

class _WishlistTile extends ConsumerWidget {
  const _WishlistTile({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = _c(context);
    return Container(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(AgencyRadius.lg),
        border: Border.all(color: colors.borderDefault),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          InkWell(
            onTap: () => context.push('/product/${product.id}'),
            child: Stack(
              children: <Widget>[
                Container(
                  height: 132,
                  width: double.infinity,
                  color: colors.surfacePage,
                  child: product.thumbnail == null
                      ? Icon(Icons.image_outlined,
                          color: colors.contentSecondary)
                      : Image.network(product.thumbnail!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Icon(
                              Icons.image_outlined,
                              color: colors.contentSecondary)),
                ),
                Positioned(
                  top: 4,
                  right: 4,
                  child: IconButton(
                    tooltip: 'Remove from wishlist',
                    onPressed: () {
                      ref.read(wishlistProvider.notifier).remove(product.id);
                      PinToast.show(context, 'Removed from wishlist',
                          tone: PinToastTone.info);
                    },
                    icon:
                        Icon(Icons.favorite, size: 18, color: colors.promotion),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AgencySpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (product.brand != null)
                  Text(product.brand!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10, color: colors.contentSecondary)),
                const SizedBox(height: 2),
                InkWell(
                  onTap: () => context.push('/product/${product.id}'),
                  child: SizedBox(
                    height: 34,
                    child: Text(product.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            height: 1.3,
                            fontWeight: FontWeight.w600,
                            color: colors.contentPrimary)),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    Text(product.price?.formatted ?? '',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: colors.contentPrimary)),
                    const SizedBox(width: 4),
                    if (product.mrp != null)
                      Flexible(
                        child: Text(product.mrp!.formatted,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 10,
                                color: colors.contentSecondary,
                                decoration: TextDecoration.lineThrough)),
                      ),
                  ],
                ),
                const SizedBox(height: AgencySpacing.sm),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () async {
                      await ref.read(cartProvider.notifier).addItem(
                          offerId: product.offerId ?? '',
                          variantId: product.variantId ?? product.id,
                          quantity: 1);
                      if (context.mounted) {
                        PinToast.show(context, 'Added to cart',
                            tone: PinToastTone.success);
                      }
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.actionPrimary,
                      minimumSize: const Size.fromHeight(32),
                      padding: EdgeInsets.zero,
                    ),
                    child: const Text('Add to Cart',
                        style: TextStyle(fontSize: 11)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Order confirmed (D2C)
// ---------------------------------------------------------------------------

/// Post-checkout confirmation. Reached after the cart is cleared, so it must
/// not depend on cart state.
class OrderConfirmedScreen extends StatelessWidget {
  const OrderConfirmedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = _c(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AgencySpacing.lg),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: colors.trust.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check_circle_outline,
                    size: 44, color: colors.trust),
              ),
              const SizedBox(height: AgencySpacing.lg),
              Text('Order Confirmed',
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: colors.contentPrimary)),
              const SizedBox(height: AgencySpacing.sm),
              Text('Order placed successfully',
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(fontSize: 14, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.xs),
              Text('Payment confirmed · GST invoice will be issued',
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(fontSize: 12, color: colors.contentSecondary)),
              const SizedBox(height: AgencySpacing.xl),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.go('/orders'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.actionPrimary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('View my orders'),
                ),
              ),
              const SizedBox(height: AgencySpacing.sm),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => context.go('/'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    side: BorderSide(color: colors.borderDefault),
                  ),
                  child: Text('Continue shopping',
                      style: TextStyle(color: colors.actionPrimary)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
