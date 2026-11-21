-- Allow a commercial to record a sale received by phone without creating a visit.
-- Existing field sales remain linked to a confirmed QR/GPS visit.

ALTER TABLE public.ventes
  ALTER COLUMN visite_id DROP NOT NULL;

ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS canal_commande text;

UPDATE public.ventes
SET canal_commande = 'terrain'
WHERE canal_commande IS NULL;

ALTER TABLE public.ventes
  ALTER COLUMN canal_commande SET DEFAULT 'terrain',
  ALTER COLUMN canal_commande SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ventes_canal_commande_check'
      AND conrelid = 'public.ventes'::regclass
  ) THEN
    ALTER TABLE public.ventes
      ADD CONSTRAINT ventes_canal_commande_check
      CHECK (canal_commande IN ('terrain', 'appel'));
  END IF;
END $$;

ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ventes_idempotency_key_unique
  ON public.ventes (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ventes_canal_commande_created_at_idx
  ON public.ventes (canal_commande, created_at DESC);
