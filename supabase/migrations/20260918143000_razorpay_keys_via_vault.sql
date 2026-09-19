-- Store Razorpay keys for Edge Functions when project secrets cannot be set via CLI/MCP.
-- Edge Functions prefer Deno.env (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET); they fall back
-- to private.get_razorpay_keys() which reads from supabase_vault.
--
-- Values are provisioned on the target project (not committed here). Re-run on a fresh
-- project:
--   select vault.create_secret('<key_id>', 'RAZORPAY_KEY_ID', 'Razorpay Key ID');
--   select vault.create_secret('<secret>', 'RAZORPAY_KEY_SECRET', 'Razorpay Key Secret');

CREATE OR REPLACE FUNCTION private.get_razorpay_keys()
RETURNS TABLE (key_id text, key_secret text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'RAZORPAY_KEY_ID' LIMIT 1),
    (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.name = 'RAZORPAY_KEY_SECRET' LIMIT 1);
$$;

REVOKE ALL ON FUNCTION private.get_razorpay_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_razorpay_keys() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_razorpay_keys() TO service_role;

-- PostgREST does not expose the private schema to supabase-js, so Edge Functions
-- call this public wrapper (execute granted only to service_role).
CREATE OR REPLACE FUNCTION public.service_get_razorpay_keys()
RETURNS TABLE (key_id text, key_secret text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT k.key_id, k.key_secret FROM private.get_razorpay_keys() AS k;
$$;

REVOKE ALL ON FUNCTION public.service_get_razorpay_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_get_razorpay_keys() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_razorpay_keys() TO service_role;
