# CHG-088 — Local implementation verification

Date: 2026-10-29
Status: code complete; staging browser QC pending separate staging authorization.

## What changed

- **Admin order detail**
  - Full CHG-087 return labels: received/inspection pending, inspection complete/refund pending, closed, rejected, cancelled.
  - Read-only simulated-refund context with amount, `SIM-` reference and no-real-money/stock wording.
  - Return actions limited to approve/reject; receipt, inspection, refund simulation and closure link to the return workbench.
  - Delivery form uses the shipment's allowed transitions, including partial delivery, attempts, buyer action, delays, damage/loss, RTO and Admin cancellation.
  - Per-line delivered quantities and proof are required for delivery evidence.
- **Seller order detail**
  - Full return/inspection labels, no refund amount/breakdown/reference.
  - No decision, receipt, inspection, refund or closure action on the order page; link to the Seller return workbench.
  - Delivery form supports Seller-allowed partial/exception transitions; cancellation stays unavailable through the Seller API.
- **Order operations tile**
  - Return status reflects inspection pending/complete.
  - Admin refund tile shows a simulated refund when present, with `SIM-` and no-real-money wording; otherwise native refund state.
- **No changes** to native Mercur order list, Medusa payment/refund, Tryton stock, carrier, settlement or accounting.

## Verification

| Check | Result |
|---|---|
| Admin `tsc -b` | PASS |
| Seller `tsc -b` | PASS |
| Admin production build | PASS |
| Seller production build | PASS |
| Built bundle markers | PASS — `Open return workbench`, `Inspection complete`, `Partially delivered` |
| Schema change | None |
| Medusa/Tryton mutation | None |

## Pending before closeout

- Staging image rebuild and deployment (separately authorized).
- Browser QC at 390×844 and 1440×900 against a staging return at received, inspection-complete and closed states.
- Prove Seller redaction on the staging order page.
- Exercise partial delivery/exception controls on the staging order page.
- Record zero-effect counts and remove the staging fixture.

Provider/legal items remain deferred: real refunds, Tryton stock disposition, Shiprocket/carrier, settlement/accounting, legal/tax wording and production release.
