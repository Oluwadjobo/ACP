-- Enregistre le résultat d'un appel commercial sans créer de visite physique,
-- sans coordonnées GPS, sans produits, sans quantités et sans bon de livraison.
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
