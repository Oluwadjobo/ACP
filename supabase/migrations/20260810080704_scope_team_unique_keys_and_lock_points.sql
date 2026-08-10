/*
# Scope tenant identifiers and close direct point-of-sale exposure

## Overview
Allows separate teams to use the same business identifiers where that is
valid, while keeping globally unique security and database identifiers.

## Modified uniqueness
- `commerciaux.identifiant`, `superviseurs.identifiant`, `points_vente.code`,
  `produits.nom`, and `secteurs.code` are now unique within a team.
- `admins.email` and `points_vente.qr_token` remain globally unique because
  they identify login accounts and QR credentials across the application.

## Security
- Direct browser reads of `points_vente` are denied. QR resolution and all
  point-of-sale reads continue through the authenticated edge function, which
  applies the active team's filter.
- Existing data is preserved; only uniqueness constraints and access policies
  change.
*/

ALTER TABLE commerciaux DROP CONSTRAINT IF EXISTS commerciaux_identifiant_key;
ALTER TABLE superviseurs DROP CONSTRAINT IF EXISTS superviseurs_identifiant_key;
ALTER TABLE points_vente DROP CONSTRAINT IF EXISTS points_vente_code_key;
ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_nom_key;
ALTER TABLE secteurs DROP CONSTRAINT IF EXISTS secteurs_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS commerciaux_team_identifiant_key ON commerciaux(team_id, identifiant);
CREATE UNIQUE INDEX IF NOT EXISTS superviseurs_team_identifiant_key ON superviseurs(team_id, identifiant);
CREATE UNIQUE INDEX IF NOT EXISTS points_vente_team_code_key ON points_vente(team_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS produits_team_nom_key ON produits(team_id, nom);
CREATE UNIQUE INDEX IF NOT EXISTS secteurs_team_code_key ON secteurs(team_id, code);

ALTER TABLE points_vente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_points_vente" ON points_vente;
DROP POLICY IF EXISTS "deny_select_points_vente" ON points_vente;
DROP POLICY IF EXISTS "deny_insert_points_vente" ON points_vente;
DROP POLICY IF EXISTS "deny_update_points_vente" ON points_vente;
DROP POLICY IF EXISTS "deny_delete_points_vente" ON points_vente;

CREATE POLICY "deny_select_points_vente" ON points_vente FOR SELECT
  TO anon, authenticated USING (false);
CREATE POLICY "deny_insert_points_vente" ON points_vente FOR INSERT
  TO anon, authenticated WITH CHECK (false);
CREATE POLICY "deny_update_points_vente" ON points_vente FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny_delete_points_vente" ON points_vente FOR DELETE
  TO anon, authenticated USING (false);
