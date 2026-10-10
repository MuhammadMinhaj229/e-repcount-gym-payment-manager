# RepCount — Gym Payment Manager

RepCount is a mobile-first gym-owner CRM for member records, membership plans, fee cycles, payment receipts, upcoming dues, renewals, and WhatsApp reminder links.

## Current implementation status

The current app is a React + Vite project and its data adapter is still Apper's mock/memory adapter. It is **not yet connected to a production database or Supabase**. Demo rows are seeded from `src/services/mockData/`. Do not use this mock setup for real member/payment records.

## Local development

Requirements: Node.js and npm.

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholders with the approved Apper project/public values for the current SDK setup.
3. Install dependencies: `npm install`.
4. Start the dev server: `npm run dev`.
5. Validate a production build: `npm run build`.

## Environment and secrets

- Real `.env`, `.env.local`, and all `.env.*` files are ignored by Git.
- Only placeholder values belong in `.env.example`.
- Never commit passwords, database credentials, Supabase secret/service-role keys, or private API tokens.
- Browser-exposed `VITE_*` values are not secret credentials; access control must be enforced by the backend.

## Database / production checklist

Before handling real gym data:
- Choose and connect the production data store (Apper database or a complete Supabase migration).
- Use server-enforced per-owner access policies and verify them using two separate test accounts.
- Ensure payment writes, refunds/deletions, and linked fee-cycle balances remain reconciled.
- Configure authentication redirect URLs and the deployed site's allowed origins.
- Test all create, edit, delete, filtering, date-boundary, and mobile workflows against live data.
- Import demo records only deliberately, after reviewing ownership and consistency.

## Audit safeguards in this version

- Date fields default to the browser's local calendar date rather than UTC.
- Member history queries filter by the selected member on the data layer and fetch in pages.
- Linked paid payments attempt to update the fee-cycle amount paid, balance, and status after creation, editing, refunds, or deletion.
- Write failures are shown to the user and recorded in the browser console without logging member contact details.
- Demo ownership fields and fee-cycle balances are aligned with the included sample receipt history.

## Important data behavior

Payment-to-dues reconciliation currently uses sequential client-side SDK writes, not a database transaction. The app surfaces a warning if the second write fails, but a production deployment should move this reconciliation into a trusted transactional server-side function before handling real payments. This project is still using mock data until a live data store is explicitly connected.
