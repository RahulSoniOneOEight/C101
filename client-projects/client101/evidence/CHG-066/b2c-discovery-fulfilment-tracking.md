# CHG-066 — B2C discovery, fulfilment visibility and order tracking

**Date:** 2026-10-20
**Build:** app `8d5d5a0` (staging strip shows `STAGING · 8d5d5a0`)
**Surface:** `https://buildkart-staging.web.app`
**Scope:** approved B2C-only staging improvements inspired by the L&T-SuFin benchmark. Seller
discovery, seller scorecards and seller-side features are deliberately excluded.
**Production:** not authorized.

## Outcome

Five consumer-facing improvements are live on staging:

1. **Assisted product search.** Search has `Catalogue` and `AI demo` modes. AI demo is a
   deterministic, on-device interpretation over the live catalogue. It shows the interpretation and
   matched terms, is labelled as a staging demo, and makes no external AI call.
2. **Category and brand discovery.** A catalogue-derived `Discover` hub offers use-case prompts,
   live category cards with product counts, and a searchable brand directory. Categories with no live
   products are omitted so no card opens an empty aisle. Selecting a category or brand switches to the
   Browse tab with the filter applied and the URL in step (`#/browse?brand=…`).
3. **Delivery and pickup visibility.** The product page shows the destination from the saved/default
   address, staging serviceability, and an ETA only when the API returns a serviceable result. A pickup
   preference can be stored, but canonical checkout is gated until a real pickup shipping option exists;
   the app never submits pickup as delivery.
4. **Richer quick add.** A grouped product now opens a variant sheet and requires an explicit SKU
   choice, including when only one of its source SKUs is currently sellable. Single-SKU products remain
   one tap. The snackbar offers a branch-correct `View cart` action.
5. **Clearer order tracking.** Order detail and `Track Package` share one progress timeline with current
   status semantics and ETA summary. WhatsApp order updates are an opt-in local preference with explicit
   “no message will be sent” copy.

## Guardrails preserved

- 233 grouped product cards and 500 traceable source SKUs are unchanged; no products, categories,
  brands, collections or seller assignments were created.
- Deterministic 5–18% fixture discounts, merchandising tags and B2B `1+/10+/25+` tiers are untouched.
- Operator-authored CMS modules remain authoritative. The discovery entry is additive and
  catalogue-derived.
- Address-first checkout and canonical server completion remain mandatory.
- Pickup ordering is blocked; WhatsApp messaging is not connected; AI is not called.
- Staging only: `production_release_authorized: false`.

## Verification

### Automated

| Check | Result |
|---|---|
| `flutter analyze` | clean, no issues |
| Full non-golden suite | **236 passed** |
| New unit/widget coverage | AI interpretation and catalogue-only ranking; discovery category/brand output; empty-category omission; cross-branch Browse navigation; grouped-product explicit selection; serviceability loading/serviceable/invalid/failure at 390 and 360; pickup gate; timeline semantics; preference persistence |

### Chrome QC

Method: headless Google Chrome at 390×844 and 360×800, Flutter semantics enabled, real OTP login
(`rsoni001@gmail.com`, staging OTP `123456`). Script and raw report:
`client-projects/client101/evidence/CHG-066/screenshots/report.json`.

| Assertion | 390×844 | 360×800 |
|---|---|---|
| OTP verify returns `200` | pass | — |
| Home discovery entry, counts and use-case chip | pass | pass |
| AI demo disclosure, interpretation and live results | pass | — |
| Discover categories and brand directory | pass | pass |
| Brand selection switches to Browse with filter | pass (`#/browse?brand=jktyre`, Browse tab selected) | — |
| PDP delivery card and `Delivery available · 3 days` | pass | — |
| Order progress, current event and WhatsApp preference | pass | — |
| Checkout delivery controls and authenticated identity | pass (`Pilot Tester 1 · rsoni001@gmail.com`) | — |
| Pickup preference gate and switch-to-delivery action | pass | pass |
| Page-level horizontal overflow | none | none |
| Console errors / HTTP errors / failed requests | none | none |

The authenticated checkout identity is now correct in a successful session, confirming the identity
guard behaves as intended. **No order was submitted in this QC run**, and the checkout cart was empty,
so delivery-method selection and order completion were not re-tested here.

## Screenshots

All under `client-projects/client101/evidence/CHG-066/screenshots/`:

- `390-home-discovery.png`, `360-home-discovery.png`
- `390-ai-search.png`
- `390-discover-categories.png`, `390-discover-brands.png`, `360-discover.png`
- `390-brand-browse.png`
- `390-pdp-fulfilment.png`, `390-pdp-fulfilment-lower.png`
- `390-track.png`
- `390-checkout-delivery.png`, `390-checkout-pickup-gated.png`, `360-checkout-pickup.png`

## Known limits / next steps

- Pickup order placement requires a canonical pickup shipping option and address/serviceability
  contract. Until then the preference is stored and checkout is deliberately blocked.
- WhatsApp updates are a persisted preference only; no outbound integration exists.
- AI demo uses five reviewed intent rules plus token fallback; it does not learn, call an LLM, or
  provide technical advice.
- Full checkout completion, including delivery selection and order creation, still needs a separate
  end-to-end staging run with a populated cart.
- Human visual acceptance remains outstanding for the new surfaces.

Staging only; production remains unauthorized.
