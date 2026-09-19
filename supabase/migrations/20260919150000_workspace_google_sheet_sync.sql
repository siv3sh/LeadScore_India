-- Connected Google Sheet for live lead sync (replace-on-sync).
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS sheet_url text,
  ADD COLUMN IF NOT EXISTS sheet_mapping jsonb,
  ADD COLUMN IF NOT EXISTS sheet_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sheet_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sheet_last_error text;

COMMENT ON COLUMN public.workspaces.sheet_url IS
  'User-provided Google Sheets link (share or export). Must be readable without login.';
COMMENT ON COLUMN public.workspaces.sheet_mapping IS
  'Saved column mapping JSON used on each sync so the user does not remap every time.';
COMMENT ON COLUMN public.workspaces.sheet_sync_enabled IS
  'When true, the app may auto-sync a stale sheet when the dashboard opens.';
