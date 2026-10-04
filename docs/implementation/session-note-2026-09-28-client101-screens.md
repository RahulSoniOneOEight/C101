# Session Note — client101 B2C + B2B screens, interactions & polish

> Date: 2026-09-28 · **File: Client101** (Penpot) · ID `40e06342-8830-80d6-8008-9a92fdfb6804`
> Theme: indigo · Page: `Screens` · Bands: **B2C** (customer app) and **B2B** (business buying)

This note records the B2C and B2B screen builds, their interaction maps, and the B2C polish pass for
the client101 surfaces. All work is **Penpot-only** (no repository artifacts changed).

---

## 1. Screens built (30 new; 35 total on the Screens page)

Existing before this session: Home, Login, Product Detail, Cart, Checkout.

| Group | New screens |
|---|---|
| 1 `browse-to-buy` | Confirm Order |
| 2 `search-to-buy` | Search, Search Input, Filter, Search Result |
| 3 `order-tracking` | Orders, Track Package |
| 4 `return-refund` | Refund Reasons, Orders Returned |
| 5 account/support | Account, Wishlist, Side Menu, Messages, Message, Help, Activity |
| 6 auth | Splash, Onboarding, Mobile, OTP, Sign Up, Terms |
| extras | Cover, Cart Empty, Checkout Details, Product Variant, Product Gallery, Store Front, Products, Store Profile |

**Approach:** reused existing Client101 blocks (top-bar, order-summary, place-order CTA, bottom-nav,
ProductCard tiles) + indigo tokens; icons via Phosphor; 4px grid; 16px margins, 343px content.

## 2. Arrangement

The `Screens` page is split into two labelled bands: **B2C** (`B2C — Customer app (mobile)`, y≈12000)
and **B2B** (`B2B — Business buying…`, y≈20080), so customer and business screens are visually separated.

B2C: all 35 screens in a **journey-ordered grid** — 6 columns at x = 0/470/940/1410/1880/2350, with
**variable row heights** (row pitch = tallest screen in the row + 100) so tall screens (Home 2097,
Product Detail 1327, Cart 942) do not collide. `Cover` is placed in an empty 7th column (x=2820) to
avoid a positional quirk.

| Row | y | Screens |
|---|---|---|
| 1 | 12000 | Cover, Splash, Onboarding, Login, Sign Up, Terms |
| 2 | 12912 | OTP, Mobile, Home, Store Front, Products, Store Profile |
| 3 | 15109 | Search, Search Input, Filter, Search Result, Product Detail, Product Variant |
| 4 | 16536 | Product Gallery, Cart, Cart Empty, Checkout, Checkout Details, Confirm Order |
| 5 | 17578 | Orders, Track Package, Refund Reasons, Orders Returned, Wishlist, Account |
| 6 | 18490 | Activity, Messages, Message, Help, Side Menu |

**Overlaps: 0** (verified geometrically).

## 3. Interaction map (23 links)

| Journey | Links |
|---|---|
| Auth | Splash *(after-delay 1.5s)* → Onboarding; Onboarding → Login; Login → Home; Mobile → OTP; OTP → Home; Sign Up → OTP; Terms → Home |
| browse-to-buy | Home tile → Product Detail → Cart → Checkout; Checkout CTA → Confirm Order; Confirm Order → Home |
| search-to-buy | Search → Search Result; Search Result tile → Product Detail |
| order-tracking | Orders → Track Package ⇄ Orders |
| return-refund | Refund Reasons → Orders Returned |
| extras | Cart Empty → Home; Checkout Details → Checkout; Account → Orders; Products → Product Detail; Store Front → Product Detail |

Transitions: **slide** (left/right, 300ms, ease-in-out). Splash uses **after-delay**.
Note: Penpot's *dissolve* animation failed plugin validation, so all transitions are slide.
Some links use **board-level** click navigation as the reliable target.

## 4. Polish pass

| Screen | Change |
|---|---|
| **Cover** | Rebuilt: BK logo mark, hierarchy (BuildKart → tagline), indigo feature chips, version footer |
| **Search** | Icon-led search field + clear; recent searches with clock icons + remove; popular categories as 2-col cards |
| **Cart Empty** | Handbag icon; **fixed CTA/bottom-nav overlap** |
| **Onboarding** | Storefront illustration icon |
| **Sign Up** | Field icons (user/phone/email/ID) + GSTIN validation state |
| **Mobile** | Country-code box (+91) + phone icon |
| **OTP** | Active-box focus styling |
| **Terms** | Shield header, numbered sections, acceptance checkbox |
| **Product Variant** | Variant thumbnails + finish colour swatches + size pills **rebuilt (overlap fixed)** |
| **Store Front** | Banner with avatar, rating/location, Follow button **rebuilt (overlap fixed)** |
| **Messages** | Avatars with initials |
| **Activity** | Grouped list (Today / Earlier this week) **rebuilt (overlap fixed)** |

## 5. B2B band (28 screens)

Built in a separate band at y≈20080–23680 (6 columns, 6 rows), reusing the existing B2B component
variants (`RFQForm`, `CreditLimit`, `ApprovalStatus`, `OrderCard / B2B`, `WorkflowAction`) + indigo tokens.

| # | Screen | Journey / area |
|---|---|---|
| 01 | Business Registration | onboarding |
| 02 | Business Account | account |
| 03 | Team & Roles | account (sub-users) |
| 04 | Approvals | `credit-order.approval` |
| 05 | RFQ List | `quote-to-order` |
| 06 | Create RFQ | `quote-to-order.create-rfq` |
| 07 | RFQ Detail | `create-rfq` |
| 08 | Quotes Received | `quote-to-order.seller-quote` |
| 09 | Quote Compare | `seller-quote` |
| 10 | Accept Quote | `quote-to-order.buyer-accept` |
| 11 | Credit Overview | `credit-order.choose-credit` |
| 12 | Choose Payment | `choose-credit` |
| 13 | Credit Statement | `credit-order` |
| 14 | Projects List | `REQ-project-site-purchasing` |
| 15 | Project Detail | `REQ-project-site-purchasing` |
| 16 | Material List | `REQ-project-site-purchasing` |
| 17 | Site Selector | delivery location |
| 18 | Project Order History | `REQ-project-site-reorder` |
| 19 | Order History (B2B) | `repeat-order.order-history` |
| 20 | Reorder | `repeat-order.reorder` |
| 21 | Quick Order Pad | catalogue (bulk) |
| 22 | Trade Price PDP | `select-product` (trade pricing) |
| 23 | Quotation Cart | `checkout` |
| 24 | B2B Checkout | `checkout` (GST invoice, PO) |
| 25 | Confirm Order (B2B) | `confirm_order` |
| 26 | GST Invoices | orders |
| 27 | Split Order Tracking | `order-tracking` (per seller) |
| 28 | Buyer–Seller Chat | support / negotiation |

## 6. Interaction map — B2B (21 links)

| Chain | Links |
|---|---|
| Onboarding/account | Business Registration → Business Account → Approvals |
| Quote → order | RFQ List → Create RFQ → RFQ Detail → Quotes Received → Quote Compare → Accept Quote → Checkout |
| Credit | Credit Overview → Choose Payment → Approvals |
| Projects | Projects List → Project Detail → Material List → Quotation Cart → Checkout; Site Selector → Material List |
| Repeat | Order History → Reorder → Quotation Cart; Project Order History → Reorder |
| Commerce | Trade Price PDP → Quotation Cart → Checkout → Confirm Order → GST Invoices |

Transitions: **slide** (left, 300ms, ease-in-out); board-level click targets.

## 7. Follow-ups

- Empty / loading / error states per screen (journey graph defines these states).
- Replace board-level click navigation with explicit CTA targets where multiple actions exist.
- B2B screens are mobile-sized; confirm the production b2b surface (web vs mobile) with the client.
