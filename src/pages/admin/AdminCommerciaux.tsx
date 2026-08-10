import { useEffect, useState } from "react";
import { UserPlus, Search, Pencil, KeyRound, Trash2, UserCheck, UserX, Users, Shield } from "lucide-react";
import { api } from "@/lib/api";
import type { Commercial, Superviseur } from "@/types";
import { Modal } from "@/components/Modal";
import { PermissionsEditor } from "@/components/PermissionsEditor";
import { formatDate } from "@/lib/format";

export function AdminCommerciaux() {
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Commercial | null>(null);
  const [passwordModal, setPasswordModal] = useState<Commercial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Commercial | null>(null);
  const [permsTarget, setPermsTarget] = useState<Commercial | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listCommerciaux().then(setCommerciaux).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = commerciaux.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.identifiant.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commerciaux</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les comptes de vos commerciaux terrain</p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="btn-primary"
        >
          <UserPlus size={18} />
          Ajouter
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-11"
          placeholder="Rechercher par nom ou identifiant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Users size={26} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Aucun commercial trouvé</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((c) => (
              <div key={c.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  c.active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-400"
                }`}>
                  {c.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{c.full_name}</p>
                    {c.superviseur_nom && <span className="badge bg-blue-50 text-blue-600">{c.superviseur_nom}</span>}
                    {c.secteur_nom && <span className="badge bg-primary-50 text-primary-600">{c.secteur_nom}</span>}
                    <span className={`badge ${c.active ? "bg-accent-50 text-accent-700" : "bg-gray-100 text-gray-500"}`}>
                      {c.active ? (
                        <><UserCheck size={12} /> Actif</>
                      ) : (
                        <><UserX size={12} /> Désactivé</>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Identifiant : {c.identifiant}{c.telephone ? ` — ${c.telephone}` : ""}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Créé le {formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => { setEditing(c); setModalOpen(true); }}
                    className="btn-ghost p-2 rounded-lg"
                    title="Modifier"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setPasswordModal(c)}
                    className="btn-ghost p-2 rounded-lg"
                    title="Réinitialiser le mot de passe"
                  >
                    <KeyRound size={16} />
                  </button>
                  <button
                    onClick={() => setPermsTarget(c)}
                    className="btn-ghost p-2 rounded-lg"
                    title="Permissions"
                  >
                    <Shield size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="btn-ghost p-2 rounded-lg text-error-500 hover:bg-error-50"
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <CommercialModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load(); }}
        showToast={showToast}
      />

      {/* Password reset modal */}
      <PasswordModal
        commercial={passwordModal}
        onClose={() => setPasswordModal(null)}
        onSaved={() => { setPasswordModal(null); showToast("success", "Mot de passe réinitialisé"); }}
        showToast={showToast}
      />

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer le commercial"
        maxWidth="max-w-md"
      >
        <p className="text-gray-600 text-sm mb-6">
          Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.full_name}</strong> ?
          Cette action supprimera également tout l'historique de ses visites. Cette opération est irréversible.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
          <button
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await api.deleteCommercial(deleteTarget.id);
                setDeleteTarget(null);
                load();
                showToast("success", "Commercial supprimé");
              } catch {
                showToast("error", "Erreur lors de la suppression");
              }
            }}
            className="btn-danger"
          >
            Supprimer
          </button>
        </div>
      </Modal>

      {/* Permissions editor */}
      <Modal open={!!permsTarget} onClose={() => setPermsTarget(null)} title="Permissions" maxWidth="max-w-2xl">
        {permsTarget && (
          <PermissionsEditor userType="commercial" userId={permsTarget.id} userLabel={permsTarget.full_name} />
        )}
      </Modal>
    </div>
  );
}

function CommercialModal({
  open, editing, onClose, onSaved, showToast,
}: {
  open: boolean;
  editing: Commercial | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [telephone, setTelephone] = useState("");
  const [superviseurId, setSuperviseurId] = useState("");
  const [superviseurs, setSuperviseurs] = useState<Superviseur[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.listSuperviseurs().then(setSuperviseurs).catch(() => {});
      setIdentifiant(editing?.identifiant || "");
      setFullName(editing?.full_name || "");
      setPassword("");
      setTelephone(editing?.telephone || "");
      setSuperviseurId(editing?.superviseur_id || "");
      setActive(editing?.active ?? true);
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!superviseurId) {
        showToast("error", "Un Team Leader de rattachement est obligatoire");
        setSaving(false);
        return;
      }
      if (editing) {
        await api.updateCommercial(editing.id, {
          identifiant: identifiant.trim(),
          full_name: fullName.trim(),
          active,
          telephone: telephone.trim(),
          superviseur_id: superviseurId,
        });
        showToast("success", "Commercial modifié");
      } else {
        if (password.length < 8) {
          showToast("error", "Mot de passe : 8 caractères minimum");
          setSaving(false);
          return;
        }
        await api.createCommercial({
          identifiant: identifiant.trim(),
          full_name: fullName.trim(),
          password,
          telephone: telephone.trim(),
          superviseur_id: superviseurId,
        });
        showToast("success", "Commercial créé");
      }
      onSaved();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le commercial" : "Nouveau commercial"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nom complet</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jean Dupont" />
        </div>
        <div>
          <label className="label">Identifiant de connexion</label>
          <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required placeholder="jdupont" />
        </div>
        <div>
          <label className="label">Téléphone</label>
          <input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+229 ..." />
        </div>
        <div>
          <label className="label">Team Leader de rattachement *</label>
          <select className="input" value={superviseurId} onChange={(e) => setSuperviseurId(e.target.value)} required>
            <option value="">Sélectionner un Team Leader...</option>
            {superviseurs.filter(s => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}{s.secteur_nom ? ` — ${s.secteur_nom}` : ""}</option>
            ))}
          </select>
          {superviseurs.length === 0 && <p className="text-xs text-error-500 mt-1">Aucun Team Leader actif. Créez d'abord un Team Leader.</p>}
        </div>
        {!editing && (
          <div>
            <label className="label">Mot de passe</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="8 caractères minimum" />
          </div>
        )}
        {editing && (
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Statut du compte</p>
              <p className="text-xs text-gray-500">{active ? "Le commercial peut se connecter" : "Le commercial ne peut plus se connecter"}</p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative w-12 h-6 rounded-full transition-colors ${active ? "bg-accent-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${active ? "translate-x-6" : ""}`} />
            </button>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({
  commercial, onClose, onSaved, showToast,
}: {
  commercial: Commercial | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPassword(""); }, [commercial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commercial) return;
    if (password.length < 8) {
      showToast("error", "Mot de passe : 8 caractères minimum");
      return;
    }
    setSaving(true);
    try {
      await api.resetCommercialPassword(commercial.id, password);
      onSaved();
    } catch {
      showToast("error", "Erreur lors de la réinitialisation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!commercial} onClose={onClose} title="Réinitialiser le mot de passe" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Définissez un nouveau mot de passe pour <strong>{commercial?.full_name}</strong>.
        </p>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="8 caractères minimum" autoFocus />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Réinitialisation..." : "Réinitialiser"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
