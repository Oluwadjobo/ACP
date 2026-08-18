import { useState, useEffect } from "react";
import { Truck, Plus, Trash2, RefreshCw, Loader2, Search, X, Store, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Modal } from "@/components/Modal";
import { PermissionsEditor } from "@/components/PermissionsEditor";
import { Toast } from "@/components/Toast";
import type { AgentLivreur, Commercial } from "@/types";

export function AdminAgentsLivreur() {
  const { hasPermission } = useAuth();
  const [agents, setAgents] = useState<AgentLivreur[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentLivreur | null>(null);
  const [showPermEditor, setShowPermEditor] = useState<AgentLivreur | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [agentList, commList] = await Promise.all([api.listAgentsLivreur(), api.listCommerciaux()]);
      setAgents(agentList);
      setCommerciaux(commList);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet agent livreur ?")) return;
    try {
      await api.deleteAgentLivreur(id);
      setToast("Agent supprimé");
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleToggleActive = async (agent: AgentLivreur) => {
    try {
      await api.updateAgentLivreur(agent.id, { active: !agent.active });
      setToast(agent.active ? "Agent désactivé" : "Agent activé");
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={26} className="text-primary-700" /> Agents livreur
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les livreurs et leurs associations avec les commerciaux</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus size={18} /> Créer un agent
        </button>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
      ) : agents.length === 0 ? (
        <div className="card text-center py-12">
          <Truck size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun agent livreur créé</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div key={agent.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Truck size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{agent.full_name}</p>
                    <p className="text-xs text-gray-500">{agent.identifiant}</p>
                  </div>
                </div>
                <span className={`badge ${agent.active ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"}`}>
                  {agent.active ? "Actif" : "Désactivé"}
                </span>
              </div>

              {agent.telephone && <p className="text-xs text-gray-500 mb-3">Tél: {agent.telephone}</p>}

              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Commerciaux associés:</p>
                {agent.commerciaux && agent.commerciaux.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {agent.commerciaux.map((c) => (
                      <span key={c.id} className="badge bg-primary-50 text-primary-700 text-xs">{c.full_name}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Aucun commercial associé</p>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => setEditingAgent(agent)} className="btn-secondary text-xs flex-1">Modifier</button>
                <button onClick={() => setShowPermEditor(agent)} className="btn-ghost text-xs">Permissions</button>
                <button onClick={() => handleToggleActive(agent)} className="btn-ghost text-xs">{agent.active ? "Désactiver" : "Activer"}</button>
                <button onClick={() => handleDelete(agent.id)} className="btn-ghost text-xs text-error-600 hover:bg-error-50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <AgentFormModal
          commerciaux={commerciaux}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { setShowCreateModal(false); load(); setToast("Agent créé"); }}
        />
      )}

      {editingAgent && (
        <AgentFormModal
          agent={editingAgent}
          commerciaux={commerciaux}
          onClose={() => setEditingAgent(null)}
          onSaved={() => { setEditingAgent(null); load(); setToast("Agent modifié"); }}
        />
      )}

      {showPermEditor && (
        <Modal title={`Permissions - ${showPermEditor.full_name}`} onClose={() => setShowPermEditor(null)}>
          <PermissionsEditor
            userType="agent_livreur"
            userId={showPermEditor.id}
            userLabel={showPermEditor.full_name}
          />
        </Modal>
      )}
    </div>
  );
}

function AgentFormModal({ agent, commerciaux, onClose, onSaved }: {
  agent?: AgentLivreur;
  commerciaux: Commercial[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [identifiant, setIdentifiant] = useState(agent?.identifiant || "");
  const [fullName, setFullName] = useState(agent?.full_name || "");
  const [password, setPassword] = useState("");
  const [telephone, setTelephone] = useState(agent?.telephone || "");
  const [selectedCommIds, setSelectedCommIds] = useState<string[]>(agent?.commerciaux?.map((c) => c.id) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCommercial = (id: string) => {
    setSelectedCommIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifiant.trim() || !fullName.trim()) { setError("Identifiant et nom requis"); return; }
    if (!agent && (!password || password.length < 8)) { setError("Mot de passe (8 caractères min.)"); return; }
    setSaving(true);
    try {
      if (agent) {
        await api.updateAgentLivreur(agent.id, {
          full_name: fullName, telephone,
          commercial_ids: selectedCommIds,
        });
      } else {
        await api.createAgentLivreur({
          identifiant, full_name: fullName, password, telephone,
          commercial_ids: selectedCommIds,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={agent ? "Modifier l'agent" : "Créer un agent livreur"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-3 py-2 text-sm text-error-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Identifiant</label>
            <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} disabled={!!agent} required />
          </div>
          <div>
            <label className="label">Nom complet</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </div>
          {!agent && (
            <div>
              <label className="label">Mot de passe</label>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
          )}
        </div>

        <div>
          <label className="label flex items-center gap-1.5"><UserPlus size={14} /> Commerciaux associés</label>
          <div className="max-h-48 overflow-y-auto scrollbar-thin border border-gray-200 rounded-lg divide-y divide-gray-50">
            {commerciaux.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">Aucun commercial disponible</p>
            ) : commerciaux.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCommIds.includes(c.id)}
                  onChange={() => toggleCommercial(c.id)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                  <p className="text-xs text-gray-500">{c.identifiant}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {agent ? "Enregistrer" : "Créer"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
