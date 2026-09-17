/*
  # Admin profiles and cross-workspace RLS

  Admin-ness is a flag on an existing Auth user, not a second login.

  1. New objects
     - `private` schema: not exposed via the Data API. Holds `is_admin()`.
     - `public.profiles` (id = auth.users.id, email, is_admin default false):
       the only place the flag lives. Authenticated clients get SELECT only.
     - `private.is_admin()`: SECURITY DEFINER lookup of the caller's own row,
       so policies can grant cross-workspace access without recursing through
       `workspaces` RLS.

  2. Write lock on is_admin
     - No INSERT/UPDATE/DELETE policies on `profiles`.
     - UPDATE/INSERT/DELETE revoked from anon and authenticated.
     - Trigger rejects is_admin changes from authenticated/anon/authenticator.
       The SQL editor (postgres) can still set the flag.

  3. RLS
     - Extra PERMISSIVE SELECT policies for admins on workspaces, subscriptions,
       uploads, leads, and profiles. Owner policies are unchanged.
     - Admin UPDATE on subscriptions only (plan, status, updated_at).
     - Owner UPDATE on subscriptions is dropped: a customer could previously
       PATCH their own plan from the client. Razorpay still uses service_role,
       which bypasses RLS.

  4. Signup
     - `handle_new_user` also inserts a non-admin profile. Existing users are
       backfilled with is_admin = false.
*/

-- ============================================================
-- PRIVATE SCHEMA + HELPER
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO postgres, authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_email_lower_idx ON public.profiles (lower(email));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

INSERT INTO public.profiles (id, email, is_admin)
SELECT u.id, COALESCE(u.email, ''), false
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.is_admin
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- ============================================================
-- is_admin CANNOT BE SET THROUGH THE APP
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_client_is_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
    IF TG_OP = 'INSERT' AND NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'is_admin cannot be set through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'is_admin cannot be changed through the application'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_client_is_admin_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_reject_client_is_admin_change ON public.profiles;
CREATE TRIGGER profiles_reject_client_is_admin_change
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_client_is_admin_change();

-- ============================================================
-- SIGNUP ALSO CREATES A NON-ADMIN PROFILE
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, is_admin)
  VALUES (NEW.id, COALESCE(NEW.email, ''), false);

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

-- ============================================================
-- RLS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "select_all_profiles_as_admin" ON public.profiles;
CREATE POLICY "select_all_profiles_as_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "select_all_workspaces_as_admin" ON public.workspaces;
CREATE POLICY "select_all_workspaces_as_admin" ON public.workspaces
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "select_all_subscriptions_as_admin" ON public.subscriptions;
CREATE POLICY "select_all_subscriptions_as_admin" ON public.subscriptions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "select_all_uploads_as_admin" ON public.uploads;
CREATE POLICY "select_all_uploads_as_admin" ON public.uploads
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "select_all_leads_as_admin" ON public.leads;
CREATE POLICY "select_all_leads_as_admin" ON public.leads
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

-- Owners can no longer PATCH their own plan from the client.
DROP POLICY IF EXISTS "update_own_subscriptions" ON public.subscriptions;

DROP POLICY IF EXISTS "update_subscriptions_as_admin" ON public.subscriptions;
CREATE POLICY "update_subscriptions_as_admin" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

REVOKE UPDATE ON TABLE public.subscriptions FROM anon, authenticated;
GRANT UPDATE (plan, status, updated_at) ON public.subscriptions TO authenticated;
