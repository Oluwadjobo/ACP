/*
# Create OPLANÈTE team and migrate William Bogninou's group from Eau

1. New Team
- Create team "OPLANÈTE" with code "OPLANETE", color "#0E9F6E" (emerald green — distinct from Yaourt blue #1D6FB8 and Eau red #f30714).

2. Data Migration (Eau → OPlanète)
The following users and all their data move from Eau to OPlanète:
- Superviseur: William BOGNINOU (id: 7fb823ac-1fac-4326-95a7-00057e2186fd)
- Commercial: Ephreme SANNY (id: 1376605f-4720-4789-8a42-3ca7bd3c6d03)
- Commercial: Albéric BATONON (id: 2d006d32-2f67-4db9-b293-21fc25771a7b)
- Commercial: Concorde HAZOUME (id: 7e08067b-7bb2-479c-b1ce-8a9b28e9f0d7)

Sectors being migrated (3 sectors, 205 points de vente):
- 838ee0a5-0255-475b-9abb-31fe943b512e (Cotonou Centre - Sanni)
- b14c2c93-7287-488a-bbe7-f82a9a81c514 (AKPAKPA - Albéric)
- d0048905-21f3-4606-958a-135ef85748dc (13Coo Abomey Calavi)

3. What changes
- team_id on superviseurs, commerciaux, secteurs, points_vente, commercial_tournees, team_leader_tournees updated to OPLANÈTE team id.
- The 1 visite record by one of these commerciaux already has team_id = Eau; it will be updated too.
- No data is deleted. No new users are created. All historical relationships (visites, ventes, etc.) are preserved — only the team_id foreign key changes.

4. Security
- No RLS policy changes needed. All existing policies use team_id for isolation and will continue to work with the new team id.
*/

-- Step 1: Create the OPLANÈTE team
DO $$
DECLARE
  oplanete_id uuid;
  eau_id uuid;
BEGIN
  SELECT id INTO eau_id FROM teams WHERE code = 'EAU';
  SELECT id INTO oplanete_id FROM teams WHERE code = 'OPLANETE';

  IF oplanete_id IS NULL THEN
    INSERT INTO teams (code, name, color)
    VALUES ('OPLANETE', 'OPlanète Team', '#0E9F6E')
    RETURNING id INTO oplanete_id;
  END IF;

  -- Step 2: Migrate the 3 sectors
  UPDATE secteurs
  SET team_id = oplanete_id
  WHERE id IN (
    '838ee0a5-0255-475b-9abb-31fe943b512e',
    'b14c2c93-7287-488a-bbe7-f82a9a81c514',
    'd0048905-21f3-4606-958a-135ef85748dc'
  ) AND team_id = eau_id;

  -- Step 3: Migrate William (superviseur)
  UPDATE superviseurs
  SET team_id = oplanete_id
  WHERE id = '7fb823ac-1fac-4326-95a7-00057e2186fd' AND team_id = eau_id;

  -- Step 4: Migrate the 3 commerciaux
  UPDATE commerciaux
  SET team_id = oplanete_id
  WHERE id IN (
    '1376605f-4720-4789-8a42-3ca7bd3c6d03',
    '2d006d32-2f67-4db9-b293-21fc25771a7b',
    '7e08067b-7bb2-479c-b1ce-8a9b28e9f0d7'
  ) AND team_id = eau_id;

  -- Step 5: Migrate points_vente in those sectors
  UPDATE points_vente
  SET team_id = oplanete_id
  WHERE secteur_id IN (
    '838ee0a5-0255-475b-9abb-31fe943b512e',
    'b14c2c93-7287-488a-bbe7-f82a9a81c514',
    'd0048905-21f3-4606-958a-135ef85748dc'
  ) AND team_id = eau_id;

  -- Step 6: Migrate commercial_tournees links for these sectors
  UPDATE commercial_tournees
  SET team_id = oplanete_id
  WHERE secteur_id IN (
    '838ee0a5-0255-475b-9abb-31fe943b512e',
    'b14c2c93-7287-488a-bbe7-f82a9a81c514',
    'd0048905-21f3-4606-958a-135ef85748dc'
  ) AND team_id = eau_id;

  -- Step 7: Migrate team_leader_tournees links for these sectors
  UPDATE team_leader_tournees
  SET team_id = oplanete_id
  WHERE secteur_id IN (
    '838ee0a5-0255-475b-9abb-31fe943b512e',
    'b14c2c93-7287-488a-bbe7-f82a9a81c514',
    'd0048905-21f3-4606-958a-135ef85748dc'
  ) AND team_id = eau_id;

  -- Step 8: Migrate visites by these 4 users (1 visite total)
  UPDATE visites
  SET team_id = oplanete_id
  WHERE (commercial_id IN (
    '1376605f-4720-4789-8a42-3ca7bd3c6d03',
    '2d006d32-2f67-4db9-b293-21fc25771a7b',
    '7e08067b-7bb2-479c-b1ce-8a9b28e9f0d7'
  ) OR superviseur_id = '7fb823ac-1fac-4326-95a7-00057e2186fd')
  AND team_id = eau_id;

END $$;
