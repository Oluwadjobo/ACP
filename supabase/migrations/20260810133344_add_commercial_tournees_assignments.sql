/*
# Add multiple tournée assignments for commerciaux

1. New table
- `commercial_tournees` stores the many-to-many relationship between a commercial and one or more tournées.
- `commercial_id` identifies the commercial profile.
- `secteur_id` identifies the assigned tournée.
- `team_id` keeps the relationship isolated between YAOURT and EAU.
- `created_at` records when the assignment was made.

2. Integrity and compatibility
- Existing commercial profiles remain unchanged and keep their current supervisor relationship.
- Duplicate assignments are prevented per commercial, tournée, and team.
- Existing data is preserved; no existing rows are deleted or modified.

3. Security
- Row-level security is enabled.
- Anonymous and authenticated browser roles receive deny-all policies because the auth-api edge function is the sole data gateway.
*/

CREATE TABLE IF NOT EXISTS commercial_tournees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id uuid NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  secteur_id uuid NOT NULL REFERENCES secteurs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_tournees_unique_assignment
  ON commercial_tournees (commercial_id, secteur_id, team_id);

CREATE INDEX IF NOT EXISTS commercial_tournees_commercial_idx
  ON commercial_tournees (commercial_id, team_id);

CREATE INDEX IF NOT EXISTS commercial_tournees_secteur_idx
  ON commercial_tournees (secteur_id, team_id);

ALTER TABLE commercial_tournees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_commercial_tournees" ON commercial_tournees;
CREATE POLICY "deny_select_commercial_tournees" ON commercial_tournees FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_insert_commercial_tournees" ON commercial_tournees;
CREATE POLICY "deny_insert_commercial_tournees" ON commercial_tournees FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_commercial_tournees" ON commercial_tournees;
CREATE POLICY "deny_update_commercial_tournees" ON commercial_tournees FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_commercial_tournees" ON commercial_tournees;
CREATE POLICY "deny_delete_commercial_tournees" ON commercial_tournees FOR DELETE TO anon, authenticated USING (false);
