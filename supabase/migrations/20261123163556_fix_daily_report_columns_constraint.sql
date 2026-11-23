/*
# Fix daily_report_snapshots report_data column label constraint

## What changed
The CHECK constraint `daily_report_snapshots_report_data_check` expected the
`columns` array inside `report_data` to end with 'Total general'. However, the
application code (TypeScript edge function and React frontend) uses the canonical
label 'Total visites physiques' everywhere.

This mismatch caused every new report generation to fail the constraint.

The constraint is replaced with one that accepts 'Total visites physiques' as
the canonical last column label. Old snapshots with 'Total general' remain valid
(both labels are accepted for backward compatibility). The telephone sub-object
validation is preserved exactly as before.

## Safety
- No data is modified or deleted.
- The constraint is dropped and recreated (idempotent via ALTER TABLE DROP).
- Existing snapshots that used the old label remain valid.
*/

ALTER TABLE daily_report_snapshots DROP CONSTRAINT IF EXISTS daily_report_snapshots_report_data_check;

ALTER TABLE daily_report_snapshots
ADD CONSTRAINT daily_report_snapshots_report_data_check CHECK (
  jsonb_typeof(report_data) IS NOT DISTINCT FROM 'object'
  AND report_data ?& ARRAY['columns', 'rows', 'totals']
  AND (report_data - ARRAY['columns', 'rows', 'totals', 'telephone'] = '{}'::jsonb)
  AND (
    (report_data -> 'columns') = jsonb_build_array('Commercial', 'Hors zone', 'Présence confirmée', 'Vente non réalisée', 'Vente réalisée', 'Total visites physiques')
    OR (report_data -> 'columns') = jsonb_build_array('Commercial', 'Hors zone', 'Présence confirmée', 'Vente non réalisée', 'Vente réalisée', 'Total général')
  )
  AND jsonb_typeof(report_data -> 'rows') IS NOT DISTINCT FROM 'array'
  AND jsonb_typeof(report_data -> 'totals') IS NOT DISTINCT FROM 'object'
  AND (
    NOT (report_data ? 'telephone')
    OR (
      jsonb_typeof(report_data -> 'telephone') IS NOT DISTINCT FROM 'object'
      AND (report_data -> 'telephone') ?& ARRAY['columns', 'rows', 'totals']
      AND ((report_data -> 'telephone') - ARRAY['columns', 'rows', 'totals']) = '{}'::jsonb
      AND ((report_data -> 'telephone') -> 'columns') = jsonb_build_array('Commercial', 'Appels reçus', 'Vente OUI', 'Vente NON')
      AND jsonb_typeof((report_data -> 'telephone') -> 'rows') IS NOT DISTINCT FROM 'array'
      AND jsonb_typeof((report_data -> 'telephone') -> 'totals') IS NOT DISTINCT FROM 'object'
    )
  )
);
