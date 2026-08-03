/*
# Add GPS accuracy column to visites table

1. Changes
- Add `accuracy` column (double precision, nullable) to `visites` table.
- This column stores the GPS accuracy in meters reported by the device at scan time.
- Existing rows will have NULL accuracy (no data loss).
2. Purpose
- Enables audit trail of GPS signal quality per visit.
- Allows administrators to assess reliability of position data.
3. Security
- No RLS policy changes — existing policies remain in place.
- The column is only written by the edge function (service role), read by admins.
*/

ALTER TABLE visites
  ADD COLUMN IF NOT EXISTS accuracy double precision;
