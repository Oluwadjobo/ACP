CREATE TABLE IF NOT EXISTS admin_data_cleanup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid NOT NULL,
  actor_name text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('commercial', 'superviseur', 'agent_livreur')),
  target_id uuid NOT NULL,
  target_name text NOT NULL,
  deleted_records jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_data_cleanup_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS admin_data_cleanup_audit_created_at_idx
  ON admin_data_cleanup_audit (created_at DESC);

CREATE OR REPLACE FUNCTION admin_cleanup_delete(
  p_actor_id uuid,
  p_actor_name text,
  p_target_type text,
  p_target_id uuid,
  p_target_name text,
  p_selected jsonb,
  p_second_confirmation text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_deleted jsonb := '{}'::jsonb;
  v_audit_id uuid;
  v_affected_count integer;
  v_cascade_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_actor_id AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Réservé au super administrateur';
  END IF;
  IF p_target_type IS NULL OR p_target_type NOT IN ('commercial', 'superviseur', 'agent_livreur')
    OR p_selected IS NULL OR jsonb_typeof(p_selected) <> 'object' THEN
    RAISE EXCEPTION 'Sélection de nettoyage invalide';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_selected) AS keys(key)
    WHERE key NOT IN ('points_vente', 'visites', 'ventes', 'bons_livraison', 'promesses_achat',
      'controles_terrain', 'livraisons', 'commandes', 'commercial_tournees',
      'team_leader_tournees', 'commercial_agent_livreur')
  ) OR EXISTS (SELECT 1 FROM jsonb_each(p_selected) e WHERE jsonb_typeof(e.value) <> 'array') THEN
    RAISE EXCEPTION 'Sélection de catégorie invalide';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_each(p_selected) e WHERE jsonb_array_length(e.value) > 0) THEN
    RAISE EXCEPTION 'Sélectionnez au moins un élément';
  END IF;

  IF p_target_type = 'commercial' AND NOT EXISTS (SELECT 1 FROM commerciaux WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Commercial introuvable';
  ELSIF p_target_type = 'superviseur' AND NOT EXISTS (SELECT 1 FROM superviseurs WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Superviseur introuvable';
  ELSIF p_target_type = 'agent_livreur' AND NOT EXISTS (SELECT 1 FROM agents_livreur WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Agent livreur introuvable';
  END IF;

  PERFORM 1 FROM points_vente
  WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'points_vente', '[]'::jsonb)))
  FOR UPDATE;
  PERFORM 1 FROM secteurs s
  JOIN points_vente p ON p.secteur_id = s.id
  WHERE p.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'points_vente', '[]'::jsonb)))
  FOR UPDATE OF s;
  PERFORM 1 FROM visites
  WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb)))
  FOR UPDATE;
  PERFORM 1 FROM ventes
  WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)))
  FOR UPDATE;
  PERFORM 1 FROM bons_livraison
  WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb)))
  FOR UPDATE;
  PERFORM 1 FROM commandes
  WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)))
  FOR UPDATE;

  SELECT COALESCE(SUM(jsonb_array_length(e.value)), 0)::integer INTO v_affected_count
  FROM jsonb_each(p_selected) e;
  SELECT
    (SELECT COUNT(*) FROM vente_lignes
      WHERE vente_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)))) +
    (SELECT COUNT(*) FROM bl_lignes
      WHERE bl_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb)))) +
    (SELECT COUNT(*) FROM commande_lignes
      WHERE commande_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)))) +
    (SELECT COUNT(*) FROM commande_status_history
      WHERE commande_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb))))
  INTO v_cascade_count;
  IF v_affected_count + v_cascade_count >= 10
    AND p_second_confirmation IS DISTINCT FROM 'SUPPRIMER DÉFINITIVEMENT' THEN
    RAISE EXCEPTION 'La seconde confirmation est requise pour dix éléments ou plus';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'points_vente', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM points_vente p WHERE p.id = x.value::uuid
      AND p.created_by = p_target_id AND p.created_by_role = p_target_type)
  ) THEN RAISE EXCEPTION 'Un POS sélectionné ne correspond pas au créateur enregistré'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM visites v WHERE v.id = x.value::uuid AND
      ((p_target_type = 'commercial' AND v.commercial_id = p_target_id) OR
       (p_target_type = 'superviseur' AND v.superviseur_id = p_target_id))
      AND (v.commercial_id IS NULL OR (p_target_type = 'commercial' AND v.commercial_id = p_target_id))
      AND (v.superviseur_id IS NULL OR (p_target_type = 'superviseur' AND v.superviseur_id = p_target_id)))
  ) THEN RAISE EXCEPTION 'Une visite sélectionnée n’est pas directement liée à cet agent'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM ventes v WHERE v.id = x.value::uuid AND
      ((p_target_type = 'commercial' AND v.commercial_id = p_target_id) OR
       (p_target_type = 'superviseur' AND v.superviseur_id = p_target_id) OR
       v.visite_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb))))
      AND (v.commercial_id IS NULL OR (p_target_type = 'commercial' AND v.commercial_id = p_target_id))
      AND (v.superviseur_id IS NULL OR (p_target_type = 'superviseur' AND v.superviseur_id = p_target_id)))
  ) THEN RAISE EXCEPTION 'Une vente sélectionnée n’est pas directement liée aux éléments sélectionnés'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM bons_livraison b WHERE b.id = x.value::uuid AND
      ((p_target_type = 'commercial' AND b.commercial_id = p_target_id) OR
       (p_target_type = 'superviseur' AND b.superviseur_id = p_target_id) OR
       b.vente_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb))))
      AND (b.commercial_id IS NULL OR (p_target_type = 'commercial' AND b.commercial_id = p_target_id))
      AND (b.superviseur_id IS NULL OR (p_target_type = 'superviseur' AND b.superviseur_id = p_target_id)))
  ) THEN RAISE EXCEPTION 'Un bon de livraison sélectionné n’est pas directement lié aux éléments sélectionnés'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'promesses_achat', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM promesses_achat p WHERE p.id = x.value::uuid AND
      ((p_target_type = 'superviseur' AND p.superviseur_id = p_target_id) OR
       (p_target_type = 'superviseur' AND p.visite_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb))))))
  ) THEN RAISE EXCEPTION 'Une promesse sélectionnée n’est pas directement liée aux éléments sélectionnés'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'controles_terrain', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM controles_terrain c WHERE c.id = x.value::uuid
      AND p_target_type = 'superviseur' AND c.superviseur_id = p_target_id)
  ) THEN RAISE EXCEPTION 'Un contrôle sélectionné n’est pas directement lié à ce superviseur'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'livraisons', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM livraisons l WHERE l.id = x.value::uuid AND
      ((p_target_type = 'agent_livreur' AND l.agent_livreur_id = p_target_id AND
        (l.commercial_id IS NULL OR l.commercial_id = p_target_id)) OR
       (p_target_type = 'commercial' AND l.commercial_id = p_target_id AND l.agent_livreur_id IS NULL)))
  ) THEN RAISE EXCEPTION 'Une livraison sélectionnée n’est pas directement liée à cet agent'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM commandes c WHERE c.id = x.value::uuid
      AND p_target_type = 'commercial' AND c.commercial_id = p_target_id
      AND NOT EXISTS (SELECT 1 FROM livraisons l WHERE l.commande_id = c.id AND l.agent_livreur_id IS NOT NULL))
  ) THEN RAISE EXCEPTION 'Une commande ne peut être supprimée que si elle est créée par le commercial ciblé'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'commercial_tournees', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM commercial_tournees a WHERE a.id = x.value::uuid
      AND p_target_type = 'commercial' AND a.commercial_id = p_target_id)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'team_leader_tournees', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM team_leader_tournees a WHERE a.id = x.value::uuid
      AND p_target_type = 'superviseur' AND a.superviseur_id = p_target_id)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'commercial_agent_livreur', '[]'::jsonb)) x
    WHERE NOT EXISTS (SELECT 1 FROM commercial_agent_livreur a WHERE a.id = x.value::uuid
      AND ((p_target_type = 'commercial' AND a.commercial_id = p_target_id) OR
           (p_target_type = 'agent_livreur' AND a.agent_livreur_id = p_target_id)))
  ) THEN RAISE EXCEPTION 'Une affectation sélectionnée n’est pas directement liée à cet agent'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb)) x
    JOIN ventes v ON v.visite_id = x.value::uuid
    WHERE NOT (v.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb))))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb)) x
    JOIN promesses_achat p ON p.visite_id = x.value::uuid
    WHERE NOT (p.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'promesses_achat', '[]'::jsonb))))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)) x
    JOIN bons_livraison b ON b.vente_id = x.value::uuid
    WHERE NOT (b.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb))))
  ) THEN RAISE EXCEPTION 'Sélection incomplète : sélectionnez aussi les dépendances ou retirez le parent'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)) x
    JOIN livraisons l ON l.commande_id = x.value::uuid
    WHERE l.id NOT IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'livraisons', '[]'::jsonb)))
  ) THEN RAISE EXCEPTION 'Cette commande est utilisée par une livraison non sélectionnée'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_selected->'points_vente', '[]'::jsonb)) x
    WHERE EXISTS (
      SELECT 1 FROM visites v WHERE v.point_vente_id = x.value::uuid AND
        (NOT (v.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb))))
         OR (v.commercial_id IS NOT NULL AND (p_target_type <> 'commercial' OR v.commercial_id <> p_target_id))
         OR (v.superviseur_id IS NOT NULL AND (p_target_type <> 'superviseur' OR v.superviseur_id <> p_target_id)))
    ) OR EXISTS (
      SELECT 1 FROM ventes v WHERE v.point_vente_id = x.value::uuid AND
        (NOT (v.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb))))
         OR (v.commercial_id IS NOT NULL AND (p_target_type <> 'commercial' OR v.commercial_id <> p_target_id))
         OR (v.superviseur_id IS NOT NULL AND (p_target_type <> 'superviseur' OR v.superviseur_id <> p_target_id)))
    ) OR EXISTS (
      SELECT 1 FROM bons_livraison b WHERE b.point_vente_id = x.value::uuid AND
        (NOT (b.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb))))
         OR (b.commercial_id IS NOT NULL AND (p_target_type <> 'commercial' OR b.commercial_id <> p_target_id))
         OR (b.superviseur_id IS NOT NULL AND (p_target_type <> 'superviseur' OR b.superviseur_id <> p_target_id)))
    ) OR EXISTS (
      SELECT 1 FROM promesses_achat p WHERE p.point_vente_id = x.value::uuid AND
        (NOT (p.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'promesses_achat', '[]'::jsonb))))
         OR p.superviseur_id IS DISTINCT FROM p_target_id OR p_target_type <> 'superviseur')
    ) OR EXISTS (
      SELECT 1 FROM controles_terrain c WHERE c.point_vente_id = x.value::uuid AND
        (NOT (c.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'controles_terrain', '[]'::jsonb))))
         OR c.superviseur_id IS DISTINCT FROM p_target_id OR p_target_type <> 'superviseur')
    ) OR EXISTS (
      SELECT 1 FROM commandes c WHERE c.point_vente_id = x.value::uuid
    ) OR EXISTS (
      SELECT 1 FROM livraisons l WHERE l.point_vente_id = x.value::uuid AND
        (NOT (l.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'livraisons', '[]'::jsonb))))
         OR (l.agent_livreur_id IS NOT NULL AND (p_target_type <> 'agent_livreur' OR l.agent_livreur_id <> p_target_id))
         OR (l.commercial_id IS NOT NULL AND (p_target_type <> 'commercial' OR l.commercial_id <> p_target_id)))
    ) OR EXISTS (
      SELECT 1 FROM commercial_tournees a
      JOIN commerciaux c ON c.id = a.commercial_id AND c.active = true
      JOIN points_vente p ON p.secteur_id = a.secteur_id
      WHERE p.id = x.value::uuid AND a.commercial_id <> p_target_id
    ) OR EXISTS (
      SELECT 1 FROM team_leader_tournees a
      JOIN superviseurs s ON s.id = a.superviseur_id AND s.active = true
      JOIN points_vente p ON p.secteur_id = a.secteur_id
      WHERE p.id = x.value::uuid AND a.superviseur_id <> p_target_id
    )
  ) THEN RAISE EXCEPTION 'POS protégé : il possède des relations ou un usage par un autre agent'; END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM vente_lignes
  WHERE vente_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)));
  v_deleted := v_deleted || jsonb_build_object('vente_lignes', to_jsonb(v_ids));
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM bl_lignes
  WHERE bl_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb)));
  v_deleted := v_deleted || jsonb_build_object('bl_lignes', to_jsonb(v_ids));
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM commande_lignes
  WHERE commande_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)));
  v_deleted := v_deleted || jsonb_build_object('commande_lignes', to_jsonb(v_ids));
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM commande_status_history
  WHERE commande_id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)));
  v_deleted := v_deleted || jsonb_build_object('commande_status_history', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'bons_livraison', '[]'::jsonb)));
  DELETE FROM bons_livraison WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('bons_livraison', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'ventes', '[]'::jsonb)));
  DELETE FROM ventes WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('ventes', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'promesses_achat', '[]'::jsonb)));
  DELETE FROM promesses_achat WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('promesses_achat', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'controles_terrain', '[]'::jsonb)));
  DELETE FROM controles_terrain WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('controles_terrain', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'livraisons', '[]'::jsonb)));
  DELETE FROM livraisons WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('livraisons', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commandes', '[]'::jsonb)));
  DELETE FROM commandes WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('commandes', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'visites', '[]'::jsonb)));
  DELETE FROM visites WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('visites', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commercial_tournees', '[]'::jsonb)));
  DELETE FROM commercial_tournees WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('commercial_tournees', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'team_leader_tournees', '[]'::jsonb)));
  DELETE FROM team_leader_tournees WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('team_leader_tournees', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'commercial_agent_livreur', '[]'::jsonb)));
  DELETE FROM commercial_agent_livreur WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('commercial_agent_livreur', to_jsonb(v_ids));

  v_ids := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_selected->'points_vente', '[]'::jsonb)));
  DELETE FROM points_vente WHERE id = ANY(v_ids);
  v_deleted := v_deleted || jsonb_build_object('points_vente', to_jsonb(v_ids));

  INSERT INTO admin_data_cleanup_audit (actor_admin_id, actor_name, target_type, target_id, target_name, deleted_records)
  VALUES (p_actor_id, p_actor_name, p_target_type, p_target_id, p_target_name, v_deleted)
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('audit_id', v_audit_id, 'deleted_records', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION admin_cleanup_delete(uuid, text, text, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_cleanup_delete(uuid, text, text, uuid, text, jsonb, text) TO service_role;
REVOKE ALL ON TABLE admin_data_cleanup_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE admin_data_cleanup_audit TO service_role;
