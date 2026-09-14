
-- Backfill created_by from first visite (commercial or superviseur)
UPDATE points_vente pv
SET created_by = v.commercial_id, created_by_role = 'commercial'
FROM (
  SELECT DISTINCT ON (point_vente_id) point_vente_id, commercial_id
  FROM visites
  WHERE commercial_id IS NOT NULL
  ORDER BY point_vente_id, visited_at ASC
) v
WHERE pv.id = v.point_vente_id
  AND pv.created_by IS NULL
  AND v.commercial_id IS NOT NULL;

UPDATE points_vente pv
SET created_by = v.superviseur_id, created_by_role = 'superviseur'
FROM (
  SELECT DISTINCT ON (point_vente_id) point_vente_id, superviseur_id
  FROM visites
  WHERE superviseur_id IS NOT NULL
  ORDER BY point_vente_id, visited_at ASC
) v
WHERE pv.id = v.point_vente_id
  AND pv.created_by IS NULL
  AND v.superviseur_id IS NOT NULL;

-- Backfill from secteur assignment when exactly one commercial is assigned
UPDATE points_vente pv
SET created_by = ct.commercial_id, created_by_role = 'commercial'
FROM commercial_tournees ct
WHERE pv.secteur_id = ct.secteur_id
  AND pv.created_by IS NULL
  AND pv.secteur_id IS NOT NULL
  AND (
    SELECT COUNT(DISTINCT commercial_id) FROM commercial_tournees WHERE secteur_id = ct.secteur_id
  ) = 1;

-- Backfill from team_leader_tournees when exactly one superviseur is assigned
UPDATE points_vente pv
SET created_by = tlt.superviseur_id, created_by_role = 'superviseur'
FROM team_leader_tournees tlt
WHERE pv.secteur_id = tlt.secteur_id
  AND pv.created_by IS NULL
  AND pv.secteur_id IS NOT NULL
  AND (
    SELECT COUNT(DISTINCT superviseur_id) FROM team_leader_tournees WHERE secteur_id = tlt.secteur_id
  ) = 1;
