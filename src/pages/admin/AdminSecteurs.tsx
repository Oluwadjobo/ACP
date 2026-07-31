import { useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, Power, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import type { Secteur } from "@/types";

export function AdminSecteurs() {
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Secteur | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listSecteurs().then(setSecteurs).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (s: Secteur) => {
    try {
      await api.updateSecteur(s.id, { actif: !s.actif });
      showToast("success", s.actif ? "Secteur désactivé" : "Secteur réactivé");
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleDelete = async (s: Secteur) => {
    if (!confirm(`Supprimer le secteur "${s.nom}" ? Cette action est irréversible.`)) return;
    try {
      await api.deleteSecteur(s.id);
      showToast("success", "Secteur supprimé");
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><MapPin size={26} className="text-primary-700" /> Secteurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les zones géographiques et portefeuilles commerciaux</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary"><Plus size={18} /> Nouveau secteur</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
      ) : secteurs.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4"><MapPin size={28} className="text-gray-400" /></div>
          <p className="text-gray-500 mb-4">Aucun secteur enregistré pour le moment</p>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary"><Plus size={18} /> Créer le premier secteur</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {secteurs.map((s) => (
            <div key={s.id} className={`card p-5 ${!s.actif ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center"><MapPin size={20} className="text-primary-600" /></div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(s); setShowModal(true); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-primary-600 transition-colors"><Pencil size={16} /></button>
                  <button onClick={() => handleToggle(s)} className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${s.actif ? "text-gray-500 hover:text-warning-600" : "text-gray-400 hover:text-success-600"}`} title={s.actif ? "Désactiver" : "Réactiver"}><Power size={16} /></button>
                  <button onClick={() => handleDelete(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-error-600 transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
              <h3 className="font-bold text-gray-900 text-base">{s.nom}</h3>
              <p className="text-xs text-primary-600 font-mono mt-0.5">{s.code}</p>
              {s.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{s.description}</p>}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className={`badge ${s.actif ? "bg-success-50 text-success-700" : "bg-gray-100 text-gray-500"}`}>
                  {s.actif ? "Actif" : "Inactif"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <SecteurModal
        open={showModal}
        editing={editing}
        onClose={() => setShowModal(false)}
        onSaved={() => { setShowModal(false); load(); }}
        showToast={showToast}
      />
    </div>
  );
}

function SecteurModal({
  open, editing, onClose, onSaved, showToast,
}: {
  open: boolean;
  editing: Secteur | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNom(editing?.nom || "");
      setCode(editing?.code || "");
      setDescription(editing?.description || "");
      setError(null);
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || !code.trim()) { setError("Le nom et le code sont obligatoires"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.updateSecteur(editing.id, { nom: nom.trim(), code: code.trim().toUpperCase(), description: description.trim() });
        showToast("success", "Secteur modifié avec succès");
      } else {
        await api.createSecteur({ nom: nom.trim(), code: code.trim().toUpperCase(), description: description.trim() });
        showToast("success", "Secteur créé avec succès");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le secteur" : "Nouveau secteur"} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
        <div>
          <label className="label">Nom du secteur *</label>
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex: Cotonou Centre" />
        </div>
        <div>
          <label className="label">Code *</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ex: COT-CENTRE" />
        </div>
        <div>
          <label className="label">Description (optionnel)</label>
          <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Zone géographique ou portefeuille..." />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Enregistrement..." : editing ? "Modifier" : "Créer"}</button>
        </div>
      </form>
    </Modal>
  );
}
