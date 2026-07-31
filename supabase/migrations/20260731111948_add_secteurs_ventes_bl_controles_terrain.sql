/*
# COMTESSE — Plateforme de pilotage de la force de vente

## Overview
This migration transforms the app from a simple presence-control system into a
full field-sales management platform. It adds:

1. **Secteurs** — geographic / portfolio zones managed by the admin.
2. **Hierarchy links** — superviseurs and points_vente get a `secteur_id`;
   commerciaux get a `superviseur_id` (inherits the secteur from their superviseur).
3. **Ventes & vente_lignes** — multi-product sales recorded during a visit.
4. **Bons de livraison (BL) & bl_lignes** — delivery slips auto-generated from
   sales, with statuses (en_attente / livre / partiel / annule) and future-proof
   fields (signature, réceptionnaire, photo, GPS livraison).
5. **Controles terrain** — superviseur quality-control visits (facing /
   merchandising / visibility) with a 5-level notation and observations.

All new tables use the same RLS pattern as the existing ones (deny-all for
anon/authenticated — all access goes through the edge function service role).

## New Tables
- secteurs, ventes, vente_lignes, bons_livraison, bl_lignes, controles_terrain
(see SQL for full column lists)

## Modified Tables
- superviseurs + secteur_id, telephone
- commerciaux + superviseur_id, telephone
- points_vente + secteur_id

## Security
- RLS enabled on every new table, deny-all policies (same pattern as existing).
- No destructive changes; all ALTERs are additive.

## Important Notes
1. All new FK columns are nullable so existing rows remain valid.
2. The `numero` of a BL is generated as `BL-YYYYMMDD-XXXX` in the edge function.
3. Future-proof BL fields (signature, réceptionnaire, photo, GPS) are stored now
   to avoid a schema refonte later, even though V1 screens don't use them.
*/

-- ============ SECTEURS ============
CREATE TABLE IF NOT EXISTS secteurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  nom text NOT NULL,
  description text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE secteurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_secteurs" ON secteurs;
CREATE POLICY "deny_select_secteurs" ON secteurs FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_secteurs" ON secteurs;
CREATE POLICY "deny_insert_secteurs" ON secteurs FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_secteurs" ON secteurs;
CREATE POLICY "deny_update_secteurs" ON secteurs FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_secteurs" ON secteurs;
CREATE POLICY "deny_delete_secteurs" ON secteurs FOR DELETE TO anon, authenticated USING (false);

-- ============ HIERARCHY LINKS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='superviseurs' AND column_name='secteur_id') THEN
    ALTER TABLE superviseurs ADD COLUMN secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commerciaux' AND column_name='superviseur_id') THEN
    ALTER TABLE commerciaux ADD COLUMN superviseur_id uuid REFERENCES superviseurs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commerciaux' AND column_name='telephone') THEN
    ALTER TABLE commerciaux ADD COLUMN telephone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='superviseurs' AND column_name='telephone') THEN
    ALTER TABLE superviseurs ADD COLUMN telephone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_vente' AND column_name='secteur_id') THEN
    ALTER TABLE points_vente ADD COLUMN secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_superviseurs_secteur ON superviseurs(secteur_id);
CREATE INDEX IF NOT EXISTS idx_commerciaux_superviseur ON commerciaux(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_points_vente_secteur ON points_vente(secteur_id);

-- ============ VENTES ============
CREATE TABLE IF NOT EXISTS ventes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visite_id uuid NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
  commercial_id uuid REFERENCES commerciaux(id) ON DELETE SET NULL,
  superviseur_id uuid REFERENCES superviseurs(id) ON DELETE SET NULL,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL,
  montant_total numeric(14,2) NOT NULL DEFAULT 0,
  observation text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ventes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_ventes" ON ventes;
CREATE POLICY "deny_select_ventes" ON ventes FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_ventes" ON ventes;
CREATE POLICY "deny_insert_ventes" ON ventes FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_ventes" ON ventes;
CREATE POLICY "deny_update_ventes" ON ventes FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_ventes" ON ventes;
CREATE POLICY "deny_delete_ventes" ON ventes FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_ventes_visite ON ventes(visite_id);
CREATE INDEX IF NOT EXISTS idx_ventes_commercial ON ventes(commercial_id);
CREATE INDEX IF NOT EXISTS idx_ventes_point_vente ON ventes(point_vente_id);
CREATE INDEX IF NOT EXISTS idx_ventes_secteur ON ventes(secteur_id);
CREATE INDEX IF NOT EXISTS idx_ventes_created ON ventes(created_at DESC);

-- ============ VENTE_LIGNES ============
CREATE TABLE IF NOT EXISTS vente_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vente_id uuid NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES produits(id) ON DELETE SET NULL,
  produit_nom text NOT NULL,
  quantite integer NOT NULL DEFAULT 1,
  prix_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  montant numeric(12,2) NOT NULL DEFAULT 0,
  observation text
);
ALTER TABLE vente_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_vente_lignes" ON vente_lignes;
CREATE POLICY "deny_select_vente_lignes" ON vente_lignes FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_vente_lignes" ON vente_lignes;
CREATE POLICY "deny_insert_vente_lignes" ON vente_lignes FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_vente_lignes" ON vente_lignes;
CREATE POLICY "deny_update_vente_lignes" ON vente_lignes FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_vente_lignes" ON vente_lignes;
CREATE POLICY "deny_delete_vente_lignes" ON vente_lignes FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_vente_lignes_vente ON vente_lignes(vente_id);

-- ============ BONS LIVRAISON ============
CREATE TABLE IF NOT EXISTS bons_livraison (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE NOT NULL,
  vente_id uuid NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  commercial_id uuid REFERENCES commerciaux(id) ON DELETE SET NULL,
  superviseur_id uuid REFERENCES superviseurs(id) ON DELETE SET NULL,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_attente',
  commentaire text,
  date_livraison timestamptz,
  recepteur_nom text,
  recepteur_telephone text,
  signature_client text,
  photo_preuve_url text,
  latitude_livraison double precision,
  longitude_livraison double precision,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bons_livraison ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_bons_livraison" ON bons_livraison;
CREATE POLICY "deny_select_bons_livraison" ON bons_livraison FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_bons_livraison" ON bons_livraison;
CREATE POLICY "deny_insert_bons_livraison" ON bons_livraison FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_bons_livraison" ON bons_livraison;
CREATE POLICY "deny_update_bons_livraison" ON bons_livraison FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_bons_livraison" ON bons_livraison;
CREATE POLICY "deny_delete_bons_livraison" ON bons_livraison FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_bl_vente ON bons_livraison(vente_id);
CREATE INDEX IF NOT EXISTS idx_bl_commercial ON bons_livraison(commercial_id);
CREATE INDEX IF NOT EXISTS idx_bl_superviseur ON bons_livraison(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_bl_point_vente ON bons_livraison(point_vente_id);
CREATE INDEX IF NOT EXISTS idx_bl_secteur ON bons_livraison(secteur_id);
CREATE INDEX IF NOT EXISTS idx_bl_statut ON bons_livraison(statut);
CREATE INDEX IF NOT EXISTS idx_bl_created ON bons_livraison(created_at DESC);

-- ============ BL LIGNES ============
CREATE TABLE IF NOT EXISTS bl_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bl_id uuid NOT NULL REFERENCES bons_livraison(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES produits(id) ON DELETE SET NULL,
  produit_nom text NOT NULL,
  quantite integer NOT NULL DEFAULT 1,
  unite text NOT NULL DEFAULT 'unité',
  observation text
);
ALTER TABLE bl_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_bl_lignes" ON bl_lignes;
CREATE POLICY "deny_select_bl_lignes" ON bl_lignes FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_bl_lignes" ON bl_lignes;
CREATE POLICY "deny_insert_bl_lignes" ON bl_lignes FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_bl_lignes" ON bl_lignes;
CREATE POLICY "deny_update_bl_lignes" ON bl_lignes FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_bl_lignes" ON bl_lignes;
CREATE POLICY "deny_delete_bl_lignes" ON bl_lignes FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_bl_lignes_bl ON bl_lignes(bl_id);

-- ============ CONTROLES TERRAIN ============
CREATE TABLE IF NOT EXISTS controles_terrain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superviseur_id uuid REFERENCES superviseurs(id) ON DELETE SET NULL,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  visite_id uuid REFERENCES visites(id) ON DELETE SET NULL,
  secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL,
  notation text NOT NULL,
  presence_comtesse boolean NOT NULL DEFAULT true,
  disponibilite boolean NOT NULL DEFAULT true,
  visibilite boolean NOT NULL DEFAULT true,
  merchandising boolean NOT NULL DEFAULT true,
  presence_concurrents boolean NOT NULL DEFAULT false,
  commentaires text,
  recommandations text,
  actions_correctives text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE controles_terrain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_controles_terrain" ON controles_terrain;
CREATE POLICY "deny_select_controles_terrain" ON controles_terrain FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_controles_terrain" ON controles_terrain;
CREATE POLICY "deny_insert_controles_terrain" ON controles_terrain FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_controles_terrain" ON controles_terrain;
CREATE POLICY "deny_update_controles_terrain" ON controles_terrain FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_controles_terrain" ON controles_terrain;
CREATE POLICY "deny_delete_controles_terrain" ON controles_terrain FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_controles_superviseur ON controles_terrain(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_controles_point_vente ON controles_terrain(point_vente_id);
CREATE INDEX IF NOT EXISTS idx_controles_secteur ON controles_terrain(secteur_id);
CREATE INDEX IF NOT EXISTS idx_controles_created ON controles_terrain(created_at DESC);

-- ============ VIEWS (drop & recreate with new columns) ============
DROP VIEW IF EXISTS commerciaux_safe;
DROP VIEW IF EXISTS superviseurs_safe;
DROP VIEW IF EXISTS secteurs_safe;

CREATE VIEW secteurs_safe
WITH (security_invoker = true) AS
  SELECT id, code, nom, description, actif, created_at FROM secteurs;

CREATE VIEW commerciaux_safe
WITH (security_invoker = true) AS
  SELECT c.id, c.identifiant, c.full_name, c.active, c.telephone, c.superviseur_id,
         s.full_name AS superviseur_nom, sv.nom AS secteur_nom,
         c.created_at, c.updated_at
  FROM commerciaux c
  LEFT JOIN superviseurs s ON c.superviseur_id = s.id
  LEFT JOIN secteurs sv ON s.secteur_id = sv.id;

CREATE VIEW superviseurs_safe
WITH (security_invoker = true) AS
  SELECT id, identifiant, full_name, active, telephone, secteur_id,
         (SELECT nom FROM secteurs WHERE id = superviseurs.secteur_id) AS secteur_nom,
         created_at, updated_at
  FROM superviseurs;
