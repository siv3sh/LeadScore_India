/*
  # Profile photo

  Owners can upload one picture. Admin-ness stays locked: clients still cannot
  INSERT/DELETE profiles, and UPDATE is granted on avatar_url only. The
  existing reject_client_is_admin_change trigger continues to block flag edits.

  1. public.profiles.avatar_url
     - Public Storage URL, null until the user uploads.
     - UPDATE policy: own row only, WITH CHECK own row.

  2. storage.buckets.avatars
     - Public read so the dashboard <img> can load without a signed URL.
     - 2 MB + jpeg/png/webp, matching the client check.
     - Objects live at {user_id}/avatar. INSERT/UPDATE/DELETE only in that folder.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Public Storage URL for the user profile photo. Null until they upload one.';

GRANT UPDATE (avatar_url) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS update_own_avatar ON public.profiles;
CREATE POLICY update_own_avatar ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_select_public ON storage.objects;
CREATE POLICY avatars_select_public ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '/%'
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '/%'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '/%'
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '/%'
  );
