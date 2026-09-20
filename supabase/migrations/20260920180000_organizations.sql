/*
  # Multi-organization support (additive)

  Adds organizations and tenant scoping without removing existing single-tenant
  behaviour. Owner-scoped RLS on workspaces/leads stays. Super admin (is_admin)
  still sees every workspace. New org_admin policies let one user per org see
  that org's data only.

  This file is SCHEMA ONLY. Existing rows are backfilled by the manual command
  `npm run migrate:org` (scripts/migrate-org.ts) — never on server start.

  1. public.organizations
     - id, name, seat_limit, created_by, created_at, plan, contact_email, status
     - is_default: at most one default org, used by the backfill script

  2. Additive columns
     - profiles.org_id, profiles.role, profiles.must_change_password
     - workspaces.org_id, uploads.org_id, leads.org_id
     Existing columns (email, is_admin, user_id, …) are never dropped or
     overwritten by this migration.

  3. Privilege lock
     - Clients still cannot set is_admin, role, or org_id.
     - Clients may only flip must_change_password from true → false on their
       own row (after they actually change the password).

  4. RLS
     - Owner policies unchanged.
     - Org admin SELECT on org-scoped rows.
     - Super admin policies unchanged (private.is_admin() also treats
       role = 'super_admin' as admin).
*/

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seat_limit integer NOT NULL DEFAULT 5,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  plan text,
  contact_email text,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_seat_limit_check'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_seat_limit_check CHECK (seat_limit >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_status_check'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_one_default
  ON public.organizations (is_default)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS organizations_created_by_idx
  ON public.organizations (created_by);

COMMENT ON TABLE public.organizations IS
  'Tenant. Super admin creates these; org_admin and org_user belong to one.';

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT INSERT (name, seat_limit, created_by, plan, contact_email, status)
  ON TABLE public.organizations TO authenticated;
GRANT UPDATE (name, seat_limit, plan, contact_email, status)
  ON TABLE public.organizations TO authenticated;

-- ============================================================
-- ADDITIVE COLUMNS ON EXISTING TABLES
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'org_user';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('super_admin', 'org_admin', 'org_user'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles (org_id);

-- At most one org_admin per organization.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_org_admin
  ON public.profiles (org_id)
  WHERE role = 'org_admin' AND org_id IS NOT NULL;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspaces_org_id_idx ON public.workspaces (org_id);

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uploads_org_id_idx ON public.uploads (org_id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_org_id_idx ON public.leads (org_id);

-- ============================================================
-- PRIVATE HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.is_admin OR p.role = 'super_admin'
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.org_id
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.role
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
    ),
    'org_user'
  );
$$;

REVOKE ALL ON FUNCTION private.current_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- ============================================================
-- STAMP org_id ON INSERT (so clients need not remember it)
-- ============================================================
CREATE OR REPLACE FUNCTION public.stamp_workspace_org_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT p.org_id INTO NEW.org_id
    FROM public.profiles AS p
    WHERE p.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_stamp_org_id ON public.workspaces;
CREATE TRIGGER workspaces_stamp_org_id
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_workspace_org_id();

CREATE OR REPLACE FUNCTION public.stamp_child_org_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT w.org_id INTO NEW.org_id
    FROM public.workspaces AS w
    WHERE w.id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS uploads_stamp_org_id ON public.uploads;
CREATE TRIGGER uploads_stamp_org_id
  BEFORE INSERT ON public.uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_child_org_id();

DROP TRIGGER IF EXISTS leads_stamp_org_id ON public.leads;
CREATE TRIGGER leads_stamp_org_id
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_child_org_id();

CREATE OR REPLACE FUNCTION public.sync_org_id_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    UPDATE public.workspaces
    SET org_id = NEW.org_id
    WHERE user_id = NEW.id;

    UPDATE public.uploads
    SET org_id = NEW.org_id
    WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = NEW.id);

    UPDATE public.leads
    SET org_id = NEW.org_id
    WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_org_id ON public.profiles;
CREATE TRIGGER profiles_sync_org_id
  AFTER UPDATE OF org_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_org_id_from_profile();

REVOKE ALL ON FUNCTION public.stamp_workspace_org_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_child_org_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_org_id_from_profile() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- PRIVILEGE LOCK (role / org_id / is_admin / must_change_password)
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
    IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'org_user' THEN
      RAISE EXCEPTION 'role cannot be set through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role cannot be changed through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.org_id IS NOT NULL THEN
      RAISE EXCEPTION 'org_id cannot be set through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'org_id cannot be changed through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.must_change_password IS TRUE THEN
      RAISE EXCEPTION 'must_change_password cannot be set through the application'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.must_change_password IS TRUE
       AND OLD.must_change_password IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'must_change_password cannot be set through the application'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Signup still creates a non-admin org_user. org_id is filled later by the
-- admin create-user path (service_role) or by the backfill script.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, is_admin, role, must_change_password)
  VALUES (NEW.id, COALESCE(NEW.email, ''), false, 'org_user', false);

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
-- RPCs: password-change completion + org-admin assignment
-- ============================================================
GRANT UPDATE (avatar_url, must_change_password) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET must_change_password = false
  WHERE id = (SELECT auth.uid())
    AND must_change_password = true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_password_change() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_org_admin(target_user_id uuid, make_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.profiles%ROWTYPE;
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target
  FROM public.profiles
  WHERE id = target_user_id;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF target.is_admin OR target.role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot change the super admin role';
  END IF;

  IF target.org_id IS NULL THEN
    RAISE EXCEPTION 'this user is not in an organization';
  END IF;

  IF make_admin THEN
    UPDATE public.profiles
    SET role = 'org_user'
    WHERE org_id = target.org_id
      AND role = 'org_admin'
      AND id <> target_user_id;

    UPDATE public.profiles
    SET role = 'org_admin'
    WHERE id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET role = 'org_user'
    WHERE id = target_user_id
      AND role = 'org_admin';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_admin(uuid, boolean) TO authenticated;

-- ============================================================
-- RLS: ORGANIZATIONS
-- ============================================================
DROP POLICY IF EXISTS select_own_organization ON public.organizations;
CREATE POLICY select_own_organization ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id = (SELECT private.current_org_id())
    OR (SELECT private.is_admin())
  );

DROP POLICY IF EXISTS insert_orgs_as_super_admin ON public.organizations;
CREATE POLICY insert_orgs_as_super_admin ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS update_orgs_as_super_admin ON public.organizations;
CREATE POLICY update_orgs_as_super_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

-- ============================================================
-- RLS: ORG ADMIN READS ORG-SCOPED DATA
-- Owner policies and super-admin policies are unchanged.
-- ============================================================
DROP POLICY IF EXISTS select_org_profiles_as_org_admin ON public.profiles;
CREATE POLICY select_org_profiles_as_org_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT private.current_role()) = 'org_admin'
    AND org_id IS NOT NULL
    AND org_id = (SELECT private.current_org_id())
  );

DROP POLICY IF EXISTS select_org_workspaces_as_org_admin ON public.workspaces;
CREATE POLICY select_org_workspaces_as_org_admin ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    (SELECT private.current_role()) = 'org_admin'
    AND org_id IS NOT NULL
    AND org_id = (SELECT private.current_org_id())
  );

DROP POLICY IF EXISTS select_org_subscriptions_as_org_admin ON public.subscriptions;
CREATE POLICY select_org_subscriptions_as_org_admin ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = subscriptions.workspace_id
        AND w.org_id IS NOT NULL
        AND w.org_id = (SELECT private.current_org_id())
        AND (SELECT private.current_role()) = 'org_admin'
    )
  );

DROP POLICY IF EXISTS select_org_uploads_as_org_admin ON public.uploads;
CREATE POLICY select_org_uploads_as_org_admin ON public.uploads
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = (SELECT private.current_org_id())
    AND (SELECT private.current_role()) = 'org_admin'
  );

DROP POLICY IF EXISTS select_org_leads_as_org_admin ON public.leads;
CREATE POLICY select_org_leads_as_org_admin ON public.leads
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = (SELECT private.current_org_id())
    AND (SELECT private.current_role()) = 'org_admin'
  );
