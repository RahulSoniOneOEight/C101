import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/app_notification.dart';
import '../screens/account_screen.dart';
import '../screens/account_screens.dart';
import '../screens/b2b_home_screen.dart';
import '../screens/b2b_offers_screen.dart';
import '../screens/b2b_browse_screens.dart';
import '../screens/b2b_project_screens.dart';
import '../screens/b2b_quick_order_screen.dart';
import '../screens/b2b_procurement_lists_screen.dart';
import '../screens/b2b_quote_screens.dart';
import '../screens/b2b_shell.dart';
import '../screens/b2b_support_screens.dart';
import '../screens/b2c_flow_screens.dart';
import '../screens/cart_screen.dart';
import '../screens/checkout_screen.dart';
import '../screens/d2c_shell.dart';
import '../screens/notifications_screen.dart';
import '../screens/product_detail_screen.dart';
import '../screens/product_list_screen.dart';
import '../screens/quote_detail_screen.dart';
import '../screens/quote_list_screen.dart';

/// The app's route table, provided so it can be overridden in tests.
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/onboarding',
    routes: <RouteBase>[
      // ---------------------------------------------------------------------
      // D2C (consumer) shell — persistent 5-tab bottom navigation.
      // ---------------------------------------------------------------------
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            D2CShell(navigationShell: navigationShell),
        branches: <StatefulShellBranch>[
          // Home
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/',
                builder: (context, state) => const ProductListScreen(),
              ),
              GoRoute(
                path: '/product/:id',
                builder: (context, state) => ProductDetailScreen(
                    productId: state.pathParameters['id'] ?? ''),
              ),
              GoRoute(
                path: '/search',
                builder: (context, state) => const SearchScreen(),
              ),
              GoRoute(
                path: '/filter',
                builder: (context, state) => const FilterScreen(),
              ),
            ],
          ),
          // Browse
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/browse',
                builder: (context, state) => const BrowseScreen(),
              ),
            ],
          ),
          // Cart
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/cart',
                builder: (context, state) => const CartScreen(),
              ),
              GoRoute(
                path: '/checkout',
                builder: (context, state) => const CheckoutScreen(),
              ),
            ],
          ),
          // Account
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/account',
                builder: (context, state) => const AccountScreen(),
              ),
              GoRoute(
                path: '/wishlist',
                builder: (context, state) => const WishlistScreen(),
              ),
            ],
          ),
        ],
      ),
      // ---- D2C Orders (reached from Account; no dedicated bottom-nav tab) ----
      GoRoute(
        path: '/orders',
        builder: (context, state) => const D2COrdersScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (context, state) =>
            OrderDetailScreen(orderId: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/track',
        builder: (context, state) =>
            TrackPackageScreen(orderId: state.uri.queryParameters['order']),
      ),
      // ---------------------------------------------------------------------
      // Onboarding / auth (top-level, no bottom nav).
      // ---------------------------------------------------------------------
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/otp',
        builder: (context, state) => OtpScreen(
          isB2B: state.uri.queryParameters['mode'] == 'b2b',
        ),
      ),
      GoRoute(
        path: '/signup',
        builder: (context, state) => const SignUpScreen(),
      ),
      GoRoute(
        path: '/order-confirmed',
        builder: (context, state) => const OrderConfirmedScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => NotificationsScreen(
          audience: state.uri.queryParameters['audience'] == 'b2b'
              ? NotificationAudience.b2b
              : NotificationAudience.b2c,
        ),
      ),
      // ---- Account sub-journeys (consumer) ----
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/addresses',
        builder: (context, state) => const AddressesScreen(),
      ),
      GoRoute(
        path: '/payments',
        builder: (context, state) => const PaymentsScreen(),
      ),
      GoRoute(
        path: '/gst-invoices',
        builder: (context, state) => const GstInvoicesScreen(),
      ),
      GoRoute(
        path: '/help',
        builder: (context, state) => const HelpSupportScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      // ---------------------------------------------------------------------
      // B2B shell — 4-tab bottom navigation.
      // ---------------------------------------------------------------------
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            B2BShell(navigationShell: navigationShell),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/b2b',
                builder: (context, state) => const B2BHomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/b2b/credit',
                builder: (context, state) => const B2BCreditScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/b2b/orders',
                builder: (context, state) => const B2BOrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: '/b2b/account',
                builder: (context, state) => const B2BAccountScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/quotes',
        builder: (context, state) => const QuoteListScreen(),
      ),
      GoRoute(
        path: '/quotes/:id',
        builder: (context, state) =>
            QuoteDetailScreen(quoteId: state.pathParameters['id'] ?? ''),
      ),
      // ---- B2B Quick Order Center ----
      GoRoute(
        path: '/b2b/quick-order',
        builder: (context, state) => const B2BQuickOrderCenterScreen(),
      ),
      GoRoute(
        path: '/b2b/procurement-list/:id',
        builder: (context, state) => ProcurementListDetailScreen(
          listId: state.pathParameters['id'] ?? '',
        ),
      ),
      // ---- B2B Manage Lists (secondary journey) ----
      GoRoute(
        path: '/b2b/procurement-lists',
        builder: (context, state) => const ProcurementListsManagerScreen(),
      ),
      GoRoute(
        path: '/b2b/procurement-lists/new',
        builder: (context, state) => const ProcurementListEditorScreen(),
      ),
      GoRoute(
        path: '/b2b/procurement-lists/:id/edit',
        builder: (context, state) => ProcurementListEditorScreen(
          listId: state.pathParameters['id'],
        ),
      ),
      // ---- B2B catalogue, schemes & price advantage ----
      GoRoute(
        path: '/b2b/offers',
        builder: (context, state) => TradeOffersPage(
          initialCollectionId: state.uri.queryParameters['collection'],
        ),
      ),
      GoRoute(
        path: '/b2b/catalogue',
        builder: (context, state) => B2BCatalogueScreen(
          initialCategoryId: state.uri.queryParameters['category'],
          dealsOnly: state.uri.queryParameters['deals'] == 'true',
          seasonalOnly: state.uri.queryParameters['seasonal'] == 'true',
        ),
      ),
      GoRoute(
        path: '/b2b/schemes',
        builder: (context, state) => const B2BSchemesScreen(),
      ),
      GoRoute(
        path: '/b2b/price-advantage',
        builder: (context, state) => const B2BPriceAdvantageScreen(),
      ),
      // ---- B2B quote-to-order journey ----
      GoRoute(
        path: '/b2b/pdp/:id',
        builder: (context, state) =>
            B2BTradePdpScreen(productId: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/b2b/rfq',
        builder: (context, state) => const B2BRfqWorkspaceScreen(),
      ),
      GoRoute(
        path: '/b2b/create-rfq',
        builder: (context, state) => const B2BCreateRfqScreen(),
      ),
      GoRoute(
        path: '/b2b/quotes-received',
        builder: (context, state) => const B2BQuotesReceivedScreen(),
      ),
      GoRoute(
        path: '/b2b/quote-compare',
        builder: (context, state) => const B2BQuoteCompareScreen(),
      ),
      GoRoute(
        path: '/b2b/accept-quote',
        builder: (context, state) => const B2BAcceptQuoteScreen(),
      ),
      GoRoute(
        path: '/b2b/quotation-cart',
        builder: (context, state) => const B2BQuotationCartScreen(),
      ),
      GoRoute(
        path: '/b2b/checkout',
        builder: (context, state) => const B2BCheckoutScreen(),
      ),
      GoRoute(
        path: '/b2b/confirm',
        builder: (context, state) => const B2BConfirmOrderScreen(),
      ),
      // ---- B2B projects & sites ----
      GoRoute(
        path: '/b2b/projects',
        builder: (context, state) => const B2BProjectsListScreen(),
      ),
      GoRoute(
        path: '/b2b/projects/:id',
        builder: (context, state) => B2BProjectDetailScreen(
            projectName: state.pathParameters['id'] ?? 'Project'),
      ),
      GoRoute(
        path: '/b2b/material-list',
        builder: (context, state) => const B2BMaterialListScreen(),
      ),
      GoRoute(
        path: '/b2b/site-selector',
        builder: (context, state) => const B2BSiteSelectorScreen(),
      ),
      // ---- B2B support ----
      GoRoute(
        path: '/b2b/tracking',
        builder: (context, state) => const B2BSplitTrackingScreen(),
      ),
      GoRoute(
        path: '/b2b/chat',
        builder: (context, state) => const B2BBuyerSellerChatScreen(),
      ),
      GoRoute(
        path: '/b2b/gst-invoices',
        builder: (context, state) => const B2BGstInvoicesScreen(),
      ),
      GoRoute(
        path: '/b2b/team',
        builder: (context, state) => const B2BTeamRolesScreen(),
      ),
      GoRoute(
        path: '/b2b/approvals',
        builder: (context, state) => const B2BApprovalsScreen(),
      ),
    ],
  );
});
