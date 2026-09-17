/*
  # Enforce monthly lead limits in the database

  The plan limit was only checked in UploadModal before this, so any signed-in
  user could bypass the paywall entirely by calling the insert directly — RLS
  permits writes to your own workspace and says nothing about volume.

  1. New table
     - `plan_limits` (plan, monthly_lead_limit): the enforcement source of truth.
       Still mirrored by PLANS in src/types/index.ts for pricing-page display.

  2. New trigger
     - `enforce_lead_limit` on `leads`, statement-level so a 500-row batch costs
       one count rather than 500.

  Notes:
    - Counts real `leads` rows per calendar month, not uploads.row_count, so the
      limit reflects rows actually stored.
    - Raising here aborts the batch; api.ts then deletes the upload row and the
      upload_id cascade removes any rows from earlier committed batches.
*/

CREATE TABLE IF NOT EXISTS plan_limits (
  plan text PRIMARY KEY,
  monthly_lead_limit integer NOT NULL
);

INSERT INTO plan_limits (plan, monthly_lead_limit) VALUES
  ('free', 100),
  ('starter', 1000),
  ('growth', 10000),
  ('pro', 50000)
ON CONFLICT (plan) DO UPDATE SET monthly_lead_limit = EXCLUDED.monthly_lead_limit;

ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_plan_limits" ON plan_limits;
CREATE POLICY "read_plan_limits" ON plan_limits FOR SELECT
  TO authenticated USING (true);

-- Makes the per-statement COUNT below an index scan instead of a seq scan.
CREATE INDEX IF NOT EXISTS idx_leads_workspace_created
  ON leads(workspace_id, created_at);

CREATE OR REPLACE FUNCTION public.enforce_monthly_lead_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target record;
  used integer;
  lim integer;
BEGIN
  FOR target IN SELECT DISTINCT workspace_id FROM new_leads LOOP
    SELECT pl.monthly_lead_limit INTO lim
    FROM subscriptions s
    JOIN plan_limits pl ON pl.plan = s.plan
    WHERE s.workspace_id = target.workspace_id
      AND s.status = 'active'
    LIMIT 1;

    -- No active subscription means no paid entitlement, so fall back to free.
    lim := COALESCE(lim, (SELECT monthly_lead_limit FROM plan_limits WHERE plan = 'free'));

    SELECT COUNT(*) INTO used
    FROM leads
    WHERE workspace_id = target.workspace_id
      AND created_at >= date_trunc('month', now());

    IF used > lim THEN
      RAISE EXCEPTION
        'Monthly lead limit exceeded: % of % leads for this plan. Upgrade to add more.',
        used, lim
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Triggers run regardless of EXECUTE grants, so this only closes the function
-- off as a directly callable RPC endpoint.
REVOKE EXECUTE ON FUNCTION public.enforce_monthly_lead_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_lead_limit ON leads;
CREATE TRIGGER enforce_lead_limit
  AFTER INSERT ON leads
  REFERENCING NEW TABLE AS new_leads
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.enforce_monthly_lead_limit();
