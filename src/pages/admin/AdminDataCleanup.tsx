import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CleanupAgent, CleanupAgentType, CleanupAuditEntry, CleanupPreview, Team } from "@/types";

const ROLE_LABELS: Record<CleanupAgentType, string> = {
  commercial: "Commercial",
  superviseur: "Superviseur",
  agent_livreur: "Livreur",
};

function recordCount(records: Record<string, string[]>): number {
  return Object.values(records).reduce((count, ids) => count + ids.length, 0);
}

export function AdminDataCleanup() {
  const { isSuperAdmin } = useAuth();
  const [agents, setAgents] = useState<CleanupAgent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [audit, setAudit] = useState<CleanupAuditEntry[]>([]);
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [secondConfirmation, setSecondConfirmation] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedAgent = agents.find((agent) => `${agent.agent_type}:${agent.id}` === agentKey);
  const selectedCount = Object.values(selection).reduce((count, ids) => count + ids.size, 0);
  const cascadeParentFields: Record<string, { category: string; field: string }> = {
    vente_lignes: { category: "ventes", field: "vente_id" },
    bl_lignes: { category: "bons_livraison", field: "bl_id" },
    commande_lignes: { category: "commandes", field: "commande_id" },
    commande_status_history: { category: "commandes", field: "commande_id" },
  };
  const cascadingItems = preview
    ? Object.entries(cascadeParentFields).flatMap(([category, parent]) =>
      (preview.categories[category]?.records || [])
        .filter((record) => selection[parent.category]?.has(String(record.row[parent.field] || "")))
        .map((record) => ({ category, record })),
    )
    : [];
  const affectedCount = selectedCount + cascadingItems.length;
  const selectedTeam = teams.find((team) => team.id === preview?.agent.team_id);
  const assignedTours = preview
    ? [...(preview.categories.commercial_tournees?.records || []), ...(preview.categories.team_leader_tournees?.records || [])]
      .map((record) => record.detail.split(" · ")[0])
    : [];
  const perimeterSectors = preview
    ? (preview.categories.points_vente_perimetre?.records || []).map((record) => record.detail.split(" · ")[0])
    : [];
  const sectorSummary = [...new Set(assignedTours.length ? assignedTours : perimeterSectors)].join(", ") || "Aucune tournée directement renseignée";
  const needsSecondConfirmation = affectedCount >= 10;
  const visibleAgents = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return agents;
    return agents.filter((agent) =>
      `${agent.full_name} ${agent.identifiant} ${ROLE_LABELS[agent.agent_type]}`.toLocaleLowerCase().includes(term),
    );
  }, [agents, query]);

  const refreshAudit = async () => {
    try {
      const entries = await api.listDataCleanupAudit();
      setAudit(entries);
      setAuditError(null);
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : "Journal indisponible");
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.listDataCleanupAgents(), api.listTeams()])
      .then(([loadedAgents, loadedTeams]) => {
        if (cancelled) return;
        setAgents(loadedAgents);
        setTeams(loadedTeams);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Impossible de charger la liste des agents");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void refreshAudit();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!selectedAgent) {
      setPreview(null);
      setSelection({});
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    setNotice(null);
    setSelection({});
    api.getDataCleanupPreview(selectedAgent.agent_type, selectedAgent.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPreview(null);
          setError(cause instanceof Error ? cause.message : "La prévisualisation n’a pas pu être chargée");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => { cancelled = true; };
  }, [selectedAgent]);

  const setRecordSelected = (category: string, id: string, checked: boolean) => {
    setSelection((current) => {
      const next = new Set(current[category] || []);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...current, [category]: next };
    });
  };

  const toggleCategory = (category: string, checked: boolean) => {
    const records = preview?.categories[category]?.records || [];
    setSelection((current) => ({
      ...current,
      [category]: checked
        ? new Set(records.filter((record) => record.selectable).map((record) => record.id))
        : new Set(),
    }));
  };

  const selectAll = (checked: boolean) => {
    if (!preview) return;
    const next: Record<string, Set<string>> = {};
    for (const [category, data] of Object.entries(preview.categories)) {
      next[category] = new Set(checked
        ? data.records.filter((record) => record.selectable).map((record) => record.id)
        : []);
    }
    setSelection(next);
  };

  const executeCleanup = async () => {
    if (!preview || !selectedAgent || confirmation !== "SUPPRIMER") return;
    if (needsSecondConfirmation && secondConfirmation !== "SUPPRIMER DÉFINITIVEMENT") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const selected = Object.fromEntries(
        Object.entries(selection).filter(([, ids]) => ids.size > 0).map(([category, ids]) => [category, [...ids]]),
      );
      const result = await api.deleteDataCleanupSelection({
        agent_type: selectedAgent.agent_type,
        agent_id: selectedAgent.id,
        selected,
        confirmation,
        ...(needsSecondConfirmation ? { second_confirmation: secondConfirmation } : {}),
      });
      setNotice(`${recordCount(result.deleted_records)} élément(s) supprimé(s). Journal : ${result.audit_id}`);
      setShowConfirmation(false);
      setConfirmation("");
      setSecondConfirmation("");
      setSelection({});
      const [nextPreview] = await Promise.all([
        api.getDataCleanupPreview(selectedAgent.agent_type, selectedAgent.id),
        refreshAudit(),
      ]);
      setPreview(nextPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La suppression a échoué");
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin) {
    return <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">Accès réservé au Super Admin.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Trash2 size={24} className="text-primary-700" />
          Nettoyage des données
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Prévisualisez et sélectionnez des données métier individuellement. Les comptes agents ne sont jamais supprimés.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <label className="block">
          <span className="label">Rechercher un agent</span>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou identifiant" />
          </div>
        </label>
        <label className="block">
          <span className="label">Agent ciblé</span>
          <select className="input" value={agentKey} disabled={loading} onChange={(event) => setAgentKey(event.target.value)}>
            <option value="">Sélectionner un agent</option>
            {visibleAgents.map((agent) => (
              <option key={`${agent.agent_type}:${agent.id}`} value={`${agent.agent_type}:${agent.id}`}>
                {agent.full_name} — {agent.identifiant} · {ROLE_LABELS[agent.agent_type]} · {agent.active ? "Actif" : "Inactif"}
              </option>
            ))}
          </select>
          {selectedAgent && (
            <span className="mt-2 block text-sm text-gray-600">
              {ROLE_LABELS[selectedAgent.agent_type]} · Équipe : {teams.find((team) => team.id === selectedAgent.team_id)?.name || "Non renseignée"} · Statut : {selectedAgent.active ? "Actif" : "Inactif"}
            </span>
          )}
        </label>
      </section>

      {error && <div role="alert" className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{notice}</div>}
      {auditError && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Journal indisponible : {auditError}
        </div>
      )}
      {loadingPreview && <div className="card flex items-center gap-3 p-5 text-sm text-gray-600"><RefreshCw size={16} className="animate-spin" /> Lecture des données liées…</div>}

      {preview && !loadingPreview && (
        <>
          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{preview.agent.full_name}</h2>
                <p className="text-sm text-gray-600">
                  {preview.agent.identifiant} · {ROLE_LABELS[preview.agent.agent_type]} · {selectedTeam?.code || "Équipe inconnue"} — {selectedTeam?.name || ""}
                  · {preview.agent.active ? "Actif" : "Inactif"}
                </p>
                <p className="mt-1 text-xs text-gray-500">Secteur(s)/tournée(s) actuels : {sectorSummary}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => selectAll(true)}>Sélectionner tout</button>
                <button className="btn-secondary" onClick={() => selectAll(false)}>Désélectionner tout</button>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
              <p>Les données ne sont jamais considérées comme des tests sur la seule base de leur auteur. Les POS avec usage ou affectation à un autre agent sont verrouillés. Les tournées/secteurs eux-mêmes et le compte agent ne sont jamais supprimés.</p>
            </div>

            {Object.entries(preview.categories).map(([key, category]) => (
              <section key={key} className="rounded-xl border border-gray-200">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">{category.title}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{category.records.length}</span>
                  </div>
                  {category.records.some((record) => record.selectable) && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={category.records.filter((record) => record.selectable).length > 0 &&
                          category.records.filter((record) => record.selectable).every((record) => selection[key]?.has(record.id))}
                        onChange={(event) => toggleCategory(key, event.target.checked)}
                      />
                      Tout sélectionner dans cette catégorie
                    </label>
                  )}
                </header>
                {category.records.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">Aucun élément trouvé.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {category.records.map((record) => {
                      const usage = record.row.usage as Record<string, number> | undefined;
                      const visitUsers = record.row.visit_users as string[] | undefined;
                      return (
                        <label key={record.id} className={`flex gap-3 px-4 py-3 ${record.selectable ? "cursor-pointer" : "bg-amber-50/50"}`}>
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={!record.selectable}
                            checked={selection[key]?.has(record.id) || false}
                            onChange={(event) => setRecordSelected(key, record.id, event.target.checked)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-800">{record.label}</span>
                            <span className="block text-xs text-gray-600">{record.detail}</span>
                            {key === "points_vente" && (
                              <span className="mt-2 block space-y-1 text-xs text-gray-600">
                                <span className="block">POS ID : {record.id} · Code : {String(record.row.code || "—")} · QR : {record.row.qr_configured ? "configuré" : "absent"}</span>
                                <span className="block">Équipe : {teams.find((team) => team.id === record.row.team_id)?.code || String(record.row.team_id || "—")} · Secteur : {String(record.row.secteur_id || "—")} · created_by : {String(record.row.created_by || "—")} ({String(record.row.created_by_role || "rôle inconnu")}) · Statut : {record.row.active === false ? "inactif" : "actif"}</span>
                                <span className="block">Relations — visites : {usage?.visites || 0}, ventes : {usage?.ventes || 0}, promesses : {usage?.promesses || 0}, contrôles : {usage?.controles || 0}, BL : {usage?.bons_livraison || 0}, livraisons : {usage?.livraisons || 0}, commandes : {usage?.commandes || 0}</span>
                                <span className="block">Utilisateurs ayant visité : {visitUsers?.length ? visitUsers.join(", ") : "aucun identifié"}</span>
                              </span>
                            )}
                            {record.provenance_warning && <span className="mt-1 block text-xs text-amber-800">{record.provenance_warning}</span>}
                            {record.protection_reason && <span className="mt-1 block text-xs font-medium text-amber-800">POS conservé : {record.protection_reason}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-600">{selectedCount} élément(s) sélectionné(s), {cascadingItems.length} dépendance(s) incluse(s)</p>
              <button
                className="btn-primary"
                disabled={selectedCount === 0 || saving}
                onClick={() => setShowConfirmation(true)}
              >
                <Trash2 size={16} /> Supprimer la sélection
              </button>
            </div>
          </section>
        </>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><ClipboardList size={18} /> Journal des opérations</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune opération journalisée.</p>
        ) : (
          <div className="space-y-3">
            {audit.map((entry) => (
              <details key={entry.id} className="rounded-lg border border-gray-200 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-800">
                  {new Date(entry.created_at).toLocaleString()} · {entry.actor_name} · {entry.target_name} ({ROLE_LABELS[entry.target_type]}) · {recordCount(entry.deleted_records)} élément(s)
                </summary>
                <pre className="mt-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-600">{JSON.stringify(entry.deleted_records, null, 2)}</pre>
              </details>
            ))}
          </div>
        )}
      </section>

      {showConfirmation && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="cleanup-confirm-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="cleanup-confirm-title" className="flex items-center gap-2 text-lg font-bold text-red-700">
              <AlertTriangle size={20} /> Suppression de données
            </h2>
            <p className="text-sm text-gray-700">
              Agent sélectionné : <strong>{preview.agent.full_name} ({preview.agent.identifiant})</strong><br />
              Éléments sélectionnés : <strong>{selectedCount}</strong> ; dépendances supprimées avec leur parent : <strong>{cascadingItems.length}</strong> ; total prévu : <strong>{affectedCount}</strong>.
              Cette opération est irréversible. Le compte agent et son profil seront conservés.
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs">
              {Object.entries(selection).flatMap(([category, ids]) => {
                const title = preview.categories[category]?.title || category;
                return [...ids].map((id) => {
                  const record = preview.categories[category]?.records.find((item) => item.id === id);
                  return <p key={`${category}:${id}`}>{title} · {record?.label || id}</p>;
                });
              })}
            </div>
            {cascadingItems.length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Dépendances incluses par suppression du parent :</strong>
                {cascadingItems.map(({ category, record }) => (
                  <p key={`${category}:${record.id}`}>{preview.categories[category]?.title} · {record.label} · {record.detail}</p>
                ))}
              </div>
            )}
            <label className="block">
              <span className="label">Saisissez SUPPRIMER pour confirmer</span>
              <input className="input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            {needsSecondConfirmation && (
              <label className="block">
                <span className="label">Seconde confirmation : SUPPRIMER DÉFINITIVEMENT</span>
                <input className="input" value={secondConfirmation} onChange={(event) => setSecondConfirmation(event.target.value)} />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setShowConfirmation(false)}>Annuler</button>
              <button
                className="btn-danger"
                disabled={saving || confirmation !== "SUPPRIMER" || (needsSecondConfirmation && secondConfirmation !== "SUPPRIMER DÉFINITIVEMENT")}
                onClick={() => void executeCleanup()}
              >
                {saving ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
            <p className="flex items-center gap-2 text-xs text-gray-500"><ShieldCheck size={14} /> Contrôles de sécurité vérifiés à nouveau côté serveur avant la transaction.</p>
          </section>
        </div>
      )}
    </div>
  );
}
