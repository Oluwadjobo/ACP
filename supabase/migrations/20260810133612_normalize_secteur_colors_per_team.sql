/*
# Normalize tournée colors by team

1. Purpose
- Reassign existing tournée colors deterministically so each team's map and
  legend display a useful spread of colors instead of repeated default red.
- Future creations continue using the existing palette and the selected color
  sent by the administrator.

2. Scope
- Applies independently to YAOURT and EAU.
- Updates only `secteurs.color_code`; names, codes, assignments, points of sale,
  and all other business data remain unchanged.

3. Security
- No access policy is changed. Tournée data remains behind the auth-api edge
  function and existing deny-all RLS policies.
*/

WITH palette(position, color_code) AS (
  VALUES
    (1, '#E63946'), (2, '#1D6FB8'), (3, '#2A9D3F'), (4, '#F18E00'),
    (5, '#7B2CBF'), (6, '#06A6A6'), (7, '#D81B8A'), (8, '#F1C40F'),
    (9, '#7B4A2B'), (10, '#17A2B8')
), ranked AS (
  SELECT id, row_number() OVER (PARTITION BY team_id ORDER BY created_at, id) AS position
  FROM secteurs
)
UPDATE secteurs AS s
SET color_code = p.color_code
FROM ranked AS r
JOIN palette AS p ON p.position = ((r.position - 1) % 10) + 1
WHERE s.id = r.id;
