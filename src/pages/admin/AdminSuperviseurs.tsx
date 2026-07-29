import { useEffect, useState } from "react";
import { UserPlus, Search, Pencil, KeyRound, Trash2, UserCheck, UserX, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import type { Superviseur } from "@/types";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";

export function AdminSuperviseurs() {
  const [superviseurs, setSuperviseurs] = useState<Superviseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Superviseur | null>(null);
  const [passwordModal, setPasswordModal] = useState<Superviseur | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Superviseur | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listSuperviseurs().then(setSuperviseurs).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = superviseurs.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.identifiant.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold text-gray-900">Superviseurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les comptes superviseurs terrain</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary">
          <UserPlus size={18} />
          Ajouter
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" className="input pl-11" placeholder="Rechercher par nom ou identifiant..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <UserCog size={26} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Aucun superviseur trouvé</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((s) => (
              <div key={s.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${s.active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-400"}`}>
                  {s.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{s.full_name}</p>
                    <span className={`badge ${s.active ? "bg-accent-50 text-accent-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.active ? <><UserCheck size={12} /> Actif</> : <><UserX size={12} /> Désactivé</>}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Identifiant : {s.identifiant}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Créé le {formatDate(s.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(s); setModalOpen(true); }} className="btn-ghost p-2 rounded-lg" title="Modifier"><Pencil size={16} /></button>
                  <button onClick={() => setPasswordModal(s)} className="btn-ghost p-2 rounded-lg" title="Réinitialiser le mot de passe"><KeyRound size={16} /></button>
                  <button onClick={() => setDeleteTarget(s)} className="btn-ghost p-2 rounded-lg text-error-500 hover:bg-error-50" title="Supprimer"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SuperviseurModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} showToast={showToast} />
      <PasswordModal superviseur={passwordModal} onClose={() => setPasswordModal(null)} onSaved={() => { setPasswordModal(null); showToast("success", "Mot de passe réinitialisé"); }} showToast={showToast} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le superviseur" maxWidth="max-w-md">
        <p className="text-gray-600 text-sm mb-6">
          Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.full_name}</strong> ?
          Cette action supprimera également tout l'historique de ses visites. Cette opération est irréversible.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
          <button
            onClick={async () => {
              if (!deleteTarget) return;
              try { await api.deleteSuperviseur(deleteTarget.id); setDeleteTarget(null); load(); showToast("success", "Superviseur supprimé"); }
              catch { showToast("error", "Erreur lors de la suppression"); }
            }}
            className="btn-danger"
          >Supprimer</button>
        </div>
      </Modal>
    </div>
  );
}

function SuperviseurModal({ open, editing, onClose, onSaved, showToast }: {
  open: boolean; editing: Superviseur | null; onClose: () => void; onSaved: () => void; showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setIdentifiant(editing?.identifiant || ""); setFullName(editing?.full_name || ""); setPassword(""); setActive(editing?.active ?? true); }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateSuperviseur(editing.id, { identifiant: identifiant.trim(), full_name: fullName.trim(), active });
        showToast("success", "Superviseur modifié");
      } else {
        if (password.length < 6) { showToast("error", "Mot de passe : 6 caractères minimum"); setSaving(false); return; }
        await api.createSuperviseur({ identifiant: identifiant.trim(), full_name: fullName.trim(), password });
        showToast("success", "Superviseur créé");
      }
      onSaved();
    } catch (err) { showToast("error", err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le superviseur" : "Nouveau superviseur"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nom complet</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jean Dupont" />
        </div>
        <div>
          <label className="label">Identifiant de connexion</label>
          <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required placeholder="jdupont" />
        </div>
        {!editing && (
          <div>
            <label className="label">Mot de passe</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="6 caractères minimum" />
          </div>
        )}
        {editing && (
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Statut du compte</p>
              <p className="text-xs text-gray-500">{active ? "Le superviseur peut se connecter" : "Le superviseur ne peut plus se connecter"}</p>
            </div>
            <button type="button" onClick={() => setActive(!active)} className={`relative w-12 h-6 rounded-full transition-colors ${active ? "bg-accent-500" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${active ? "translate-x-6" : ""}`} />
            </button>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ superviseur, onClose, onSaved, showToast }: {
  superviseur: Superviseur | null; onClose: () => void; onSaved: () => void; showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPassword(""); }, [superviseur]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!superviseur) return;
    if (password.length < 6) { showToast("error", "Mot de passe : 6 caractères minimum"); return; }
    setSaving(true);
    try { await api.resetSuperviseurPassword(superviseur.id, password); onSaved(); }
    catch { showToast("error", "Erreur lors de la réinitialisation"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={!!superviseur} onClose={onClose} title="Réinitialiser le mot de passe" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">Définissez un nouveau mot de passe pour <strong>{superviseur?.full_name}</strong>.</p>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="6 caractères minimum" autoFocus />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Réinitialisation..." : "Réinitialiser"}</button>
        </div>
      </form>
    </Modal>
  );
}
