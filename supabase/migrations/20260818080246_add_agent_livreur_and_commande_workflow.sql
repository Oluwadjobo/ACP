-- ============================================================
-- Agent livreur profile + Commercial↔Agent associations + Commande workflow
-- All tables are team-scoped to preserve multi-tenant isolation.
-- ============================================================

-- 1) Agents livreurs table (mirrors commerciaux/superviseurs structure)
CREATE TABLE IF NOT EXISTS agents_livreur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant text NOT NULL,
  full_name text NOT NULL,
  telephone text,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique identifiant within a team (or globally if team_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS agents_livreur_identifiant_idx
  ON agents_livreur (identifiant, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 2) Commercial ↔ Agent livreur junction (many-to-many, team-scoped)
CREATE TABLE IF NOT EXISTS commercial_agent_livreur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id uuid NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  agent_livreur_id uuid NOT NULL REFERENCES agents_livreur(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commercial_id, agent_livreur_id)
);

-- 3) Commandes (orders) — created by commerciaux, delivered by agents livreurs
CREATE TABLE IF NOT EXISTS commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  commercial_id uuid REFERENCES commerciaux(id) ON DELETE SET NULL,
  agent_livreur_id uuid REFERENCES agents_livreur(id) ON DELETE SET NULL,
  secteur_id uuid REFERENCES secteurs(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'enregistree'
    CHECK (statut IN ('enregistree','en_attente_livraison','en_cours_livraison','livree','annulee','non_livree')),
  date_commande timestamptz NOT NULL DEFAULT now(),
  date_livraison timestamptz,
  agent_validation_at timestamptz,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commandes_code_idx
  ON commandes (code, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4) Commande lignes (products + quantities)
CREATE TABLE IF NOT EXISTS commande_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES produits(id) ON DELETE SET NULL,
  produit_nom text NOT NULL,
  quantite integer NOT NULL CHECK (quantite > 0),
  unite text DEFAULT 'unité',
  observation text,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5) Commande status history (historisation des statuts)
CREATE TABLE IF NOT EXISTS commande_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  ancien_statut text,
  nouveau_statut text NOT NULL,
  modifie_par text,
  user_role text,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6) Livraison traceability (validation record by agent livreur)
CREATE TABLE IF NOT EXISTS livraisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  agent_livreur_id uuid NOT NULL REFERENCES agents_livreur(id) ON DELETE CASCADE,
  point_vente_id uuid NOT NULL REFERENCES points_vente(id) ON DELETE CASCADE,
  commercial_id uuid REFERENCES commerciaux(id) ON DELETE SET NULL,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  statut_final text NOT NULL,
  date_livraison timestamptz NOT NULL DEFAULT now(),
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE agents_livreur ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_agent_livreur ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commande_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commande_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE livraisons ENABLE ROW LEVEL SECURITY;

-- Deny by default; the edge function (service role) bypasses RLS.
-- No policies needed for direct browser access since all access goes through the edge function.
