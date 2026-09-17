import { useEffect, useState } from "react";
import { MapPin, Store, TrendingUp, TrendingDown, Package, Truck, ChevronRight, Clock, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Tournee } from "@/types";

const statutConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  a_venir: { label: "À venir", color: "text-gray-600", bg: "bg-gray-100", icon: Circle },
  en_cours: { label: "En cours", color: "text-warning-600", bg: "bg-warning-50", icon: Clock },
  terminee: { label: "Terminée", color: "text-success-600", bg: "bg-success-50", icon: CheckCircle2 },
  annulee: { label: "Annulée", color: "text-error-500", bg: "bg-error-50", icon: AlertCircle },
};

export function MesTournees() {
  const { userType } = useAuth();
  const navigate = useNavigate();
  const [tournees, setTournees] = useState<Tournee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api.mesTournees().then(setTournees).finally(() => setLoading(false));
  }, []);

  const homePath = userType === "superviseur" ? "/superviseur" : userType === "agent_livreur" ? "/agent-livreur" : "/commercial";
  const detailPath = userType === "superviseur" ? "/superviseur/tournee" : userType === "agent_livreur" ? "/agent-livreur/tournee" : "/commercial/tournee";

  const filtered = filter === "all" ? tournees : tournees.filter((t) => t.statut === filter);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><MapPin size={20} /><span className="font-bold text-sm">Mes tournées</span></div>
        <button onClick={() => navigate(homePath)} className="btn-ghost text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm">Retour</button>
      </header>

      <div className="bg-white border-b border-gray-100 px-4 py-3 flex gap-2 overflow-x-auto">
        {["all", "a_venir", "en_cours", "terminee"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === f ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {f === "all" ? "Toutes" : statutConfig[f]?.label || f}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 py-4 space-y-3 max-w-2xl w-full mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><MapPin size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucune tournée assignée</p>
          </div>
        ) : (
          filtered.map((t) => {
            const sc = statutConfig[t.statut] || statutConfig.a_venir;
            const color = t.color_code || "#6B7280";
            return (
              <button key={t.id} onClick={() => navigate(`${detailPath}/${t.id}`)} className="card w-full text-left p-4 hover:ring-2 hover:ring-primary-200 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "22" }}>
                      <MapPin size={20} style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{t.nom}</p>
                      <p className="text-xs text-gray-400">{t.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`badge ${sc.bg} ${sc.color}`}><sc.icon size={11} /> {sc.label}</span>
                    <ChevronRight size={18} className="text-gray-300" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-gray-900">{t.total_points_vente}</p>
                    <p className="text-[10px] text-gray-500">Points de vente</p>
                  </div>
                  <div className="text-center bg-success-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-success-600">{t.points_visites}</p>
                    <p className="text-[10px] text-gray-500">Visités</p>
                  </div>
                  <div className="text-center bg-warning-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-warning-600">{t.points_restants}</p>
                    <p className="text-[10px] text-gray-500">Restants</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-3 text-xs">
                  <span className="flex items-center gap-1 text-gray-600"><TrendingUp size={12} className="text-success-500" /> {t.ventes_realisees} ventes</span>
                  <span className="flex items-center gap-1 text-gray-600"><TrendingDown size={12} className="text-error-400" /> {t.ventes_non_realisees} non réalisées</span>
                  {userType !== "agent_livreur" && <span className="flex items-center gap-1 text-gray-600"><Package size={12} className="text-warning-500" /> {t.promesses} promesses</span>}
                  {userType !== "agent_livreur" && <span className="flex items-center gap-1 text-gray-600"><Truck size={12} className="text-secondary-500" /> {t.livraisons} livraisons</span>}
                </div>
              </button>
            );
          })
        )}
      </main>
    </div>
  );
}
