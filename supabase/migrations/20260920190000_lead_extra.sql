/*
  # Keep leftover CSV columns on each lead

  Upload no longer requires a fixed template. Name and phone are mapped for
  the call list; every other column in that file is stored here so the shop
  owner can pick what to show.

  1. Change
     - `leads.extra` (jsonb, not null, default {}): leftover CSV fields as
       string key/value pairs.

  Notes:
    - Not queried or filtered in SQL — the dashboard reads extra from the
      already-loaded upload — so no GIN index.
    - Default {} keeps older rows valid without a backfill.
    - RLS on leads already covers this column; no new policy.
*/

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.leads.extra IS
  'Unmapped CSV columns from the upload, shown on the call list when the user ticks them.';
