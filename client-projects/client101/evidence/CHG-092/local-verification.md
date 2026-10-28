# CHG-092 — Return evidence capture, source verification

Date: 2026-10-29
Status: implemented; unit- and build-verified. Staging deployment is separately gated.

## What changed

| Area | Change |
|---|---|
| Experience API | Local evidence store, HMAC-signed short-lived URLs, `POST /v1/orders/{ref}/evidence`, `GET /v1/evidence/{id}`, evidence URLs on customer/Admin/Seller return reads. |
| Storage | `EVIDENCE_DIR` (Docker volume on staging), max 5 MB, JPEG/PNG/WebP only, sha256 recorded, object keys never exposed. |
| Customer web | Optional photo picker (max 3) on the return form, uploaded before the request is created; photos render on the return page. |
| Admin | "Customer photos" card on the return workbench with thumbnails and short-lived links. |
| Seller | Same card, scoped to the Seller's return view. |
| Compose | `evidence_data` volume and `PUBLIC_API_BASE_URL` for the Experience API. |

## Verification

| Check | Result |
|---|---|
| Experience API `tsc --noEmit` | PASS |
| Admin / Vendor / Web typecheck | PASS |
| Admin / Vendor / Web production builds | PASS |
| Bundle markers | PASS — `Customer photos`, `Uploading photos` |
| Store unit checks | PASS — PNG round-trip, sha256, size/type rejection, path-escape rejection, missing object |
| Signing unit checks | PASS — valid signature, tampered signature, wrong id, different expiry, malformed hex |
| Schema change | None |
| Provider call | None |

Unit output: `{"ok":true,"object_key_shape":"pilot_customer_b2c04/<uuid>.png","signed_url_shape":"ok"}`.

## Security notes

- Upload is owner-scoped; the API re-checks the order correlation and session.
- Reads are public only with a 10-minute HMAC signature; the object key and owner are not in the URL.
- Responses set `X-Content-Type-Options: nosniff`, a sandbox CSP and inline disposition.
- No malware scanning: `scan_status` stays `pending` and rejected files are never served. Production
  requires scanning and object storage; this is disclosed, not hidden.

## Pending

- Staging release: medusa (dashboards), experience-api and web images, the `evidence_data` volume and
  `EVIDENCE_SIGNING_SECRET`.
- Staging QC: attach a photo to a throwaway return, verify the customer/Admin/Seller render, exercise
  the signed-URL rejection cases, then remove the return, evidence row and file.
