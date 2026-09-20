/**
 * One-time DATA backfill for multi-org support.
 *
 * Schema is applied separately (supabase/migrations/20260920180000_organizations.sql).
 * This script never runs on server start — invoke it yourself:
 *
 *   npm run migrate:org
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL or SUPABASE_URL).
 * If the service role key is missing, it prints the SQL file path instead of
 * guessing. Idempotent: a second run does not duplicate the default org or
 * reassign rows that already have org_id.
 *
 * Rollback: see docs/ORG.md. This script only ADDS org_id / role values; it
 * does not delete or overwrite pre-org columns.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPER_ADMIN_EMAILS = ['hello@sivesh-pb.com', 'hello@sivesh'] as const;
const DEFAULT_ORG_NAME = 'Sivesh Personal';
const SQL_FALLBACK = resolve(dirname(fileURLToPath(import.meta.url)), 'migrate-org.sql');

interface OrganizationRow {
  id: string;
  name: string;
  is_default: boolean;
}

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function countNullOrg(
  admin: SupabaseClient,
  table: 'profiles' | 'workspaces' | 'uploads' | 'leads'
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('org_id', null);
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

async function assignNullOrg(
  admin: SupabaseClient,
  table: 'profiles' | 'workspaces' | 'uploads' | 'leads',
  orgId: string
): Promise<number> {
  const before = await countNullOrg(admin, table);
  if (before === 0) return 0;
  const { error } = await admin.from(table).update({ org_id: orgId }).is('org_id', null);
  if (error) throw new Error(`Could not backfill ${table}.org_id: ${error.message}`);
  return before;
}

async function countOrphans(
  admin: SupabaseClient,
  table: 'workspaces' | 'uploads' | 'leads'
): Promise<number> {
  if (table === 'workspaces') {
    const { data, error } = await admin.from('workspaces').select('id, user_id');
    if (error) throw new Error(`Could not inspect workspaces: ${error.message}`);
    const { data: profiles, error: profileError } = await admin.from('profiles').select('id');
    if (profileError) throw new Error(`Could not inspect profiles: ${profileError.message}`);
    const ids = new Set((profiles ?? []).map((row) => row.id as string));
    return (data ?? []).filter((row) => !ids.has(row.user_id as string)).length;
  }

  const { data, error } = await admin.from(table).select('id, workspace_id');
  if (error) throw new Error(`Could not inspect ${table}: ${error.message}`);
  const { data: workspaces, error: wsError } = await admin.from('workspaces').select('id');
  if (wsError) throw new Error(`Could not inspect workspaces: ${wsError.message}`);
  const ids = new Set((workspaces ?? []).map((row) => row.id as string));
  return (data ?? []).filter((row) => !ids.has(row.workspace_id as string)).length;
}

async function run(): Promise<void> {
  if (!url || !serviceKey) {
    fail(
      [
        'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.',
        'Add the service role key to .env for this one-off command — never put it in VITE_*.',
        `Or paste this SQL into the Supabase SQL editor:\n  ${SQL_FALLBACK}`,
      ].join('\n')
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await admin
    .from('organizations')
    .select('id, name, is_default')
    .eq('is_default', true)
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(
      `Could not read organizations (did the schema migration run?): ${existingError.message}`
    );
  }

  let org = existing as OrganizationRow | null;

  if (!org) {
    const { data: superAdmin } = await admin
      .from('profiles')
      .select('id, email')
      .in('email', [...SUPER_ADMIN_EMAILS]);

    const createdBy = superAdmin?.[0]?.id ?? null;

    const { data: created, error: createError } = await admin
      .from('organizations')
      .insert({
        name: DEFAULT_ORG_NAME,
        seat_limit: 25,
        created_by: createdBy,
        plan: 'pro',
        contact_email: 'hello@sivesh-pb.com',
        status: 'active',
        is_default: true,
      })
      .select('id, name, is_default')
      .single();

    if (createError || !created) {
      throw new Error(`Could not create the default organization: ${createError?.message ?? 'unknown error'}`);
    }
    org = created as OrganizationRow;
    console.log(`Created default organization "${org.name}" (${org.id})`);
  } else {
    console.log(`Default organization already exists: "${org.name}" (${org.id})`);
  }

  const usersMigrated = await assignNullOrg(admin, 'profiles', org.id);
  const workspacesMigrated = await assignNullOrg(admin, 'workspaces', org.id);
  const uploadsMigrated = await assignNullOrg(admin, 'uploads', org.id);
  const leadsMigrated = await assignNullOrg(admin, 'leads', org.id);

  const { data: superAdmins, error: superError } = await admin
    .from('profiles')
    .select('id, email, role, is_admin')
    .in('email', [...SUPER_ADMIN_EMAILS]);

  if (superError) {
    throw new Error(`Could not load super-admin candidates: ${superError.message}`);
  }

  let superAdminUpdated = 0;
  for (const row of superAdmins ?? []) {
    if (row.role === 'super_admin' && row.is_admin === true) continue;
    const { error } = await admin
      .from('profiles')
      .update({ role: 'super_admin', is_admin: true })
      .eq('id', row.id);
    if (error) {
      throw new Error(`Could not persist super_admin on ${row.email}: ${error.message}`);
    }
    superAdminUpdated += 1;
  }

  if ((superAdmins ?? []).length === 0) {
    console.warn(
      'FLAG: no profile matched hello@sivesh-pb.com / hello@sivesh — super_admin was not persisted.'
    );
  }

  const orphanWorkspaces = await countOrphans(admin, 'workspaces');
  const orphanUploads = await countOrphans(admin, 'uploads');
  const orphanLeads = await countOrphans(admin, 'leads');

  console.log('');
  console.log('migrate-org summary');
  console.log(`  default_org_id:        ${org.id}`);
  console.log(`  users_migrated:        ${usersMigrated}`);
  console.log(`  workspaces_migrated:   ${workspacesMigrated}`);
  console.log(`  uploads_migrated:      ${uploadsMigrated}`);
  console.log(`  leads_migrated:        ${leadsMigrated}`);
  console.log(`  super_admin_updated:   ${superAdminUpdated}`);
  console.log(`  orphan_workspaces:     ${orphanWorkspaces}`);
  console.log(`  orphan_uploads:        ${orphanUploads}`);
  console.log(`  orphan_leads:          ${orphanLeads}`);

  if (orphanWorkspaces + orphanUploads + orphanLeads > 0) {
    console.warn(
      'FLAG: orphan rows were left untouched rather than guessed. Inspect them before merging.'
    );
  }
}

run().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
