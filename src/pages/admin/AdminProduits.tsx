import { useEffect, useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Produit } from "@/types";
import { Modal } from "@/components/Modal";

export function AdminProduits() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Produit | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listProduits().then(setProduits).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez la liste des produits pour les promesses d'achat</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary"><Plus size={18} /> Ajouter</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
        ) : produits.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><Package size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucun produit enregistré</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {produits.map((p) => (
              <div key={p.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0"><Package size={18} className="text-primary-600" /></div>
                <p className="font-semibold text-gray-900 text-sm flex-1">{p.nom}</p>
                <button onClick={() => setDeleteTarget(p)} className="btn-ghost p-2 rounded-lg text-error-500 hover:bg-error-50" title="Supprimer"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddProduitModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); showToast("success", "Produit ajouté"); }} showToast={showToast} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer le produit" maxWidth="max-w-md">
        <p className="text-gray-600 text-sm mb-6">Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.nom}</strong> ?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
          <button onClick={async () => {
            if (!deleteTarget) return;
            try { await api.deleteProduit(deleteTarget.id); setDeleteTarget(null); load(); showToast("success", "Produit supprimé"); }
            catch { showToast("error", "Erreur"); }
          }} className="btn-danger">Supprimer</button>
        </div>
      </Modal>
    </div>
  );
}

function AddProduitModal({ open, onClose, onSaved, showToast }: {
  open: boolean; onClose: () => void; onSaved: () => void; showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [nom, setNom] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setNom(""); }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;
    setSaving(true);
    try { await api.createProduit(nom.trim()); onSaved(); }
    catch (err) { showToast("error", err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau produit" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nom du produit</label>
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex: Produit D" autoFocus />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Ajout..." : "Ajouter"}</button>
        </div>
      </form>
    </Modal>
  );
}
