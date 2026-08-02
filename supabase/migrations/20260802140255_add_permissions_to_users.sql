/*
# Add permissions column to admins, commerciaux, superviseurs

## Purpose
Introduces a granular permission system. Each user (admin, commercial, superviseur)
gets a JSONB `permissions` column that stores an object of permission keys → booleans.
The admin can toggle individual capabilities per user (e.g. allow a commercial to
create points of sale, or allow a superviseur to see the dashboard).

## New Columns
- `admins.permissions` (jsonb, default '{}')
- `commerciaux.permissions` (jsonb, default '{}')
- `superviseurs.permissions` (jsonb, default '{}')

## Permission Catalog
Field capabilities:
  scan, create_point_vente, record_vente, create_promesse, control_terrain,
  view_history, view_ventes_non_realisees
Dashboard capabilities:
  view_dashboard, view_carte, manage_secteurs, manage_commerciaux,
  manage_superviseurs, manage_admins, manage_produits, manage_points_vente,
  manage_bons_livraison, view_visites, view_ventes, view_controles

## Defaults
- admins: all dashboard permissions true
- superviseurs: scan, create_point_vente, record_vente, create_promesse,
  control_terrain, view_history, view_ventes_non_realisees true
- commerciaux: scan, create_point_vente, record_vente, view_history true

## Security
No RLS changes needed — permissions are read/written exclusively through the
edge function using the service role key. The edge function enforces that only
admin sessions can modify permissions.
*/

ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE superviseurs ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Set sensible defaults for existing rows
UPDATE admins SET permissions = '{
  "view_dashboard":true,"view_carte":true,"manage_secteurs":true,
  "manage_commerciaux":true,"manage_superviseurs":true,"manage_admins":true,
  "manage_produits":true,"manage_points_vente":true,"manage_bons_livraison":true,
  "view_visites":true,"view_ventes":true,"view_controles":true,
  "scan":true,"create_point_vente":true,"record_vente":true,"create_promesse":true,
  "control_terrain":true,"view_history":true,"view_ventes_non_realisees":true
}' WHERE permissions = '{}'::jsonb;

UPDATE superviseurs SET permissions = '{
  "scan":true,"create_point_vente":true,"record_vente":true,"create_promesse":true,
  "control_terrain":true,"view_history":true,"view_ventes_non_realisees":true
}' WHERE permissions = '{}'::jsonb;

UPDATE commerciaux SET permissions = '{
  "scan":true,"create_point_vente":true,"record_vente":true,"view_history":true
}' WHERE permissions = '{}'::jsonb;