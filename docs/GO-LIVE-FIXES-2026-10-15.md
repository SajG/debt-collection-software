# Go-live fixes — 15 Oct 2026

Small, targeted bug fixes found while walking the real pilot path
(director sets up the company → invites staff → staff use the app →
sales order → factory → Tally). No refactors.

## Apply in this order

1. Back up the production database.
2. `prisma migrate deploy` with the production `DIRECT_URL` — this also
   applies any SY28–SY42 migrations production is still missing (see
   LAUNCH.md B1), then the two new ones:
   - `20261015000000_mobile_settings_read`
   - `20261015000100_storage_tenant_paths`
3. Redeploy the `notify` edge function:
   `supabase functions deploy notify --no-verify-jwt`
4. Deploy the web app (Vercel). Optional new env: `TALLY_CONNECTOR_URL`.
5. Build a new mobile app (the fixes below are in the app code).
6. Rebuild the Tally connector installer.

## What was fixed

| # | Problem | Fix | Files |
|---|---|---|---|
| 1 | Phone uploads (payment proof, LR/invoice photos) always failed: the route only read the web cookie, the app sends a Bearer token, and middleware redirected the request to /login. Also stored files without checking the order/payment belonged to the caller's company. | Route accepts the app's token, checks the order/payment is in the caller's company (and the salesperson's own for Sales), refuses when the company is read-only; `/api/uploads/` added to self-authenticating routes. | `app/api/uploads/document/route.ts`, `middleware.ts` |
| 2 | Nobody could open a document on the phone: SY22 storage policy casts the first path segment to uuid, but paths start with order/payment cuids → SQL error on every signed URL. | Same company rule written with text comparisons; accepts company-id prefix or an order/payment of the company. | migration `20261015000100_storage_tenant_paths` |
| 3 | Push notifications crossed companies (LAUNCH.md B3): comment, credit-issue and stale-order pushes went to every FACTORY/ADMIN profile in the system. | Recipients = active members of the order's company with that role, opted in. | `supabase/functions/notify/index.ts` |
| 4 | The app could not read its own company's settings (RLS had only a restrictive policy): company brand/packing lists, "require app lock" and minimum app version silently used defaults; "Tally updated …" never showed. | Read policy for members of the active company; phones get column-level access to non-secret columns only. | migration `20261015000000_mobile_settings_read` |
| 5 | The sales order was Synergy-only: Polygum brands, Synergy packings, kg sizes and "With Synergy Barcode Token" were hard-coded and required for every company. | Companies with their own brand list keep the catalogue form unchanged (Synergy). Every other company gets a generic form: product + quantity + unit + rate; packing and size optional free text; no token field. Catalogue cached per session and for offline use, cleared on sign-out. | `mobile/src/components/ItemSheet.tsx`, `mobile/src/lib/catalog.ts`, `mobile/src/lib/order-draft.tsx`, `mobile/app/(staff)/orders/new/index.tsx`, `mobile/app/(staff)/orders/edit/[id].tsx`, i18n |
| 6 | " kg" was glued onto every size ("310 ml kg", "XL kg", "null kg"). | `formatSize()` adds kg only to plain numbers. | `lib/format.ts`, `mobile/src/lib/format.ts`, order/production screens |
| 7 | Invites were email-only; staff who don't read email couldn't join, and "Resend" said "Done." even when the email failed. | After invite/resend the manager sees the join link with Copy and Share on WhatsApp; honest message when email fails. | `app/(dashboard)/admin/users/*` |
| 8 | Tally connector could never be configured: the settings window saved `paytrackUrl`, the service reads `syncitUrl`. | Field renamed; default `https://getsyncit.app`. | `tools/tally-connector/src/renderer/settings.html`, `src/config.js` |
| 9 | The website tells admins to enter a pairing code, but the connector had no pairing support (only a shared secret). | Connector trades an 8-character pairing code for its own token on first sync and saves it. | `tools/tally-connector/src/service.js` |
| 10 | Paired connectors got 401 from `/api/sync/tally/state`, so every run pulled the whole voucher book. | State route accepts connector tokens (scoped to that company). | `app/api/sync/tally/state/route.ts` |
| 11 | Installer could not register the Windows service (files packed in app.asar can't be run by node.exe) and the start-up shortcut pointed at "PayTrack Tally Connector.exe". | `asar: false`; names fixed. | `tools/tally-connector/package.json`, `installer.nsh` |
| 12 | `/download` linked to a connector file that is not hosted; auto-update looked at the wrong GitHub owner. | `TALLY_CONNECTOR_URL` env; owner `SajG`. | `app/(marketing)/download/page.tsx`, `app/download/latest.json/route.ts`, `.env.example` |
| 13 | Adding a duplicate product crashed with a 500. | Friendly "already exists" message. | `app/(dashboard)/admin/products/actions.ts` |
| 14 | Synergy brand names in placeholders shown to every company; stale "code emailed" text in onboarding; CI test list out of date. | Generic text; test list updated; new `format-size` test. | various |

Checks run: web `tsc` clean, `next lint` 0 errors, vitest 285 passed
(the DB-backed suite needs a database); mobile `tsc` clean, i18n/a11y/
contrast checks pass, Android and iOS bundles export.
