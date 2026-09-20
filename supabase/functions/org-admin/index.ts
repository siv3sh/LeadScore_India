import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

type AdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  }
  return out;
}

function slugPart(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
  return slug || 'org';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface Caller {
  id: string;
  role: string;
  is_admin: boolean;
  org_id: string | null;
}

function isSuperAdmin(caller: Caller): boolean {
  return caller.is_admin || caller.role === 'super_admin';
}

async function loadCaller(admin: AdminClient, userId: string): Promise<Caller | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, role, is_admin, org_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Caller;
}

/**
 * TODO: Connect an email provider (Resend, SES, or Supabase Auth SMTP) and
 * send the temporary password. Nothing in this repo currently sends
 * transactional mail besides Auth's own confirmation emails.
 */
function stubTempPasswordEmail(to: string, orgName: string): void {
  console.log(
    JSON.stringify({
      level: 'warn',
      msg: 'TODO: email stub — temp password not sent',
      to,
      orgName,
    })
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const caller = await loadCaller(admin, userData.user.id);
    if (!caller) {
      return json({ error: 'Profile not found' }, 403);
    }
    if (!isSuperAdmin(caller) && caller.role !== 'org_admin') {
      return json({ error: 'Not authorized to create users' }, 403);
    }

    const body = await req.json();
    if (body?.action !== 'create_user') {
      return json({ error: 'Unknown action' }, 400);
    }

    const orgId = typeof body.org_id === 'string' ? body.org_id : '';
    const mode = body.credential_mode === 'email' ? 'email' : 'generate';
    const workspaceName =
      typeof body.workspace_name === 'string' ? body.workspace_name.trim() : '';

    if (!orgId) {
      return json({ error: 'Missing org_id' }, 400);
    }

    if (!isSuperAdmin(caller) && caller.org_id !== orgId) {
      return json({ error: 'You can only add users to your own organization' }, 403);
    }

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id, name, seat_limit, status')
      .eq('id', orgId)
      .maybeSingle();

    if (orgError || !org) {
      return json({ error: 'Organization not found' }, 404);
    }
    if (org.status !== 'active') {
      return json({ error: 'This organization is inactive' }, 400);
    }

    const { count: seatCount, error: countError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('role', 'super_admin');

    if (countError) {
      return json({ error: 'Could not check seat usage' }, 500);
    }
    if ((seatCount ?? 0) >= org.seat_limit) {
      return json(
        { error: `Seat limit reached (${org.seat_limit}). Ask the super admin to add seats.` },
        400
      );
    }

    let email: string;
    if (mode === 'email') {
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!isEmail(email)) {
        return json({ error: 'Enter a valid personal email address' }, 400);
      }
    } else {
      email = `u${randomChars(8).toLowerCase()}@${slugPart(org.name)}.leadai.local`;
    }

    const password = randomChars(12);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        workspace_name: workspaceName || org.name,
      },
    });

    if (createError || !created.user) {
      return json({ error: createError?.message ?? 'Could not create the login' }, 400);
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        org_id: orgId,
        role: 'org_user',
        must_change_password: true,
        email,
      })
      .eq('id', created.user.id);

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: `User created but profile update failed: ${profileError.message}` }, 500);
    }

    let emailStubbed = false;
    if (mode === 'email') {
      stubTempPasswordEmail(email, org.name);
      emailStubbed = true;
    }

    return json(
      {
        user_id: created.user.id,
        email,
        password,
        email_stubbed: emailStubbed,
      },
      200
    );
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unexpected error creating the user' },
      500
    );
  }
});
