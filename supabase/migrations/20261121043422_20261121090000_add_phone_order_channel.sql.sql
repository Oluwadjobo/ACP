/*
# Add phone order channel (ventes_appel table)

1. Purpose
- Allows a commercial to record the outcome of a phone call (sale realized or not)
  for a point of sale in their portfolio WITHOUT creating a physical visit,
  GPS presence, QR scan, or any modification to the visites table.

2. New Table: ventes_appel
- id (uuid PK, default gen_random_uuid)
- team_id (uuid NOT NULL, FK -> teams, ON DELETE RESTRICT)
- commercial_id (uuid NOT NULL, FK -> commerciaux, ON DELETE CASCADE)
- point_vente_id (uuid NOT NULL, FK -> points_vente, ON DELETE CASCADE)
- vente_status (text NOT NULL, CHECK in 'vente_realisee','vente_non_realisee')
- idempotency_key (uuid NOT NULL — prevents technical double submissions)
- created_at (timestamptz NOT NULL default now())
- Unique constraint on (commercial_id, idempotency_key) — one row per submission

3. Security
- RLS enabled, deny-by-default for anon + authenticated (all CRUD blocked).
- The edge function auth-api uses the service role key (bypasses RLS) and
  enforces all access control in application code: identity check, role check,
  permission check (record_vente), team scoping, and portfolio verification.

4. Indexes
- ventes_appel_team_created_idx (team_id, created_at DESC)
- ventes_appel_commercial_created_idx (commercial_id, created_at DESC)
- ventes_appel_point_created_idx (point_vente_id, created_at DESC)

5. Notes
- Non-destructive: uses CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS,
  CREATE INDEX IF NOT EXISTS. Safe to re-run.
- No GRANT to anon/authenticated needed: RLS denies all and the edge function
  uses the service role key which bypasses RLS. A GRANT to service_role is
  not required because the service role bypasses all checks.
- This table is completely independent of visites — no triggers, no FK to visites.
*/

CREATE TABLE IF NOT EXISTS public.ventes_appel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  commercial_id uuid NOT NULL REFERENCES public.commerciaux(id) ON DELETE CASCADE,
  point_vente_id uuid NOT NULL REFERENCES public.points_vente(id) ON DELETE CASCADE,
  vente_status text NOT NULL CHECK (vente_status IN ('vente_realisee', 'vente_non_realisee')),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventes_appel_commercial_idempotency_unique UNIQUE (commercial_id, idempotency_key)
);

ALTER TABLE public.ventes_appel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_ventes_appel" ON public.ventes_appel;
CREATE POLICY "deny_select_ventes_appel" ON public.ventes_appel
  FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_ventes_appel" ON public.ventes_appel;
CREATE POLICY "deny_insert_ventes_appel" ON public.ventes_appel
  FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_ventes_appel" ON public.ventes_appel;
CREATE POLICY "deny_update_ventes_appel" ON public.ventes_appel
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_ventes_appel" ON public.ventes_appel;
CREATE POLICY "deny_delete_ventes_appel" ON public.ventes_appel
  FOR DELETE TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS ventes_appel_team_created_idx
  ON public.ventes_appel (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ventes_appel_commercial_created_idx
  ON public.ventes_appel (commercial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ventes_appel_point_created_idx
  ON public.ventes_appel (point_vente_id, created_at DESC);