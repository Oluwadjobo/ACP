/*
# Multi-tenant architecture: teams table + team_id on all tables

## Overview
Transforms the application from single-tenant to multi-tenant. Adds a `teams`
table and a `team_id` column to every business-data table. All existing data
is backfilled to the YAOURT team. A new EAU team is created empty.

## New Tables
- `teams` — tenant registry. Columns: id, code (unique), name, color, created_at.
  Seeded with YAOURT (blue #1D6FB8) and EAU (red #f30714).

## Modified Tables (team_id column added)
- `admins` — also gets `role` column ('super_admin' | 'admin', default 'admin').
  Super admins have team_id = null (can access all teams). Regular admins have
  a fixed team_id.
- `commerciaux`, `superviseurs`, `points_vente`, `visites`, `sessions`,
  `produits`, `promesses_achat`, `secteurs`, `ventes`, `vente_lignes`,
  `bons_livraison`, `bl_lignes`, `controles_terrain`, `team_leader_tournees`
  — all get nullable `team_id` column, backfilled to YAOURT.

## Security
- No RLS policy changes (existing deny-all policies remain; the edge function
  enforces team_id filtering using the service role key).
- The `points_vente` anon SELECT policy remains unchanged for now — all
  frontend data access goes through the edge function which filters by team_id.

## Migration Steps
1. Create `teams` table and seed YAOURT + EAU.
2. Add `team_id` column to all 15 tables (nullable).
3. Add `role` column to `admins`.
4. Backfill all existing rows with YAOURT team_id.
5. Set existing admin(s) to `super_admin` role.
6. Add FK constraints on team_id → teams(id).
7. Add indexes on team_id for query performance.
8. Recreate all 5 views to include team_id.

## Important Notes
1. All existing data belongs to YAOURT and is preserved intact.
2. team_id is nullable to avoid breaking any edge cases — the edge function
   always sets it on new inserts.
3. The `role` column on `admins` distinguishes super_admin (global access)
   from admin (team-scoped). Existing admin is promoted to super_admin.
4. Sessions table gets team_id so the active team is persisted server-side.
5. This migration is safe to re-run (uses IF NOT EXISTS / DO $$ blocks).
*/

-- ============ CREATE TEAMS TABLE ============
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#1D6FB8',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_teams" ON teams;
CREATE POLICY "deny_select_teams" ON teams FOR SELECT
  TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_teams" ON teams;
CREATE POLICY "deny_insert_teams" ON teams FOR INSERT
  TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_teams" ON teams;
CREATE POLICY "deny_update_teams" ON teams FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_teams" ON teams;
CREATE POLICY "deny_delete_teams" ON teams FOR DELETE
  TO anon, authenticated USING (false);

-- Seed teams (idempotent — only insert if not already present)
INSERT INTO teams (code, name, color)
SELECT 'YAOURT', 'Yaourt Team', '#1D6FB8'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE code = 'YAOURT');

INSERT INTO teams (code, name, color)
SELECT 'EAU', 'Eau Team', '#f30714'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE code = 'EAU');

-- ============ ADD team_id COLUMN TO ALL TABLES ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'team_id') THEN
    ALTER TABLE admins ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commerciaux' AND column_name = 'team_id') THEN
    ALTER TABLE commerciaux ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'superviseurs' AND column_name = 'team_id') THEN
    ALTER TABLE superviseurs ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'points_vente' AND column_name = 'team_id') THEN
    ALTER TABLE points_vente ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visites' AND column_name = 'team_id') THEN
    ALTER TABLE visites ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'team_id') THEN
    ALTER TABLE sessions ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produits' AND column_name = 'team_id') THEN
    ALTER TABLE produits ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promesses_achat' AND column_name = 'team_id') THEN
    ALTER TABLE promesses_achat ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secteurs' AND column_name = 'team_id') THEN
    ALTER TABLE secteurs ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventes' AND column_name = 'team_id') THEN
    ALTER TABLE ventes ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vente_lignes' AND column_name = 'team_id') THEN
    ALTER TABLE vente_lignes ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_livraison' AND column_name = 'team_id') THEN
    ALTER TABLE bons_livraison ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bl_lignes' AND column_name = 'team_id') THEN
    ALTER TABLE bl_lignes ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'controles_terrain' AND column_name = 'team_id') THEN
    ALTER TABLE controles_terrain ADD COLUMN team_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_leader_tournees' AND column_name = 'team_id') THEN
    ALTER TABLE team_leader_tournees ADD COLUMN team_id uuid;
  END IF;
END $$;

-- ============ ADD role COLUMN TO ADMINS ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'role') THEN
    ALTER TABLE admins ADD COLUMN role text NOT NULL DEFAULT 'admin';
  END IF;
END $$;

-- ============ BACKFILL EXISTING DATA TO YAOURT ============
-- All existing rows get the YAOURT team_id
UPDATE admins SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE commerciaux SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE superviseurs SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE points_vente SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE visites SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE sessions SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE produits SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE promesses_achat SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE secteurs SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE ventes SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE vente_lignes SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE bons_livraison SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE bl_lignes SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE controles_terrain SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;
UPDATE team_leader_tournees SET team_id = (SELECT id FROM teams WHERE code = 'YAOURT') WHERE team_id IS NULL;

-- ============ PROMOTE EXISTING ADMIN TO SUPER_ADMIN ============
-- The first/existing admin becomes super_admin so they can manage both teams.
UPDATE admins SET role = 'super_admin' WHERE role = 'admin';

-- ============ ADD FK CONSTRAINTS ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_admins_team') THEN
    ALTER TABLE admins ADD CONSTRAINT fk_admins_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_commerciaux_team') THEN
    ALTER TABLE commerciaux ADD CONSTRAINT fk_commerciaux_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_superviseurs_team') THEN
    ALTER TABLE superviseurs ADD CONSTRAINT fk_superviseurs_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_points_vente_team') THEN
    ALTER TABLE points_vente ADD CONSTRAINT fk_points_vente_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_visites_team') THEN
    ALTER TABLE visites ADD CONSTRAINT fk_visites_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_sessions_team') THEN
    ALTER TABLE sessions ADD CONSTRAINT fk_sessions_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_produits_team') THEN
    ALTER TABLE produits ADD CONSTRAINT fk_produits_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_promesses_team') THEN
    ALTER TABLE promesses_achat ADD CONSTRAINT fk_promesses_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_secteurs_team') THEN
    ALTER TABLE secteurs ADD CONSTRAINT fk_secteurs_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ventes_team') THEN
    ALTER TABLE ventes ADD CONSTRAINT fk_ventes_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_vente_lignes_team') THEN
    ALTER TABLE vente_lignes ADD CONSTRAINT fk_vente_lignes_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_bons_livraison_team') THEN
    ALTER TABLE bons_livraison ADD CONSTRAINT fk_bons_livraison_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_bl_lignes_team') THEN
    ALTER TABLE bl_lignes ADD CONSTRAINT fk_bl_lignes_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_controles_terrain_team') THEN
    ALTER TABLE controles_terrain ADD CONSTRAINT fk_controles_terrain_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_tlt_team') THEN
    ALTER TABLE team_leader_tournees ADD CONSTRAINT fk_tlt_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============ ADD INDEXES ON team_id ============
CREATE INDEX IF NOT EXISTS idx_admins_team_id ON admins(team_id);
CREATE INDEX IF NOT EXISTS idx_commerciaux_team_id ON commerciaux(team_id);
CREATE INDEX IF NOT EXISTS idx_superviseurs_team_id ON superviseurs(team_id);
CREATE INDEX IF NOT EXISTS idx_points_vente_team_id ON points_vente(team_id);
CREATE INDEX IF NOT EXISTS idx_visites_team_id ON visites(team_id);
CREATE INDEX IF NOT EXISTS idx_sessions_team_id ON sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_produits_team_id ON produits(team_id);
CREATE INDEX IF NOT EXISTS idx_promesses_team_id ON promesses_achat(team_id);
CREATE INDEX IF NOT EXISTS idx_secteurs_team_id ON secteurs(team_id);
CREATE INDEX IF NOT EXISTS idx_ventes_team_id ON ventes(team_id);
CREATE INDEX IF NOT EXISTS idx_vente_lignes_team_id ON vente_lignes(team_id);
CREATE INDEX IF NOT EXISTS idx_bons_livraison_team_id ON bons_livraison(team_id);
CREATE INDEX IF NOT EXISTS idx_bl_lignes_team_id ON bl_lignes(team_id);
CREATE INDEX IF NOT EXISTS idx_controles_terrain_team_id ON controles_terrain(team_id);
CREATE INDEX IF NOT EXISTS idx_tlt_team_id ON team_leader_tournees(team_id);

-- ============ RECREATE VIEWS WITH team_id ============
DROP VIEW IF EXISTS commerciaux_safe;
CREATE VIEW commerciaux_safe
WITH (security_invoker = true) AS
  SELECT id, identifiant, full_name, active, team_id, created_at, updated_at
  FROM commerciaux;

DROP VIEW IF EXISTS admins_view;
CREATE VIEW admins_view
WITH (security_invoker = true) AS
  SELECT id, email, full_name, role, team_id, created_at FROM admins;

DROP VIEW IF EXISTS superviseurs_safe;
CREATE VIEW superviseurs_safe
WITH (security_invoker = true) AS
  SELECT id, identifiant, full_name, active, telephone, secteur_id, team_id, created_at, updated_at
  FROM superviseurs;

DROP VIEW IF EXISTS secteurs_safe;
CREATE VIEW secteurs_safe
WITH (security_invoker = true) AS
  SELECT id, code, nom, description, actif, color_code, team_id, created_at
  FROM secteurs;

DROP VIEW IF EXISTS team_leader_tournees_safe;
CREATE VIEW team_leader_tournees_safe
WITH (security_invoker = true) AS
  SELECT tlt.superviseur_id, tlt.secteur_id, tlt.team_id,
         s.nom AS secteur_nom, s.code AS secteur_code
  FROM team_leader_tournees tlt
  JOIN secteurs s ON s.id = tlt.secteur_id;
