# Multi-organization (org branch)

Additive tenant layer on the existing LeadAI / LeadScore app. Super admin is
`hello@sivesh-pb.com` (also matched as `hello@sivesh` by the backfill). Existing
single-tenant behaviour stays: each user still owns one workspace, owner RLS is
unchanged, and `hello@sivesh-pb.com` still lands on `/admin`.

## What was added

- `organizations` table
- `profiles.org_id`, `profiles.role` (`super_admin` | `org_admin` | `org_user`),
  `profiles.must_change_password`
- `org_id` on `workspaces`, `uploads`, `leads` (stamped on insert)
- RLS: org admins read their org; org users stay owner-scoped; super admin still
  sees everything (`private.is_admin()` also treats `role = super_admin`)
- Super admin UI: create org, set seats, add users, assign/remove org admin,
  “view as org” filter
- Org admin UI: `/org` dashboard (users, usage, reused `LeadCharts`)
- Forced password change on first login; change password in profile
- Edge function `org-admin` creates Auth users (the client cannot)

## Run the data backfill (manual, once)

Schema is in `supabase/migrations/20260920180000_organizations.sql`. It does
**not** assign existing rows. Do that yourself:

```bash
# 1. Backup first (dev)
#    Dashboard → Project Settings → Database → take a backup
#    or, if you have a connection string:
#    pg_dump "$DATABASE_URL" -t public.profiles -t public.leads -t public.workspaces -t public.uploads > backup-pre-org.sql

# 2. Backfill org_id / super_admin (idempotent)
npm run migrate:org
```

`npm run migrate:org` needs `SUPABASE_SERVICE_ROLE_KEY` plus `SUPABASE_URL` or
`VITE_SUPABASE_URL` in `.env`. Never put the service role key in a `VITE_*`
variable.

If the key is missing, the script prints this file instead:

`scripts/migrate-org.sql`

Paste that into the Supabase SQL editor. A second run does not duplicate the
default org (“Sivesh Personal”) or reassign rows that already have `org_id`.

## Email sending (stubbed)

There is no transactional mailer in this repo besides Supabase Auth confirmation
emails. Creating a user with “Email temp password” **logs a TODO** in the
`org-admin` function and still returns the password to the admin to copy.

Wire Resend / SES / Auth SMTP later in `supabase/functions/org-admin/index.ts`
(`stubTempPasswordEmail`).

## Rollback

`org_id` and `role` are additive. The backfill does not delete or overwrite
pre-org columns (`email`, `is_admin`, `user_id`, lead fields, …).

If this branch is merged to `main` and something breaks:

1. `git revert` the merge commit. The app ignores the new columns and the old
   owner RLS + `is_admin` path works again for `hello@sivesh-pb.com`.
2. Restore the database backup taken **before** `npm run migrate:org` only if
   that script actually ran against that environment. You do not need to drop
   the new columns for the reverted app to boot.
3. Optional cleanup (not required for rollback): `DROP TABLE organizations`
   after clearing FKs — do this only if you are sure no other branch needs them.

## Access rules (the “middleware”)

Enforced in Postgres RLS, not in the Vite client:

| Role | Sees |
| --- | --- |
| `org_user` | Own workspace only (existing policies) |
| `org_admin` | All workspaces / leads / users in `org_id` |
| `super_admin` / `is_admin` | Everything; UI can filter “view as org X” |
