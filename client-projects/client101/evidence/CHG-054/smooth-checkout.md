# CHG-054 — smooth checkout (P0 + P1)

## Outcome

B2C checkout now follows the note's order: **address → contact → delivery →
promo → summary → place order**. A repeat buyer opens checkout with the last
used (or default) saved address and can place an order without typing an
address. Promo codes are available in checkout and survive an address change.

Staging only. Production release remains unauthorized.

## Implemented

### Address-first checkout

- Opens with the **last used** address, then the **default**, then the first
  saved one (`checkoutStartAddressProvider`).
- Collapsed address card: label, DEFAULT chip, single-line address, phone,
  Change, Edit.
- Picker sheet: immediate selection, add, edit, set-default.
- Add/edit uses one shared sheet; writes to `addressesProvider`, so Account and
  checkout stay on the same book.
- A first address is marked default automatically.
- A third **Office** seed address is added once to legacy two-address installs;
  buyer-created or edited lists are never rewritten.

### Canonical address

`Address` now carries `phone`, `address2` and `province`. The single
`SavedAddress.toCheckoutAddress()` mapper splits the full name once. The BFF
forwards all three fields to Medusa; previously it rebuilt the address from a
whitelist that dropped them.

### Delivery

- Options are fetched **only after** an address exists.
- Changing the address clears the previous selection and reloads options.
- Checkout summary uses the cart payload: subtotal, discount, shipping, total.
- The cart no longer prints a hardcoded "Free"; it shows the cart shipping
  amount or "Calculated at checkout".

### Contact and promo

- Contact is a **read-only card** showing the signed-in name, email and phone.
  Checkout no longer asks the buyer to retype identity details.
- Email prefers the **authenticated pilot identity** (from the OTP verify
  response, persisted for restore). The demo profile email is only a fallback.
  This fixed a real 403 `identity-mismatch` on placing an order.
- The signed-in name is persisted too. Untouched demo addresses are renamed to
  that profile name once, so the address book does not show the fixture name.
- The saved default address is preselected, with a Change action.
- The promo panel is available in checkout; codes stay on the cart, not in
  widget state.

### Failure handling

- Cart totals are rehydrated through `GET /v1/carts/:id`.
- Validation errors and server failures render **inline above Place order**,
  not as a SnackBar.
- Place order is disabled while submitting and after success (single order).

## Verification

### API / database

| Check | Result |
|---|---|
| Customer details with phone, address_2, province | 200 |
| Order complete | 200, order group created |
| Latest order address | `3rd Floor, Sunrise Tower` / `MG Road` / `Jaipur` / `Rajasthan` / `302001` / `+91 98765 43210` |
| Order total with promo | ₹3889.50 (₹4089 − ₹199.50 + ₹99 shipping) |
| Checkout contact card | **Pilot Tester 1** · rsoni001@gmail.com · phone; no input fields |
| `ORDER5` in checkout | -₹199.50, total ₹3790.50 |

### Browser (headless Chrome, live)

| Step | Result |
|---|---|
| First checkout | Home + DEFAULT, email/phone prefilled, Standard ₹99 / Express ₹199, promo panel |
| Change → Site | address card updates; delivery reloads |
| Apply `BK-STG-OFFER-ORDER10` | chip + discount −₹199.50; total ₹3889.50 |
| Place order | **Order Confirmed** screen |
| Failure before identity fix | inline `403 identity-mismatch` (fixed) |

### Local

| Check | Result |
|---|---|
| `flutter analyze` | pass |
| `flutter test --exclude-tags golden` | 191 tests pass |
| `bun run typecheck` | pass |

New tests cover the address mapper, last-used/default resolution, the legacy
seed migration, and checkout with a prefilled address.

## Deployment

- Commits `05997a3` (checkout) and `5df3c07` (address forwarding).
- Experience API rebuilt and recreated from the release compose + FCM override.
- Firebase Hosting released to `buildkart-staging`.

## Not included (note P2–P5)

- Server-backed address book (`/v1/me/addresses`).
- Pincode serviceability gating.
- B2B site picker from the address book; B2B local order → Medusa order.
- Web cart/checkout transformation.
- Cart-expired 404 rebuild (the cart is rehydrated, but a 404 surfaces as an
  inline failure rather than rebuilding lines).
- Validate-on-blur; validation currently runs on submit with inline errors.
- "Save this address for next time" checkbox: the shared sheet always saves.

## Release status

- Staging implementation: deployed.
- Human visual review: pending.
- Production authorization: **false**.
