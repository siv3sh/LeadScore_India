-- Snooze hides a lead from "Today's list" until this timestamp.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

COMMENT ON COLUMN public.leads.snoozed_until IS
  'When set in the future, the lead is hidden from the daily call list until then.';

CREATE INDEX IF NOT EXISTS idx_leads_workspace_snoozed
  ON public.leads (workspace_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;
