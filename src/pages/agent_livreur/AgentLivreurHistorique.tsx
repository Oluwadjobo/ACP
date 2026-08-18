import { useState, useEffect } from "react";
import { History, Package, MapPin, User, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Toast } from "@/components/Toast";

interface LivraisonRecord {
  id: string;
  commande_id: string;
  statut_final: string;
  date_livraison: string;
  commentaire: string | null;
  created_at: string;
  commande?: { code: string };
  point_vente?: { name: string; city: string; address: string };
  commercial?: { full_name: string };
}

export function AgentLivreurHistorique() {
  const [livraisons, setLivraisons] = useState<LivraisonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.listHistoriqueLivraisons()
      .then((data) => setLivraisons(data))
      .catch((err) => setToast(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-900 text-white px-4 py-5 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold flex items-center gap-2"><History size={22} /> Historique des livraisons</h1>
          <p className="text-primary-300 text-xs mt-0.5">Toutes vos validations de livraison</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
        ) : livraisons.length === 0 ? (
          <div className="card text-center py-12">
            <History size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune livraison enregistrée</p>
          </div>
        ) : (
          livraisons.map((liv) => (
            <div key={liv.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${liv.statut_final === "livree" ? "bg-success-50" : "bg-error-50"}`}>
                    {liv.statut_final === "livree" ? <CheckCircle2 size={20} className="text-success-600" /> : <XCircle size={20} className="text-error-600" />}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{liv.commande?.code || "Commande"}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {liv.point_vente && <span className="flex items-center gap-1"><MapPin size={12} /> {liv.point_vente.name}</span>}
                      {liv.commercial && <span className="flex items-center gap-1"><User size={12} /> {liv.commercial.full_name}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`badge ${liv.statut_final === "livree" ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"}`}>
                    {liv.statut_final === "livree" ? "Livrée" : "Non livrée"}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{new Date(liv.date_livraison).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
              {liv.commentaire && <p className="text-xs text-gray-500 italic mt-2">{liv.commentaire}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
