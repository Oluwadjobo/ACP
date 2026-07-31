/*
# Add junction table for multiple tournées per Team Leader

## Overview
This migration introduces a many-to-many relationship between superviseurs
(Team Leaders) and secteurs (Tournées). Previously each superviseur had at most
one secteur_id; now a Team Leader can be assigned to multiple Tournées.

## New Tables
- `team_leader_tournees` (junction)
  - `id` (uuid PK)
  - `superviseur_id` (uuid FK → superviseurs, ON DELETE CASCADE)
  - `secteur_id` (uuid FK → secteurs, ON DELETE CASCADE)
  - `created_at` (timestamptz)
  - Unique constraint on (superviseur_id, secteur_id) to prevent duplicates

## Data Migration
Existing `secteur_id` values on `superviseurs` are copied into the junction
table so no assignments are lost.

## Security
- RLS enabled with deny-all policies (same pattern as all other tables —
  all access goes through the edge function service role).

## Important Notes
1. The `secteur_id` column on `superviseurs` is kept for backward compatibility
   but the junction table is now the source of truth for tournée assignments.
2. No destructive changes — all additions are additive.
*/

CREATE TABLE IF NOT EXISTS team_leader_tournees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superviseur_id uuid NOT NULL REFERENCES superviseurs(id) ON DELETE CASCADE,
  secteur_id uuid NOT NULL REFERENCES secteurs(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (superviseur_id, secteur_id)
);

ALTER TABLE team_leader_tournees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_team_leader_tournees" ON team_leader_tournees;
CREATE POLICY "deny_select_team_leader_tournees" ON team_leader_tournees FOR SELECT
  TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_team_leader_tournees" ON team_leader_tournees;
CREATE POLICY "deny_insert_team_leader_tournees" ON team_leader_tournees FOR INSERT
  TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_team_leader_tournees" ON team_leader_tournees;
CREATE POLICY "deny_update_team_leader_tournees" ON team_leader_tournees FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_team_leader_tournees" ON team_leader_tournees;
CREATE POLICY "deny_delete_team_leader_tournees" ON team_leader_tournees FOR DELETE
  TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_tlt_superviseur ON team_leader_tournees(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_tlt_secteur ON team_leader_tournees(secteur_id);

-- Migrate existing single secteur_id assignments into the junction table
INSERT INTO team_leader_tournees (superviseur_id, secteur_id)
SELECT id, secteur_id FROM superviseurs
WHERE secteur_id IS NOT NULL
ON CONFLICT (superviseur_id, secteur_id) DO NOTHING;

-- View for easy lookup of a team leader's tournées
DROP VIEW IF EXISTS team_leader_tournees_safe;
CREATE VIEW team_leader_tournees_safe
WITH (security_invoker = true) AS
  SELECT tlt.superviseur_id, tlt.secteur_id, s.nom AS secteur_nom, s.code AS secteur_code
  FROM team_leader_tournees tlt
  JOIN secteurs s ON tlt.secteur_id = s.id;