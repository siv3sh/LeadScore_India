/*
# Auto-create workspace and subscription on signup

## Problem
The client used to insert the `workspaces` row immediately after
`supabase.auth.signUp()`. When email confirmation is enabled, signUp returns a
user but no session, so that insert ran as `anon` and was rejected by the
owner-scoped RLS policy (42501). The account was created without a workspace,
leaving the dashboard unusable.

## Solution
Create the workspace and its free subscription server-side, in a SECURITY
DEFINER trigger on `auth.users`. This runs with the privileges of the function
owner, so it bypasses RLS and works whether or not a session exists at signup.

The workspace name comes from the `workspace_name` key in the signup metadata
(`options.data`), falling back to the email local part.
*/

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

  INSERT INTO public.subscriptions (workspace_id, plan, status)
  VALUES (new_workspace_id, 'free', 'active');

  RETURN NEW;
END;
$$;

-- Only the trigger should invoke this. Without these revokes it is reachable as
-- /rest/v1/rpc/handle_new_user by anon and authenticated callers.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
