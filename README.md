# RepCount — Gym Payment Manager

RepCount is a mobile-first gym-owner workspace for membership plans, member records, fee cycles, payment receipts, renewals and collection follow-ups. The application is branded as **Powered by Alif Growth Media**.

## Backend migration status

This version removes the Apper SDK runtime and replaces it with Supabase Auth, PostgreSQL, Storage, a server-side user-management function and a Supabase-backed query adapter.

**The migration is staged, not yet connected to production.** The SQL migration and first-admin bootstrap must be applied to the Supabase project, the `admin-users` Edge Function must be deployed, and the new Vercel environment variables must be set before this branch is merged/deployed to the live site.

The old MemoryAdapter seed data and demo login seed are removed from this branch. Do not merge/deploy until the initial Admin account has been bootstrapped and the build has been tested.

## Architecture

- **Frontend:** React + Vite; hosted on Vercel.
- **Identity:** Supabase Auth password sign-in; public self-sign-up is disabled in RepCount. Accounts created by an Admin are marked confirmed by a server-side function, so no Gmail verification link is required.
- **Database:** Supabase PostgreSQL with per-gym `gym_id` scopes, role rules and Row Level Security (RLS).
- **Roles:** Admin, Manager and Staff. Admin manages accounts and roles. Manager can manage membership operations. Staff can read gym records and record payments.
- **Payment consistency:** a PostgreSQL trigger recalculates fee-cycle paid amount, balance and status within the same transaction as payment inserts/updates/deletes.
- **User administration:** `supabase/functions/admin-users/index.ts` validates the caller's Supabase JWT and requires an active Admin role before creating confirmed accounts, changing roles, listing accounts or deleting accounts. The service-role credential is server-side only.

## First-time Supabase setup

Use the Supabase project intended for RepCount. Do not paste keys or passwords into this repository or into chat.

### 1. Apply the schema

Open the Supabase Dashboard → **SQL Editor** → **New query**. Run these migration files in order:

1. `supabase/migrations/202610100001_initial_schema.sql`
2. `supabase/migrations/202610100002_harden_function_privileges.sql`
3. `supabase/migrations/202610100003_move_tenant_helpers_private.sql`

The first creates the business tables, indexes, per-gym RLS policies, same-gym relationship checks, payment-reconciliation triggers and dashboard-summary RPC. The follow-up migrations remove anonymous/internal RPC access and keep the tenant helper functions in a non-API-exposed `private` schema.

Do not run business CRUD until all three scripts succeed without SQL errors.

### 2. Create the first Admin

In Supabase Dashboard → **Authentication → Users → Add user**, create the first Admin login. Use a strong password and enable **Auto Confirm User** for this Admin. This account is the trusted initial administrator; do not use the old demo credentials.

Then open `supabase/bootstrap_admin.sql`, replace the two placeholder values (`REPLACE_WITH_FIRST_ADMIN_EMAIL` and `REPLACE_WITH_GYM_NAME`) with your Admin email and your gym/workspace name, and run that edited script in the SQL Editor **once only**. It creates the gym, user profile and Admin membership. Do not delete this account or run the bootstrap script twice.

### 3. Deploy the Admin user-management function

Install the Supabase CLI and authenticate from a terminal:

```bash
npm install
npx supabase login
npx supabase link --project-ref pnhpkraqsahpebjiynwz
npx supabase functions deploy admin-users
```

Supabase Edge Functions receive their project URL and privileged server environment from Supabase. Do not copy the service-role/secret key into a `VITE_*` variable, frontend source or GitHub. Keep the function's JWT verification enabled. The function additionally calls Supabase Auth to validate the signed-in user and checks their active Admin role.

### 4. Configure Supabase Auth

In Supabase Authentication settings, disable **Allow new users to sign up**. The app's public signup page is informational only; only the server-side Admin function can create new accounts.

Set the production Site URL and allowed redirect URLs to your actual Vercel/custom domain. Include the deployed `/reset-password` URL and your local development reset URL if you test locally. Admin-created users do not need an email-verification link.

### 5. Set Vercel environment variables

In Vercel → RepCount → **Settings → Environment Variables**, set both variables for Production (and Preview if needed):

- `VITE_SUPABASE_URL` = `https://pnhpkraqsahpebjiynwz.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the Supabase project's current publishable key

Redeploy after saving these values. These are the only Supabase configuration values that belong in the browser bundle. **Never create a `VITE_SUPABASE_SERVICE_ROLE_KEY` or place a database connection string in a frontend variable.**

### 6. Test before merging to main

1. Sign in using the initial Supabase Admin created above.
2. Open Settings and create a second user with the Staff role.
3. Verify the second user can sign in without email verification.
4. Verify Staff can read members/plans/dues and create payments, but cannot open Settings, edit plans/members/dues, change roles or delete accounts.
5. Create a plan, member, due and payment. Refresh the browser and confirm the data persists.
6. Add multiple payments, edit/refund/delete a payment and confirm the fee-cycle balance follows the paid payment ledger.
7. Confirm a user in a different gym cannot access the first gym's rows, even by guessing record IDs.
8. Confirm the last active Admin and the currently signed-in account cannot be deleted/demoted through Settings.

## Local development

Requirements: Node.js and npm.

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholder publishable key using the Supabase dashboard.
3. Run `npm install`, then `npm run dev`.
4. Check production compilation with `npm run build`.

## Secrets and credential hygiene

- Real `.env`, `.env.local` and all other `.env.*` files are ignored by Git; only `.env.example` is committed.
- A publishable key is designed to be available to the browser, but RLS is still required.
- Secret/service-role keys and the database password stay server-side. Rotate the privileged keys and database password that were pasted into chat before deploying this migration, then use the new credentials only in the appropriate private Supabase configuration.
- Never commit login passwords, API secret keys, service-role keys or the database pooler connection string.

## Dashboard behaviour

The simplified home screen shows only three headline metrics: outstanding fees, collected today and members due today. Each card opens the matching filtered dues or payment page, and the dashboard includes a compact due-today member list.

## Migration notes

- The original Apper CDN script, MemoryAdapter and mock row-policy loader are removed from the migration branch.
- Account passwords are never stored in RepCount business tables.
- Business tables reference users only through Supabase Auth IDs and the private `gym_users` role mapping.
- Public signup is disabled; user administration is done server-side and role assignments are never accepted directly from the browser.
