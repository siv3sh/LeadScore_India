/*
# Optimize RLS policies to evaluate auth.uid() once per query

## Problem
Every policy called `auth.uid()` directly, which Postgres treats as volatile in
this context and re-evaluates for each candidate row. On `leads`, which is sized
for tens of thousands of rows per workspace, that is a per-row function call.

## Solution
Wrap the call as `(select auth.uid())` so the planner evaluates it once and
treats it as a constant (an InitPlan). This is Supabase's documented fix for the
`auth_rls_initplan` linter warning:
https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

The access rules are unchanged — only how often the value is computed.
*/

-- ============================================================
-- WORKSPACES
-- ============================================================
DROP POLICY IF EXISTS "select_own_workspaces" ON workspaces;
CREATE POLICY "select_own_workspaces" ON workspaces FOR SELECT
  TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "insert_own_workspaces" ON workspaces;
CREATE POLICY "insert_own_workspaces" ON workspaces FOR INSERT
  TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "update_own_workspaces" ON workspaces;
CREATE POLICY "update_own_workspaces" ON workspaces FOR UPDATE
  TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "delete_own_workspaces" ON workspaces;
CREATE POLICY "delete_own_workspaces" ON workspaces FOR DELETE
  TO authenticated USING ((select auth.uid()) = user_id);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions" ON subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;
CREATE POLICY "delete_own_subscriptions" ON subscriptions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

-- ============================================================
-- UPLOADS
-- ============================================================
DROP POLICY IF EXISTS "select_own_uploads" ON uploads;
CREATE POLICY "select_own_uploads" ON uploads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "insert_own_uploads" ON uploads;
CREATE POLICY "insert_own_uploads" ON uploads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "update_own_uploads" ON uploads;
CREATE POLICY "update_own_uploads" ON uploads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "delete_own_uploads" ON uploads;
CREATE POLICY "delete_own_uploads" ON uploads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

-- ============================================================
-- LEADS
-- ============================================================
DROP POLICY IF EXISTS "select_own_leads" ON leads;
CREATE POLICY "select_own_leads" ON leads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "insert_own_leads" ON leads;
CREATE POLICY "insert_own_leads" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "update_own_leads" ON leads;
CREATE POLICY "update_own_leads" ON leads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "delete_own_leads" ON leads;
CREATE POLICY "delete_own_leads" ON leads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = (select auth.uid()))
  );
