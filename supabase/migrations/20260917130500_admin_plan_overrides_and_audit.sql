/*
  # Manual plan overrides, with an audit trail

  1. New column
     - `subscriptions.plan_source`: 'razorpay' when a payment activated the plan,
       'manual' when an admin granted it, NULL for an untouched signup row.
       Nullable on purpose — a free signup is neither paid for nor granted, and
       labelling it 'razorpay' would be false. Nothing reads it yet; it exists so
       a future renewal check can avoid clobbering a manual grant.

  2. New table
     - `admin_actions`: one row per admin write, capturing who, which workspace,
       the before and after values, and a required note. Insert-only — there are
       no UPDATE or DELETE policies, so the app cannot rewrite history.

  3. Grants
     - The admin subscription UPDATE grant widens to the fields an override sets:
       current_period_end (the window the admin chooses), trial_ends_at, and
       plan_source. razorpay_subscription_id and workspace_id stay ungranted, so
       an override cannot re-point a row at another workspace or forge a payment.

  Note on enforcement: for a free plan, `trial_ends_at` is enforced by
  enforce_monthly_lead_limit. For a paid plan, `current_period_end` is recorded
  but NOT enforced — there is still no renewal check, by prior decision.
*/

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_source text;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_source_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_source_check
  CHECK (plan_source IS NULL OR plan_source IN ('razorpay', 'manual'));

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  -- A blank note defeats the point of the trail, so emptiness is rejected here
  -- rather than only in the form.
  note text NOT NULL CHECK (length(btrim(note)) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_workspace
  ON public.admin_actions (target_workspace_id, created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_actions TO authenticated;

DROP POLICY IF EXISTS "select_admin_actions_as_admin" ON public.admin_actions;
CREATE POLICY "select_admin_actions_as_admin" ON public.admin_actions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

-- admin_user_id is pinned to the caller, so one admin cannot write an entry
-- attributed to another.
DROP POLICY IF EXISTS "insert_admin_actions_as_admin" ON public.admin_actions;
CREATE POLICY "insert_admin_actions_as_admin" ON public.admin_actions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND admin_user_id = (SELECT auth.uid()));

GRANT UPDATE (plan, status, current_period_end, trial_ends_at, plan_source, updated_at)
  ON public.subscriptions TO authenticated;
