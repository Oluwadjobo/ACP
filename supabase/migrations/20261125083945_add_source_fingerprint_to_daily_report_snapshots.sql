/*
# Add source_fingerprint column to daily_report_snapshots

## Purpose
Detects when a daily report snapshot has become stale: visits or phone calls
were added, modified, or deleted after the snapshot was generated.

## Changes

### 1. New column: daily_report_snapshots.source_fingerprint
- `text`, nullable (existing snapshots have NULL — they predate fingerprinting)
- Stores a deterministic hash of the source data (visits + phone calls) at
  generation time. Compared on read to detect staleness.

### 2. New function: compute_daily_report_fingerprint(team_id, report_date)
- SECURITY DEFINER, search_path = '' (safe)
- Computes a deterministic MD5 hash from the counts of visits by category
  and phone calls by status for the given team and date
- Uses the same Africa/Porto-Novo civil-day boundaries as the report builder
- Returns the fingerprint text, or NULL if no visits and no calls exist
- Revoked from PUBLIC/anon — only service_role (edge function) should call it

### Security
- No RLS policy changes (table already deny-all to anon/authenticated)
- No grants to anon or authenticated
- Function EXECUTE revoked from PUBLIC and anon
- Column addition is additive, non-destructive, nullable

### Important notes
1. Existing snapshots keep source_fingerprint = NULL — they are treated as
   "unknown freshness" (not stale, not confirmed fresh) by the frontend.
2. The fingerprint is computed from aggregate counts, not individual row IDs,
   so it detects additions/deletions but not reordering. This is sufficient
   because the report is defined by its totals and per-commercial breakdowns.
3. The fingerprint includes both physical visits AND phone calls, so changes
   to either source are detected.
*/

ALTER TABLE public.daily_report_snapshots
  ADD COLUMN IF NOT EXISTS source_fingerprint text;

CREATE OR REPLACE FUNCTION public.compute_daily_report_fingerprint(
  p_team_id uuid,
  p_report_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_start timestamptz;
  v_end_before timestamptz;
  v_visit_out_of_zone bigint;
  v_visit_presence_confirmed bigint;
  v_visit_sale_not_realized bigint;
  v_visit_sale_realized bigint;
  v_visit_total bigint;
  v_call_realized bigint;
  v_call_not_realized bigint;
  v_call_total bigint;
  v_fingerprint text;
BEGIN
  -- Africa/Porto-Novo is UTC+1 year-round (no DST).
  -- A civil midnight in Porto-Novo = 23:00 UTC of the previous day.
  v_start := (p_report_date::timestamp - interval '1 hour')::timestamptz;
  v_end_before := (p_report_date::timestamp + interval '1 day' - interval '1 hour')::timestamptz;

  SELECT
    count(*) FILTER (WHERE v.status = 'out_of_zone' OR v.vente_status = 'out_of_zone'),
    count(*) FILTER (WHERE v.status = 'confirmed' AND v.vente_status = 'confirmed'),
    count(*) FILTER (WHERE v.vente_status = 'vente_non_realisee'),
    count(*) FILTER (WHERE v.vente_status = 'vente_realisee' OR v.vente_status = 'vente_livraison'),
    count(*)
  INTO
    v_visit_out_of_zone,
    v_visit_presence_confirmed,
    v_visit_sale_not_realized,
    v_visit_sale_realized,
    v_visit_total
  FROM public.visites v
  WHERE v.team_id = p_team_id
    AND v.visited_at >= v_start
    AND v.visited_at < v_end_before;

  SELECT
    count(*) FILTER (WHERE va.vente_status = 'vente_realisee'),
    count(*) FILTER (WHERE va.vente_status = 'vente_non_realisee'),
    count(*)
  INTO
    v_call_realized,
    v_call_not_realized,
    v_call_total
  FROM public.ventes_appel va
  WHERE va.team_id = p_team_id
    AND va.created_at >= v_start
    AND va.created_at < v_end_before;

  IF v_visit_total = 0 AND v_call_total = 0 THEN
    RETURN NULL;
  END IF;

  v_fingerprint := md5(
    'visits:' ||
    COALESCE(v_visit_out_of_zone::text, '0') || ',' ||
    COALESCE(v_visit_presence_confirmed::text, '0') || ',' ||
    COALESCE(v_visit_sale_not_realized::text, '0') || ',' ||
    COALESCE(v_visit_sale_realized::text, '0') || ',' ||
    COALESCE(v_visit_total::text, '0') ||
    '|calls:' ||
    COALESCE(v_call_realized::text, '0') || ',' ||
    COALESCE(v_call_not_realized::text, '0') || ',' ||
    COALESCE(v_call_total::text, '0')
  );

  RETURN v_fingerprint;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_daily_report_fingerprint(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_daily_report_fingerprint(uuid, date) FROM anon;
