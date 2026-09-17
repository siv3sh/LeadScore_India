/*
  # Give the free plan a real 14-day trial

  The pricing page calls the free plan a "14 day" trial, but nothing expired it,
  so a free workspace could ingest 100 leads a month forever. This makes the
  claim true.

  1. Change
     - `subscriptions.trial_ends_at` (timestamptz, nullable): when a free
       workspace stops being able to add leads. NULL means "no trial window",
       which is how paid plans and any pre-existing row behave.

  2. Behaviour
     - `handle_new_user` stamps now() + 14 days on the free subscription it
       creates.
     - `enforce_monthly_lead_limit` refuses new leads once a free workspace's
       window has closed, before it checks the monthly limit.
     - Existing data stays readable and exportable. Only ingestion is gated —
       holding a customer's own leads hostage is not a payment incentive.

  Notes:
    - Enforced in the trigger rather than the client for the same reason as the
      lead limit: RLS lets a signed-in user insert into their own workspace, so
      a client-side check is a suggestion.
    - Upgrading is what lifts the gate: the check only applies to plan = 'free',
      and razorpay-verify sets plan to the purchased tier.
    - Paid plans are deliberately NOT expired by `current_period_end` here.
      There is no renewal webhook yet, so that would cut off paying customers.
*/

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Every existing free workspace gets a full window measured from its signup,
-- rather than being cut off retroactively by the deploy.
UPDATE subscriptions
SET trial_ends_at = created_at + interval '14 days'
WHERE plan = 'free' AND trial_ends_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.workspaces (user_id, name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'workspace_name'), ''),
      SPLIT_PART(NEW.email, '@', 1),
      'My Workspace'
    )
  )
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.subscriptions (workspace_id, plan, status, trial_ends_at)
  VALUES (new_workspace_id, 'free', 'active', now() + interval '14 days');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_monthly_lead_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target record;
  sub_plan text;
  sub_trial_ends timestamptz;
  used integer;
  lim integer;
BEGIN
  FOR target IN SELECT DISTINCT workspace_id FROM new_leads LOOP
    SELECT s.plan, s.trial_ends_at
      INTO sub_plan, sub_trial_ends
    FROM subscriptions s
    WHERE s.workspace_id = target.workspace_id
      AND s.status = 'active'
    LIMIT 1;

    -- No active subscription means no paid entitlement, so fall back to free.
    sub_plan := COALESCE(sub_plan, 'free');

    -- A NULL window means the row predates trials; do not lock those out.
    IF sub_plan = 'free' AND sub_trial_ends IS NOT NULL AND sub_trial_ends < now() THEN
      RAISE EXCEPTION
        'Your free trial ended on %. Upgrade your plan to add more leads.',
        to_char(sub_trial_ends, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT pl.monthly_lead_limit INTO lim
    FROM plan_limits pl
    WHERE pl.plan = sub_plan;

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

REVOKE EXECUTE ON FUNCTION public.enforce_monthly_lead_limit() FROM PUBLIC, anon, authenticated;
