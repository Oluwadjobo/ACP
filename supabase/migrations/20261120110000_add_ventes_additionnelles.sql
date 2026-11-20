/*
  # ACP — Ventes additionnelles déclarées par les commerciaux

  Une vente additionnelle est une déclaration simple (réalisée / non réalisée)
  reçue hors visite physique. Elle ne crée pas de visite GPS et ne crée pas de BL.
  Elle peut être initiée depuis Mes visites ou Mes points de vente.
*/

CREATE TABLE IF NOT EXISTS public.ventes_additionnelles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  commercial_id uuid NOT NULL REFERENCES public.commerciaux(id) ON DELETE CASCADE,
  point_vente_id uuid NOT NULL REFERENCES public.points_vente(id) ON DELETE CASCADE,
  visite_id uuid REFERENCES public.visites(id) ON DELETE CASCADE,
  origine text NOT NULL CHECK (origine IN ('mes_visites', 'mes_points_vente')),
  statut text NOT NULL CHECK (statut IN ('realisee', 'non_realisee')),
  request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventes_additionnelles_origin_visit_check CHECK (
    (origine = 'mes_visites' AND visite_id IS NOT NULL)
    OR (origine = 'mes_points_vente' AND visite_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ventes_additionnelles_team_created
  ON public.ventes_additionnelles(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_additionnelles_commercial_created
  ON public.ventes_additionnelles(commercial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_additionnelles_point_created
  ON public.ventes_additionnelles(point_vente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_additionnelles_visite
  ON public.ventes_additionnelles(visite_id)
  WHERE visite_id IS NOT NULL;

ALTER TABLE public.ventes_additionnelles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_select_ventes_additionnelles" ON public.ventes_additionnelles;
CREATE POLICY "deny_select_ventes_additionnelles"
  ON public.ventes_additionnelles FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "deny_insert_ventes_additionnelles" ON public.ventes_additionnelles;
CREATE POLICY "deny_insert_ventes_additionnelles"
  ON public.ventes_additionnelles FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "deny_update_ventes_additionnelles" ON public.ventes_additionnelles;
CREATE POLICY "deny_update_ventes_additionnelles"
  ON public.ventes_additionnelles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_delete_ventes_additionnelles" ON public.ventes_additionnelles;
CREATE POLICY "deny_delete_ventes_additionnelles"
  ON public.ventes_additionnelles FOR DELETE TO anon, authenticated USING (false);

-- Daily report snapshots are currently provisioned outside the tracked migration
-- history. Add the extension only when that table already exists.
DO $$
BEGIN
  IF to_regclass('public.daily_report_snapshots') IS NOT NULL THEN
    ALTER TABLE public.daily_report_snapshots
      ADD COLUMN IF NOT EXISTS additional_sales_data jsonb NOT NULL
      DEFAULT '{"rows":[],"totals":{"sale_additional_realized":0,"sale_additional_not_realized":0,"total":0}}'::jsonb;
  END IF;
END $$;
