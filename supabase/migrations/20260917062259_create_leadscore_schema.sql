/*
# LeadScore India - Core Schema

## Overview
Creates the full database schema for LeadScore India, a predictive lead scoring SaaS.
Each authenticated user owns one workspace (brand). Users upload CSV files of leads,
the system scores them with an in-browser ML model, and stores scored leads for
viewing, filtering, and export.

## New Tables

1. `workspaces` - Each user's brand workspace (one per user in V1)
   - id (uuid PK)
   - user_id (uuid, FK auth.users, owner)
   - name (text, brand name)
   - created_at (timestamptz)

2. `subscriptions` - Tracks the user's subscription plan and billing state
   - id (uuid PK)
   - workspace_id (uuid, FK workspaces)
   - plan (text: 'free' | 'starter' | 'growth' | 'pro')
   - status (text: 'active' | 'inactive' | 'past_due' | 'cancelled')
   - current_period_end (timestamptz)
   - razorpay_subscription_id (text, nullable)
   - created_at, updated_at (timestamptz)

3. `uploads` - Metadata for each CSV upload
   - id (uuid PK)
   - workspace_id (uuid, FK workspaces)
   - file_name (text)
   - row_count (int)
   - status (text: 'processing' | 'completed' | 'failed')
   - model_auc (float, nullable - training metric)
   - conversion_rate (float, nullable)
   - created_at (timestamptz)

4. `leads` - Individual scored leads belonging to an upload
   - id (uuid PK)
   - upload_id (uuid, FK uploads)
   - workspace_id (uuid, FK workspaces)
   - lead_id (text, from CSV or generated)
   - name (text)
   - phone (text)
   - source (text)
   - created_at_lead (timestamptz, when the lead was created)
   - last_contacted_at (timestamptz, nullable)
   - order_value (float)
   - num_orders (int)
   - status (text)
   - conversion_probability (float, 0-1)
   - score_0_100 (int, 0-100)
   - priority (text: 'low' | 'medium' | 'high')
   - suggested_action (text)
   - created_at (timestamptz)

## Security
- RLS enabled on all tables.
- All tables are owner-scoped via workspace.user_id = auth.uid().
- Child tables (subscriptions, uploads, leads) check ownership through the
  workspace parent row.
- 4 separate policies per table (SELECT, INSERT, UPDATE, DELETE).
- No public access — all policies require authentication.
*/

-- ============================================================
-- WORKSPACES
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_workspaces" ON workspaces;
CREATE POLICY "select_own_workspaces" ON workspaces FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_workspaces" ON workspaces;
CREATE POLICY "insert_own_workspaces" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_workspaces" ON workspaces;
CREATE POLICY "update_own_workspaces" ON workspaces FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_workspaces" ON workspaces;
CREATE POLICY "delete_own_workspaces" ON workspaces FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'inactive',
  current_period_end timestamptz,
  razorpay_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions" ON subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;
CREATE POLICY "delete_own_subscriptions" ON subscriptions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = subscriptions.workspace_id AND workspaces.user_id = auth.uid())
  );

-- ============================================================
-- UPLOADS
-- ============================================================
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  model_auc float,
  conversion_rate float,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_uploads" ON uploads;
CREATE POLICY "select_own_uploads" ON uploads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_uploads" ON uploads;
CREATE POLICY "insert_own_uploads" ON uploads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_uploads" ON uploads;
CREATE POLICY "update_own_uploads" ON uploads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_uploads" ON uploads;
CREATE POLICY "delete_own_uploads" ON uploads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = uploads.workspace_id AND workspaces.user_id = auth.uid())
  );

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id text,
  name text,
  phone text,
  source text,
  created_at_lead timestamptz,
  last_contacted_at timestamptz,
  order_value float NOT NULL DEFAULT 0,
  num_orders int NOT NULL DEFAULT 0,
  status text,
  conversion_probability float,
  score_0_100 int,
  priority text,
  suggested_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_leads" ON leads;
CREATE POLICY "select_own_leads" ON leads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_leads" ON leads;
CREATE POLICY "insert_own_leads" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_leads" ON leads;
CREATE POLICY "update_own_leads" ON leads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_leads" ON leads;
CREATE POLICY "delete_own_leads" ON leads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = leads.workspace_id AND workspaces.user_id = auth.uid())
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_workspace_id ON uploads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_id ON leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_upload_id ON leads(upload_id);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(workspace_id, score_0_100 DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON subscriptions(workspace_id);