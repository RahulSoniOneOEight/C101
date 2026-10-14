# Native Console Configuration Consolidation

**Date:** 15 October 2026
**Change contract:** CHG-037 revision 2
**Status:** Deployed to staging; awaiting human visual review; production unauthorized

## Operator model

The standalone **Preset Review** surface has been removed. Bootstrap fixtures may still create
bounded staging records, but operators work only with the resulting records in their authoritative
console sections:

| Configuration | Authoritative operator control |
|---|---|
| Promotion mechanics, eligibility and limits | Native Medusa Promotions |
| Campaign grouping, schedule and budget | Native Medusa Campaigns |
| Commerce collection membership | Native Medusa Collections |
| Category identity, hierarchy and membership | Native Medusa Categories |
| Storefront presentation and localized content | Mercur Editorial content |

## Implemented

- Removed Preset Review from Merchandising navigation.
- Removed the **Review presets** overview action.
- Removed preset and offer reconciliation queries and counts from the overview.
- Kept direct cards for Promotions, Campaigns, Collections, Categories and Editorial content.
- Replaced the preset-derived metric with the real CMS draft count.
- Limited **Needs attention** to real unpublished editorial state.
- Preserved the old `/merchandising-presets` URL as a redirect to `/merchandising`.
- Retained the authenticated staging reconciliation API only as an internal seed/test diagnostic.

## Verification

- `bun run lint` passed in `services/backend/apps/admin`.
- `bun run build` passed in `services/backend/apps/admin`.
- The build emitted only the existing large-chunk advisory.
- No Preset Review label or preset/offer catalogue query remains in the Admin UI source.
- `git diff --check` passed.
- CHG-037 revision 2 parsed as valid YAML.
- Release `9c07a35` is deployed to staging; see `hosted-staging-deployment.md`.

No production release was authorized or performed.
