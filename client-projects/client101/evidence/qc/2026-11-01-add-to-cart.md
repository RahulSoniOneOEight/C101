# Add-to-cart QC + hardening — 2026-11-01

- **Reported:** “products are not being able to be added to cart; it shows an error (B2B and B2C)”.
- **Build:** web `71421f2` (3,943,297 bytes · SHA-256 `8ae7f055…03c670`).
- **Scope:** B2C + B2B add journeys; no API/schema change.

## 1. Investigation

Live infrastructure was healthy (medusa, experience-api, workspace, postgres). A scripted matrix added
products with network capture:

| Persona | Product | Add call | Result |
|---|---|---|---|
| B2C | 3M Mirror Mount Tape | `POST /v1/carts/{id}/lines` → **200** | added |
| B2C | IPHONE 17 (multi-variant) | 200 | added (badge `1 Cart`) |
| B2C | Sumsan Fold 7 (3 variants) | 200 | added (`2 Cart`) |
| B2C | iPhone14 (4-image gallery) | 200 | added (`3 Cart`) |
| B2B | Wonder Cement | local quotation cart | added → “Proceed to Checkout” visible |

No 4xx/5xx on the line endpoints; no error toast in any run. The reported failure did not reproduce
on the deployed build.

## 2. Hardening shipped anyway

The generic toast (“Could not add to cart. Please retry.”) hid the real reason. Now:

- `addToCartSafely` records the failure; `cartFailureMessage()` extracts the API `detail` or maps the
  status:
  - 401 → “Your session expired. Sign in again, then retry.”
  - 404 → “This product is no longer available.” (e.g. an archived Smoke product still open on screen)
  - 409 → “This product cannot be added right now (conflict). Please retry.”
  - other → “Could not add to cart (NNN). Please retry.”
- The error toast shows that message, so the next report carries the actual cause.

The existing recovery in `CartNotifier.addItem` (recreate the cart once on 404) is unchanged.

## 3. Journeys verified after the change

| Journey | Result |
|---|---|
| PDP → Add to Cart (B2C) | PASS — 200, “Added”, badge, toast |
| Tile quick-add (B2C) | PASS — line added, cart badge |
| Qty stepper → add 2 | PASS — cart line quantity 2 |
| Buy Now (B2C) | PASS — goes to checkout |
| B2B tile “Add to order” | PASS — inline stepper |
| B2B PDP “Add to Cart” | PASS — quotation cart |
| B2B RFQ button | PASS — snackbar + View RFQ |
| Console/page errors | 0 |

## 4. If it recurs

Ask for: the exact toast text, the product, web vs APK, and the account. With the new message the toast
now carries the status/detail (e.g. 404 archived product, 401 session). The most likely real-world case
is a **stale screen for an archived product** (the three Smoke products were unpublished today) — the
add now says “This product is no longer available.” instead of a generic retry.

## 5. Artifacts

- Web: `71421f2` · 3,943,297 bytes · SHA-256 `8ae7f0557378bac214795d5c7b69a4cc3c9417b68c677070a3c44d84b003c670`.
- APK: `app-release-71421f2.apk` · 62,975,115 bytes · SHA-256 `d3b419538e328436b448cf863536039813a012f58a5ef997096148f0ef70b0c9` · `CN=BuildKart Staging`.
- U-019 Browse work parked on `feat/u019-browse-facets`; plan at `docs/implementation/u019-browse-facets-plan.md`.
