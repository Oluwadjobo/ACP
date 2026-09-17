/*
# Add frigo_comtesse column to points_vente

1. Modified Tables
- `points_vente`: add `frigo_comtesse` boolean column (nullable, default null).
  This column is used only by the Yaourt team to track whether a "frigo Comtesse"
  (Comtesse-brand refrigerator) is present at the point of sale.
  NULL means the field is not applicable (non-Yaourt teams) or not yet filled.
2. Security
- No RLS policy changes needed — the column is covered by existing policies on points_vente.
*/

ALTER TABLE points_vente
  ADD COLUMN IF NOT EXISTS frigo_comtesse boolean DEFAULT null;
