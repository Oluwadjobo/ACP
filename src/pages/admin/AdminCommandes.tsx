import { useState, useEffect } from "react";
import { ClipboardList, Loader2, Package, MapPin, User, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Toast } from "@/components/Toast";
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

export function AdminCommandes() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.listCommandes();
      setCommandes(data);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatutChange = async (id: string, statut: CommandeStatut) => {
    try {
      await api.updateCommandeStatut(id, statut);
      setToast("Statut mis à jour");
      load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList size={26} className="text-primary-700" /> Commandes
        </h1>
        <p className="text-gray-500 text-sm mt-1">Suivez les commandes enregistrées par les commerciaux</p>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
      ) : commandes.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardList size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune commande enregistrée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {commandes.map((cmd) => (
            <div key={cmd.id} className="card p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Package size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{cmd.code}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {cmd.point_vente && <span className="flex items-center gap-1"><MapPin size={12} /> {cmd.point_vente.name}</span>}
                      {cmd.commercial && <span className="flex items-center gap-1"><User size={12} /> {cmd.commercial.full_name}</span>}
                      <span className="flex items-center gap-1"><Clock size={12} /> {new Date(cmd.date_commande).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${STATUT_COLORS[cmd.statut]}`}>{STATUT_LABELS[cmd.statut]}</span>
                  <select
                    value={cmd.statut}
                    onChange={(e) => handleStatutChange(cmd.id, e.target.value as CommandeStatut)}
                    className="input text-xs py-1.5 px-2 w-auto"
                  >
                    {Object.entries(STATUT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {cmd.lignes && cmd.lignes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
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

              {cmd.observation && (
                <p className="mt-2 text-xs text-gray-500 italic">{cmd.observation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
