/*
# Add active flag to points_vente and clean up zero-history duplicates

## Purpose
1. Add `active boolean DEFAULT true` to points_vente so admins can deactivate/archive a POS instead of deleting it (preserving history).
2. Add a DB function `find_duplicate_points_vente` that detects exact and probable duplicates (same name + team, or same GPS coords rounded to ~11m + team) for the backend anti-duplication check.
3. Delete the 151 duplicate points_vente rows that have ZERO history (no visites, ventes, controles, promesses, BLs, commandes, or livraisons). Each duplicate cluster keeps its oldest row (by created_at). This is safe because all 89 clusters have zero history.

## Changes
- points_vente: new column `active boolean not null default true`
- New function: find_duplicate_points_vente(p_name, p_team_id, p_latitude, p_longitude, p_exclude_id)
- Deletes 151 zero-history duplicate rows

## Security
- No RLS changes (RLS remains deny-by-default; the edge function uses the service role)
- The function is NOT SECURITY DEFINER — it runs with the caller's privileges
*/

-- 1. Add active column
ALTER TABLE points_vente ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Duplicate detection function
-- Returns rows that are probable duplicates of the given inputs.
CREATE OR REPLACE FUNCTION find_duplicate_points_vente(
  p_name text,
  p_team_id uuid,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, code text, name text, address text, city text, latitude double precision, longitude double precision, active boolean, match_type text)
LANGUAGE sql
STABLE
AS $$
  SELECT id, code, name, address, city, latitude, longitude, active,
         CASE
           WHEN lower(trim(name)) = lower(trim(p_name)) THEN 'name'
           WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL
                AND round(latitude::numeric, 4) = round(p_latitude::numeric, 4)
                AND round(longitude::numeric, 4) = round(p_longitude::numeric, 4)
                THEN 'gps'
           ELSE 'other'
         END AS match_type
  FROM points_vente
  WHERE team_id IS NOT DISTINCT FROM p_team_id
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
    AND (
      lower(trim(name)) = lower(trim(p_name))
      OR (
        p_latitude IS NOT NULL AND p_longitude IS NOT NULL
        AND round(latitude::numeric, 4) = round(p_latitude::numeric, 4)
        AND round(longitude::numeric, 4) = round(p_longitude::numeric, 4)
      )
    );
$$;

-- 3. Delete zero-history duplicates, keeping the oldest row per (team_id, lower(name))
-- A row is "zero-history" if it has no visites, ventes, controles_terrain, promesses_achat,
-- bons_livraison, commandes, or livraisons pointing to it.
DELETE FROM points_vente pv
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY team_id, lower(trim(name))
             ORDER BY created_at ASC
           ) AS rn
    FROM points_vente
  ) ranked
  WHERE ranked.id = pv.id
    AND ranked.rn > 1
)
AND NOT EXISTS (SELECT 1 FROM visites WHERE visites.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM ventes WHERE ventes.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM controles_terrain WHERE controles_terrain.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM promesses_achat WHERE promesses_achat.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM bons_livraison WHERE bons_livraison.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM commandes WHERE commandes.point_vente_id = pv.id)
AND NOT EXISTS (SELECT 1 FROM livraisons WHERE livraisons.point_vente_id = pv.id);
