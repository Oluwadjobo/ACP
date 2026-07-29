/*
# Add Superviseur role, Promesses d'achat, and extended visit tracking

## Overview
This migration introduces the Superviseur role and the full post-validation
workflow described in the updated cahier des charges:

1. A new `superviseurs` table (same auth pattern as `commerciaux`).
2. A `produits` table for the product dropdown in promesse d'achat forms.
3. A `promesses_achat` table to record purchase promises with product,
   quantity, estimated date, estimated amount, responsible name, and notes.
4. The `visites` table is extended with:
   - `user_role` ('commercial' | 'superviseur') — who recorded the visit.
   - `superviseur_id` — nullable FK to superviseurs (set when user_role='superviseur').
   - `vente_status` — 'confirmed' (legacy), 'vente_realisee', 'vente_non_realisee',
     'promesse_achat', or 'out_of_zone'. The old `status` column is kept for
     backward compatibility but new code uses `vente_status`.
   - `motif` — nullable text, required when vente_status = 'vente_non_realisee'.
5. The default admin email changes from `admin@terrain.local` to
   `admin@footsoldiers.ilbb`, and a `must_change_password` flag is added to
   `admins` to force a password change on first login.

## Tables

### `superviseurs` (new)
- `id` (uuid PK)
- `identifiant` (text, unique) — login identifier
- `password_hash` (text) — salted SHA-512
- `full_name` (text)
- `active` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)

### `produits` (new)
- `id` (uuid PK)
- `nom` (text, unique, not null) — product name
- `created_at` (timestamptz)

### `promesses_achat` (new)
- `id` (uuid PK)
- `visite_id` (uuid FK → visites ON DELETE CASCADE)
- `superviseur_id` (uuid FK → superviseurs ON DELETE CASCADE)
- `point_vente_id` (uuid FK → points_vente ON DELETE CASCADE)
- `produits` (text, not null) — comma-separated product names (multi-select)
- `quantite` (integer, not null) — quantity envisaged
- `date_previsionnelle` (date, nullable) — expected purchase date
- `montant_estime` (numeric(12,2), nullable) — estimated amount
- `responsable` (text, nullable) — name of the point-of-sale responsible
- `observations` (text, nullable) — free-text comments
- `created_at` (timestamptz)

### `visites` (modified)
- Added `user_role` text NOT NULL DEFAULT 'commercial'
- Added `superviseur_id` uuid nullable FK → superviseurs
- Added `vente_status` text nullable (new status taxonomy)
- Added `motif` text nullable

### `admins` (modified)
- Added `must_change_password` boolean NOT NULL DEFAULT false
- Default admin re-seeded with email `admin@footsoldiers.ilbb`

## Security
- RLS enabled on all new tables with explicit deny-all policies (same pattern
  as existing tables — all access goes through the edge function service role).
- Views recreated for superviseurs.

## Important Notes
1. The old `status` column on `visites` is kept and still defaults to 'confirmed'.
   New inserts set both `status` and `vente_status` for backward compatibility.
2. The default admin password remains `Admin123!` but `must_change_password` is
   set to true so the first login forces a password change.
3. Existing visites get `user_role = 'commercial'` by default.
*/

-- ============ SUPERVISEURS ============
CREATE TABLE IF NOT EXISTS superviseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE superviseurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_superviseurs" ON superviseurs;
CREATE POLICY "deny_select_superviseurs" ON superviseurs FOR SELECT
  TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_superviseurs" ON superviseurs;
CREATE POLICY "deny_insert_superviseurs" ON superviseurs FOR INSERT
  TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_superviseurs" ON superviseurs;
CREATE POLICY "deny_update_superviseurs" ON superviseurs FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_superviseurs" ON superviseurs;
CREATE POLICY "deny_delete_superviseurs" ON superviseurs FOR DELETE
  TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_superviseurs_identifiant ON superviseurs(identifiant);

-- ============ PRODUITS ============
CREATE TABLE IF NOT EXISTS produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_produits" ON produits;
CREATE POLICY "deny_select_produits" ON produits FOR SELECT
  TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_produits" ON produits;
CREATE POLICY "deny_insert_produits" ON produits FOR INSERT
  TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_produits" ON produits;
CREATE POLICY "deny_update_produits" ON produits FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_produits" ON produits;
CREATE POLICY "deny_delete_produits" ON produits FOR DELETE
  TO anon, authenticated USING (false);

-- ============ PROMESSES ACHAT ============
CREATE TABLE IF NOT EXISTS promesses_achat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visite_id uuid NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
  superviseur_id uuid NOT NULL REFERENCES superviseurs(id) ON DELETE CASCADE,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  produits text NOT NULL,
  quantite integer NOT NULL DEFAULT 1,
  date_previsionnelle date,
  montant_estime numeric(12,2),
  responsable text,
  observations text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE promesses_achat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_promesses" ON promesses_achat;
CREATE POLICY "deny_select_promesses" ON promesses_achat FOR SELECT
  TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_promesses" ON promesses_achat;
CREATE POLICY "deny_insert_promesses" ON promesses_achat FOR INSERT
  TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_promesses" ON promesses_achat;
CREATE POLICY "deny_update_promesses" ON promesses_achat FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_promesses" ON promesses_achat;
CREATE POLICY "deny_delete_promesses" ON promesses_achat FOR DELETE
  TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_promesses_superviseur ON promesses_achat(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_promesses_point_vente ON promesses_achat(point_vente_id);
CREATE INDEX IF NOT EXISTS idx_promesses_created ON promesses_achat(created_at DESC);

-- ============ VISITES EXTENSIONS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visites' AND column_name='user_role') THEN
    ALTER TABLE visites ADD COLUMN user_role text NOT NULL DEFAULT 'commercial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visites' AND column_name='superviseur_id') THEN
    ALTER TABLE visites ADD COLUMN superviseur_id uuid REFERENCES superviseurs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visites' AND column_name='vente_status') THEN
    ALTER TABLE visites ADD COLUMN vente_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visites' AND column_name='motif') THEN
    ALTER TABLE visites ADD COLUMN motif text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visites_superviseur_id ON visites(superviseur_id);
CREATE INDEX IF NOT EXISTS idx_visites_user_role ON visites(user_role);
CREATE INDEX IF NOT EXISTS idx_visites_vente_status ON visites(vente_status);

-- ============ ADMINS: must_change_password + new default admin ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='must_change_password') THEN
    ALTER TABLE admins ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Re-seed default admin with the new email and force password change
DO $$
DECLARE
  salt text := 'a1b2c3d4e5f6a7b8c9d0e1f2';
  pwd text := 'Admin123!';
  hash text;
BEGIN
  hash := encode(digest(salt || pwd, 'sha512'), 'hex');
  INSERT INTO admins (email, password_hash, full_name, must_change_password)
  VALUES ('admin@footsoldiers.ilbb', 'sha512:' || salt || ':' || hash, 'Administrateur', true)
  ON CONFLICT (email) DO NOTHING;
END $$;

-- ============ VIEWS ============
DROP VIEW IF EXISTS superviseurs_safe;
CREATE VIEW superviseurs_safe
WITH (security_invoker = true) AS
  SELECT id, identifiant, full_name, active, created_at, updated_at
  FROM superviseurs;

-- Seed a few default products
INSERT INTO produits (nom) VALUES
  ('Produit A'),
  ('Produit B'),
  ('Produit C')
ON CONFLICT (nom) DO NOTHING;
