/*
  One-time DATA backfill for multi-org. Schema lives in
  supabase/migrations/20260920180000_organizations.sql.

  Run via `npm run migrate:org` (preferred) or paste this into the Supabase
  SQL editor. Idempotent: a second run does not duplicate the default org or
  reassign rows that already have org_id.

  Additive only — no DELETE, no DROP, no overwrite of pre-org columns.
*/

DO $$
DECLARE
  default_org_id uuid;
  super_admin_id uuid;
  users_migrated integer := 0;
  workspaces_migrated integer := 0;
  uploads_migrated integer := 0;
  leads_migrated integer := 0;
  orphan_workspaces integer := 0;
  orphan_leads integer := 0;
  orphan_uploads integer := 0;
BEGIN
  -- 1. Default organization (exactly one row with is_default = true)
  SELECT id INTO default_org_id
  FROM public.organizations
  WHERE is_default
  LIMIT 1;

  IF default_org_id IS NULL THEN
    SELECT id INTO super_admin_id
    FROM public.profiles
    WHERE lower(email) IN ('hello@sivesh-pb.com', 'hello@sivesh')
    ORDER BY created_at
    LIMIT 1;

    INSERT INTO public.organizations (
      name, seat_limit, created_by, plan, contact_email, status, is_default
    )
    VALUES (
      'Sivesh Personal',
      25,
      super_admin_id,
      'pro',
      'hello@sivesh-pb.com',
      'active',
      true
    )
    RETURNING id INTO default_org_id;
  END IF;

  -- 2. Assign org_id only where it is currently null
  UPDATE public.profiles
  SET org_id = default_org_id
  WHERE org_id IS NULL;
  GET DIAGNOSTICS users_migrated = ROW_COUNT;

  UPDATE public.workspaces
  SET org_id = default_org_id
  WHERE org_id IS NULL;
  GET DIAGNOSTICS workspaces_migrated = ROW_COUNT;

  UPDATE public.uploads
  SET org_id = default_org_id
  WHERE org_id IS NULL;
  GET DIAGNOSTICS uploads_migrated = ROW_COUNT;

  UPDATE public.leads
  SET org_id = default_org_id
  WHERE org_id IS NULL;
  GET DIAGNOSTICS leads_migrated = ROW_COUNT;

  -- 3. Persist super_admin on the seeded account (do not rely on hardcoding alone)
  UPDATE public.profiles
  SET role = 'super_admin',
      is_admin = true
  WHERE lower(email) IN ('hello@sivesh-pb.com', 'hello@sivesh')
    AND (role IS DISTINCT FROM 'super_admin' OR is_admin IS DISTINCT FROM true);

  -- 4. Flag rows we cannot confidently assign (orphans), without guessing
  SELECT count(*) INTO orphan_workspaces
  FROM public.workspaces w
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.user_id);

  SELECT count(*) INTO orphan_leads
  FROM public.leads l
  WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = l.workspace_id);

  SELECT count(*) INTO orphan_uploads
  FROM public.uploads u
  WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = u.workspace_id);

  RAISE NOTICE 'migrate-org summary';
  RAISE NOTICE '  default_org_id=%', default_org_id;
  RAISE NOTICE '  users_migrated=%', users_migrated;
  RAISE NOTICE '  workspaces_migrated=%', workspaces_migrated;
  RAISE NOTICE '  uploads_migrated=%', uploads_migrated;
  RAISE NOTICE '  leads_migrated=%', leads_migrated;
  RAISE NOTICE '  orphan_workspaces=%', orphan_workspaces;
  RAISE NOTICE '  orphan_uploads=%', orphan_uploads;
  RAISE NOTICE '  orphan_leads=%', orphan_leads;
END $$;
