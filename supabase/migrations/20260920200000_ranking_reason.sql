/*
  # Ranking explanation

  Call order now states why a lead is high/medium/low. That text is written
  at score time so the list does not have to re-derive it.

  1. Changes
     - `uploads.ranking_summary` (text, nullable): one banner for the batch.
     - `leads.score_reason` (text, nullable): one line per lead.

  Notes:
    - Nullable: older uploads stay valid; the UI hides the banner when null.
    - Not indexed. Both fields are read with the already-loaded upload.
    - RLS on uploads/leads already covers these columns.
*/

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS ranking_summary text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score_reason text;

COMMENT ON COLUMN public.uploads.ranking_summary IS
  'Plain-language why this batch is ordered this way (trained, form intent, or recency).';

COMMENT ON COLUMN public.leads.score_reason IS
  'Plain-language why this lead sits at its place in the call order.';
