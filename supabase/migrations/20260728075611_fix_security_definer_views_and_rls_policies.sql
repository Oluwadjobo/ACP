/*
# Fix security issues: Security Definer views and RLS tables without policies

## Overview
This migration addresses two categories of security warnings:

1. **Security Definer Views**: The views `commerciaux_safe` and `admins_view`
   were created with `SECURITY DEFINER` (the historical Postgres default for
   views). This means they execute with the privileges of their owner rather
   than the caller, which can inadvertently expose data that RLS would
   otherwise restrict. They are recreated here with `SECURITY INVOKER` so they
   respect the caller's role and RLS policies.

2. **RLS Enabled No Policy**: The tables `admins`, `commerciaux`, `sessions`,
   and `visites` have RLS enabled but no policies defined. While this
   effectively locks them down (no anon/authenticated access), the lack of
   explicit policies is flagged as a security smell. Explicit deny-all
   policies are added here to document the intent: these tables are accessed
   exclusively through the `auth-api` edge function, which uses the service
   role key and bypasses RLS. No direct anon/authenticated access is intended.

## Changes

### Views (recreated with SECURITY INVOKER)
- `commerciaux_safe` — projection of `commerciaux` without `password_hash`
- `admins_view` — projection of `admins` without `password_hash`

### Policies (explicit deny-all, documenting intent)
- `admins`: SELECT/INSERT/UPDATE/DELETE denied for anon, authenticated
- `commerciaux`: SELECT/INSERT/UPDATE/DELETE denied for anon, authenticated
- `sessions`: SELECT/INSERT/UPDATE/DELETE denied for anon, authenticated
- `visites`: SELECT/INSERT/UPDATE/DELETE denied for anon, authenticated

## Important Notes
1. The deny-all policies use `USING (false)` / `WITH CHECK (false)`. This is
   intentional and correct: these tables must only be mutated through the edge
   function (service role), never directly from the browser with the anon key.
2. `points_vente` already has a proper anon SELECT policy and is not changed.
3. SECURITY INVOKER is now the Postgres 15+ default, but setting it explicitly
   guarantees correct behavior regardless of the database version.
*/

-- ============ FIX VIEWS: SECURITY INVOKER ============

DROP VIEW IF EXISTS commerciaux_safe;
CREATE VIEW commerciaux_safe
WITH (security_invoker = true) AS
  SELECT id, identifiant, full_name, active, created_at, updated_at
  FROM commerciaux;

DROP VIEW IF EXISTS admins_view;
CREATE VIEW admins_view
WITH (security_invoker = true) AS
  SELECT id, email, full_name, created_at FROM admins;

-- ============ ADMINS: explicit deny-all policies ============
-- No direct access from anon/authenticated. The edge function uses the
-- service role key, which bypasses RLS, to read/verify admin credentials.

DROP POLICY IF EXISTS "deny_select_admins" ON admins;
CREATE POLICY "deny_select_admins"
  ON admins FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_insert_admins" ON admins;
CREATE POLICY "deny_insert_admins"
  ON admins FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_admins" ON admins;
CREATE POLICY "deny_update_admins"
  ON admins FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_admins" ON admins;
CREATE POLICY "deny_delete_admins"
  ON admins FOR DELETE
  TO anon, authenticated
  USING (false);

-- ============ COMMERCIAUX: explicit deny-all policies ============
-- No direct access from anon/authenticated. All CRUD goes through the edge
-- function (service role). Password hashes must never leak to the client.

DROP POLICY IF EXISTS "deny_select_commerciaux" ON commerciaux;
CREATE POLICY "deny_select_commerciaux"
  ON commerciaux FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_insert_commerciaux" ON commerciaux;
CREATE POLICY "deny_insert_commerciaux"
  ON commerciaux FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_commerciaux" ON commerciaux;
CREATE POLICY "deny_update_commerciaux"
  ON commerciaux FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_commerciaux" ON commerciaux;
CREATE POLICY "deny_delete_commerciaux"
  ON commerciaux FOR DELETE
  TO anon, authenticated
  USING (false);

-- ============ SESSIONS: explicit deny-all policies ============
-- Session tokens must never be readable/writable from the client. The edge
-- function (service role) creates and validates sessions.

DROP POLICY IF EXISTS "deny_select_sessions" ON sessions;
CREATE POLICY "deny_select_sessions"
  ON sessions FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_insert_sessions" ON sessions;
CREATE POLICY "deny_insert_sessions"
  ON sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_sessions" ON sessions;
CREATE POLICY "deny_update_sessions"
  ON sessions FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_sessions" ON sessions;
CREATE POLICY "deny_delete_sessions"
  ON sessions FOR DELETE
  TO anon, authenticated
  USING (false);

-- ============ VISITES: explicit deny-all policies ============
-- All visit reads and writes go through the edge function (service role),
-- which validates the session token before inserting or returning data.
-- This prevents browser-side tampering with visit records.

DROP POLICY IF EXISTS "deny_select_visites" ON visites;
CREATE POLICY "deny_select_visites"
  ON visites FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_insert_visites" ON visites;
CREATE POLICY "deny_insert_visites"
  ON visites FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_visites" ON visites;
CREATE POLICY "deny_update_visites"
  ON visites FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_visites" ON visites;
CREATE POLICY "deny_delete_visites"
  ON visites FOR DELETE
  TO anon, authenticated
  USING (false);
