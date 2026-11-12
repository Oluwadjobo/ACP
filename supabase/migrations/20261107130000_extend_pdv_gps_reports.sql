-- Extend the report schema created by 20261107111101_add_pdv_gps_reports.sql.
ALTER TABLE public.pdv_gps_reports
  ADD COLUMN IF NOT EXISTS gps_captured_at timestamptz;

ALTER TABLE public.pdv_gps_reports
  ALTER COLUMN device_latitude DROP NOT NULL,
  ALTER COLUMN device_longitude DROP NOT NULL;

CREATE INDEX IF NOT EXISTS pdv_gps_reports_team_last_reported_idx
  ON public.pdv_gps_reports (team_id, last_reported_at DESC);

ALTER TABLE public.pdv_gps_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pdv_gps_reports'
      AND policyname = 'deny_all_pdv_gps_reports'
  ) THEN
    CREATE POLICY "deny_all_pdv_gps_reports"
      ON public.pdv_gps_reports
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END
$$;
