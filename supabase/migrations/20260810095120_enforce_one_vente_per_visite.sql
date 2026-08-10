/*
  # One sale per visit

  1. Change
    - Unique index on `ventes.visite_id` so a single field visit can never be
      turned into more than one sale (and therefore more than one delivery note),
      even when two requests arrive concurrently.
    - NULL visite_id values remain unconstrained (Postgres allows many NULLs),
      which preserves sales recorded outside a scanned visit.
*/

CREATE UNIQUE INDEX IF NOT EXISTS ventes_visite_id_key ON ventes (visite_id);
