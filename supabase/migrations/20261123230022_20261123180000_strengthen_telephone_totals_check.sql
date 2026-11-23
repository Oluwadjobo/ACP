/*
# Strengthen daily report telephone validation

1. Purpose
- Add non-negative checks on telephone.totals counters (total, sale_realized, sale_not_realized).
- The existing constraint already allows an optional `telephone` object with exact columns, array rows, and object totals.
- This migration adds the missing numeric non-negativity validation on the three telephone totals.

2. Modified constraint
- `daily_report_snapshots_report_data_check` is replaced with an identical version that adds:
  `(telephone.totals.total >= 0 AND telephone.totals.sale_realized >= 0 AND telephone.totals.sale_not_realized >= 0)`
  when the telephone block is present.
- All existing checks on physical columns, rows, totals, and the telephone structure are preserved.
- Both "Total visites physiques" and "Total général" column labels remain accepted for backward compatibility.

3. Security
- No RLS, grants, or policies are changed.
- No data rows are modified.
- No columns are added or removed.
*/

ALTER TABLE public.daily_report_snapshots
DROP CONSTRAINT IF EXISTS daily_report_snapshots_report_data_check;

ALTER TABLE public.daily_report_snapshots
ADD CONSTRAINT daily_report_snapshots_report_data_check CHECK (
  (NOT (jsonb_typeof(report_data) IS DISTINCT FROM 'object'::text))
  AND (report_data ?& ARRAY['columns', 'rows', 'totals']::text[])
  AND ((report_data - ARRAY['columns', 'rows', 'totals', 'telephone']::text[]) = '{}'::jsonb)
  AND (
    (report_data -> 'columns') = jsonb_build_array('Commercial', 'Hors zone', 'Présence confirmée', 'Vente non réalisée', 'Vente réalisée', 'Total visites physiques')
    OR (report_data -> 'columns') = jsonb_build_array('Commercial', 'Hors zone', 'Présence confirmée', 'Vente non réalisée', 'Vente réalisée', 'Total général')
  )
  AND (NOT (jsonb_typeof((report_data -> 'rows')) IS DISTINCT FROM 'array'::text))
  AND (NOT (jsonb_typeof((report_data -> 'totals')) IS DISTINCT FROM 'object'::text))
  AND (
    NOT (report_data ? 'telephone')
    OR (
      (NOT (jsonb_typeof((report_data -> 'telephone')) IS DISTINCT FROM 'object'::text))
      AND ((report_data -> 'telephone') ?& ARRAY['columns', 'rows', 'totals']::text[])
      AND (((report_data -> 'telephone') - ARRAY['columns', 'rows', 'totals']::text[]) = '{}'::jsonb)
      AND ((report_data -> 'telephone' -> 'columns') = jsonb_build_array('Commercial', 'Appels reçus', 'Vente OUI', 'Vente NON'))
      AND (NOT (jsonb_typeof((report_data -> 'telephone' -> 'rows')) IS DISTINCT FROM 'array'::text))
      AND (NOT (jsonb_typeof((report_data -> 'telephone' -> 'totals')) IS DISTINCT FROM 'object'::text))
      AND (
        (report_data -> 'telephone' -> 'totals' ->> 'total')::numeric >= 0
        AND (report_data -> 'telephone' -> 'totals' ->> 'sale_realized')::numeric >= 0
        AND (report_data -> 'telephone' -> 'totals' ->> 'sale_not_realized')::numeric >= 0
      )
    )
  )
);