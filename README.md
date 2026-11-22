# COVARO

Control with confidence. (Formerly FieldPro.)

Multi-tenant field-service management for CCTV, solar and internet/network businesses, in any country.
Owned by Espring Global Ventures.

## Stack
- React + TypeScript + Vite, deployed as a Cloudflare Worker (static assets, SPA fallback) — `wrangler.jsonc`
- Supabase (Postgres, Auth, Storage, Row Level Security) — free tier
- No paid services

## Configuration
Set in Cloudflare Workers Builds → Variables (build-time), or `.env.local` for local dev:
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Only the publishable key ever goes in the frontend.

Cloudflare build command: `npm run build` · deploy command: `npx wrangler deploy`

## Database
Migrations in `supabase/migrations`, applied in order.
Security tests: `supabase/tests/phase1_rls_test.sql` (runs in a transaction and rolls back; prints PASS/FAIL).

Rules every new table must follow:
1. `business_id uuid not null` with an index and foreign key.
2. RLS enabled with policies using `is_member` / `has_role` / `is_manager` / `can_see_job`.
3. `revoke all ... from anon`; no delete grants (archive instead).
4. Privileged changes go through `security definer` functions with `set search_path = ''`.

## Phase status
- Phase 1 (auth, team, customers, jobs, technician workspace, dashboard): built
- Phase 2 (equipment, maintenance, quotes/invoices, payments, customer portal): not started
- Phase 3 (plans/limits, notifications, reports, platform admin): not started
