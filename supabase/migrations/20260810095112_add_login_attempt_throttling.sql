/*
  # Login attempt throttling

  1. New table
    - `login_attempts` — one row per (identifier, ip) pair recording consecutive
      failed sign-in attempts and an optional lockout expiry.
  2. Security
    - RLS enabled with deny-all policies for anon/authenticated; the table is
      written exclusively by the auth-api edge function via the service role.
*/

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  ip text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  first_attempt timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS login_attempts_identifier_ip_key
  ON login_attempts (identifier, ip);

CREATE INDEX IF NOT EXISTS login_attempts_updated_at_idx
  ON login_attempts (updated_at);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'login_attempts' AND policyname = 'deny_select_login_attempts') THEN
    CREATE POLICY "deny_select_login_attempts" ON login_attempts FOR SELECT TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'login_attempts' AND policyname = 'deny_insert_login_attempts') THEN
    CREATE POLICY "deny_insert_login_attempts" ON login_attempts FOR INSERT TO anon, authenticated WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'login_attempts' AND policyname = 'deny_update_login_attempts') THEN
    CREATE POLICY "deny_update_login_attempts" ON login_attempts FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'login_attempts' AND policyname = 'deny_delete_login_attempts') THEN
    CREATE POLICY "deny_delete_login_attempts" ON login_attempts FOR DELETE TO anon, authenticated USING (false);
  END IF;
END $$;
