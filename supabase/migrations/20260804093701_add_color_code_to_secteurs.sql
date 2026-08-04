-- Add a dedicated color per tournée (secteur)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'secteurs' AND column_name = 'color_code'
  ) THEN
    ALTER TABLE secteurs ADD COLUMN color_code text;
  END IF;
END $$;

-- Backfill existing rows with a well-spaced palette (in creation order)
-- so no two tournées share a visually close color.
DO $$
DECLARE
  r RECORD;
  palette text[] := ARRAY[
    '#E63946', -- rouge vif
    '#1D6FB8', -- bleu vif
    '#2A9D3F', -- vert vif
    '#F18E00', -- orange vif
    '#7B2CBF', -- violet
    '#06A6A6', -- turquoise
    '#D81B8A', -- rose fuchsia
    '#F1C40F', -- jaune intense
    '#7B4A2B', -- marron
    '#17A2B8'  -- cyan
  ];
  idx integer := 0;
BEGIN
  FOR r IN SELECT id FROM secteurs WHERE color_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE secteurs
      SET color_code = palette[(idx % array_length(palette, 1)) + 1]
      WHERE id = r.id;
    idx := idx + 1;
  END LOOP;
END $$;

-- Ensure future rows always have a color (the edge function assigns it,
-- but keep this as a safety net with a neutral default).
ALTER TABLE secteurs ALTER COLUMN color_code SET DEFAULT '#E63946';
ALTER TABLE secteurs ALTER COLUMN color_code SET NOT NULL;

-- Recreate the safe view to expose the new column
DROP VIEW IF EXISTS secteurs_safe;
CREATE VIEW secteurs_safe
WITH (security_invoker = true) AS
  SELECT id, code, nom, description, actif, color_code, created_at FROM secteurs;
