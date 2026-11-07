/*
# Add GPS discrepancy reports for points de vente

1. New Tables
- `pdv_gps_reports`: one row per point de vente and reporting field agent while that report is open.
  - `point_vente_id`: the point de vente concerned (cascade on delete).
  - `team_id`: tenant the point belongs to.
  - `reporter_id` / `reporter_role` / `reporter_name`: who reported (commercial or superviseur).
  - `pdv_latitude` / `pdv_longitude`: coordinates stored on the point at the time of the report.
  - `device_latitude` / `device_longitude` / `device_accuracy`: GPS fix taken by the reporter.
  - `distance_meters`: computed distance between the two positions.
  - `status`: open, resolved or dismissed.
  - `attempt_count`: number of attempts that were folded into this open report.
  - `first_reported_at` / `last_reported_at`: bounds of the attempts.
  - `resolved_at` / `resolution_note`: filled by an administrator after a field check.

2. Modified Tables
- None. Coordinates of `points_vente` are never changed by this migration or by reports.

3. Security
- Row level security enabled, no policy for `anon` or `authenticated`.
- Only `service_role` (used by the server function) is granted access, so clients cannot read or write reports directly.

4. Important Notes
- A partial unique index allows only one open report per point and reporter, which prevents duplicate reports.
- Re-running this migration is safe: statements use IF NOT EXISTS and policies are not used.
*/

CREATE TABLE IF NOT EXISTS pdv_gps_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id),
  reporter_id uuid NOT NULL,
  reporter_role text NOT NULL CHECK (reporter_role IN ('commercial', 'superviseur')),
  reporter_name text,
  pdv_latitude double precision,
  pdv_longitude double precision,
  device_latitude double precision NOT NULL,
  device_longitude double precision NOT NULL,
  device_accuracy double precision,
  distance_meters integer,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  attempt_count integer NOT NULL DEFAULT 1,
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);

CREATE UNIQUE INDEX IF NOT EXISTS pdv_gps_reports_one_open_per_reporter
  ON pdv_gps_reports (point_vente_id, reporter_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS pdv_gps_reports_team_status_idx
  ON pdv_gps_reports (team_id, status);

ALTER TABLE pdv_gps_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON pdv_gps_reports TO service_role;
