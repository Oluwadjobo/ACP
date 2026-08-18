import { useState, useEffect } from "react";
import { Package, MapPin, User, Clock, CheckCircle2, XCircle, Loader2, Navigation, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Toast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import type { Commande, CommandeStatut } from "@/types";

const STATUT_LABELS: Record<CommandeStatut, string> = {
  enregistree: "Enregistrée",
  en_attente_livraison: "En attente de livraison",
  en_cours_livraison: "En cours de livraison",
  livree: "Livrée",
  annulee: "Annulée",
  non_livree: "Non livrée",
};

const STATUT_COLORS: Record<CommandeStatut, string> = {
  enregistree: "bg-primary-50 text-primary-700",
  en_attente_livraison: "bg-warning-50 text-warning-700",
  en_cours_livraison: "bg-accent-50 text-accent-700",
  livree: "bg-success-50 text-success-700",
  annulee: "bg-error-50 text-error-700",
  non_livree: "bg-error-50 text-error-700",
};

export function AgentLivreurCommandes() {
  const { hasPermission } = useAuth();
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [validatingCmd, setValidatingCmd] = useState<Commande | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listMesCommandesLivraison();
      setCommandes(data);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openMaps = (lat: number, lon: number) => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const url = isMobile
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-900 text-white px-4 py-5 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold flex items-center gap-2"><Package size={22} /> Commandes à livrer</h1>
          <p className="text-primary-300 text-xs mt-0.5">Validez les livraisons de vos commerciaux</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
        ) : commandes.length === 0 ? (
          <div className="card text-center py-12">
            <Package size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune commande à livrer</p>
          </div>
        ) : (
          commandes.map((cmd) => (
            <div key={cmd.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Package size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{cmd.code}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {cmd.point_vente && <span className="flex items-center gap-1"><MapPin size={12} /> {cmd.point_vente.name}</span>}
                      {cmd.commercial && <span className="flex items-center gap-1"><User size={12} /> {cmd.commercial.full_name}</span>}
                    </div>
                  </div>
                </div>
                <span className={`badge ${STATUT_COLORS[cmd.statut]}`}>{STATUT_LABELS[cmd.statut]}</span>
              </div>

              {cmd.point_vente && (
                <p className="text-xs text-gray-500 mb-3">{cmd.point_vente.address}, {cmd.point_vente.city}</p>
              )}

              {cmd.lignes && cmd.lignes.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="space-y-1">
                    {cmd.lignes.map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{l.produit_nom}</span>
                        <span className="text-gray-500 font-medium">{l.quantite} {l.unite || "unité"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cmd.observation && <p className="text-xs text-gray-500 italic mb-3">{cmd.observation}</p>}

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                {cmd.point_vente && typeof cmd.point_vente.latitude === "number" && typeof cmd.point_vente.longitude === "number" && (
                  <button
                    onClick={() => openMaps(cmd.point_vente!.latitude, cmd.point_vente!.longitude)}
                    className="btn-secondary text-xs flex-1"
                  >
                    <Navigation size={14} /> Itinéraire
                  </button>
                )}
                {(cmd.statut === "enregistree" || cmd.statut === "en_attente_livraison" || cmd.statut === "en_cours_livraison") && hasPermission("validate_livraison") && (
                  <button
                    onClick={() => setValidatingCmd(cmd)}
                    className="btn-primary text-xs flex-1"
                  >
                    <CheckCircle2 size={14} /> Valider la livraison
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {validatingCmd && (
        <ValidateLivraisonModal
          commande={validatingCmd}
          onClose={() => setValidatingCmd(null)}
          onDone={() => { setValidatingCmd(null); load(); }}
        />
      )}
    </div>
  );
}

function ValidateLivraisonModal({ commande, onClose, onDone }: {
  commande: Commande;
  onClose: () => void;
  onDone: () => void;
}) {
  const [statut, setStatut] = useState<"livree" | "non_livree">("livree");
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.validerLivraison(commande.id, statut, commentaire);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Valider - ${commande.code}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-3 py-2 text-sm text-error-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStatut("livree")}
            className={`p-4 rounded-xl border-2 transition-all text-center ${statut === "livree" ? "border-success-500 bg-success-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <CheckCircle2 size={28} className={statut === "livree" ? "text-success-600 mx-auto mb-1" : "text-gray-400 mx-auto mb-1"} />
            <p className="text-sm font-semibold text-gray-900">Livrée</p>
          </button>
          <button
            type="button"
            onClick={() => setStatut("non_livree")}
            className={`p-4 rounded-xl border-2 transition-all text-center ${statut === "non_livree" ? "border-error-500 bg-error-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <XCircle size={28} className={statut === "non_livree" ? "text-error-600 mx-auto mb-1" : "text-gray-400 mx-auto mb-1"} />
            <p className="text-sm font-semibold text-gray-900">Non livrée</p>
          </button>
        </div>

        <div>
          <label className="label">Commentaire (optionnel)</label>
          <textarea className="input min-h-[80px]" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Notes sur la livraison..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Confirmer
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
