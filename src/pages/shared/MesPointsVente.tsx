import { useEffect, useState, useMemo } from "react";
import { Store, MapPin, Search, ChevronLeft, Navigation, Phone, CheckCircle2, Clock, TrendingUp, Truck, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MesPointVente as MesPointVenteType } from "@/types";
import { formatDate } from "@/lib/format";

export function MesPointsVente() {
  const { userType } = useAuth();
  const navigate = useNavigate();
  const [points, setPoints] = useState<MesPointVenteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api.mesPointsVente().then(setPoints).finally(() => setLoading(false));
  }, []);

  const homePath = userType === "superviseur" ? "/superviseur" : userType === "agent_livreur" ? "/agent-livreur" : "/commercial";

  const filtered = useMemo(() => {
    let result = points;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.city || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q));
    }
    if (filter === "visite") result = result.filter((p) => p.statut === "visite");
    else if (filter === "non_visite") result = result.filter((p) => p.statut === "non_visite");
    else if (filter === "vente") result = result.filter((p) => p.derniere_vente);
    return result;
  }, [points, search, filter]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Store size={20} /><span className="font-bold text-sm">Mes points de vente</span></div>
        <button onClick={() => navigate(homePath)} className="btn-ghost text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm">Retour</button>
      </header>

      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" className="input pl-11" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { key: "all", label: "Tous" },
            { key: "visite", label: "Visités" },
            { key: "non_visite", label: "Non visités" },
            { key: "vente", label: "Avec vente" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === f.key ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">{filtered.length} point{filtered.length > 1 ? "s" : ""} de vente</span>
        <span className="badge bg-primary-50 text-primary-700">{points.length} total</span>
      </div>

      <main className="flex-1 px-4 py-4 space-y-2 max-w-2xl w-full mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><Store size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucun point de vente trouvé</p>
          </div>
        ) : (
          filtered.map((p) => {
            const color = p.secteur_color || "#6B7280";
            const isVisited = p.statut === "visite";
            const hasVente = !!p.derniere_vente;
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isVisited ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-400"}`}>
                    {isVisited ? <CheckCircle2 size={18} /> : <Store size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                      <span className="text-[10px] text-gray-400 font-mono">{p.code}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{p.address}, {p.city}</p>

                    {p.secteur_nom && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[10px] font-semibold" style={{ color }}>{p.secteur_nom}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`badge text-[10px] ${isVisited ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500"}`}>
                        {isVisited ? <CheckCircle2 size={10} /> : <Clock size={10} />} {isVisited ? "Visité" : "Non visité"}
                      </span>
                      {hasVente && <span className="badge bg-primary-50 text-primary-700 text-[10px]"><TrendingUp size={10} /> Vente</span>}
                      {p.commande_code && <span className="badge bg-secondary-50 text-secondary-700 text-[10px]"><Package size={10} /> {p.commande_code}</span>}
                      {p.commande_statut === "livree" && <span className="badge bg-success-50 text-success-600 text-[10px]"><Truck size={10} /> Livré</span>}
                      {p.commande_statut && p.commande_statut !== "livree" && <span className="badge bg-warning-50 text-warning-600 text-[10px]"><Truck size={10} /> En attente</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      {p.derniere_visite && <span className="flex items-center gap-1"><Clock size={10} /> Dernière visite : {formatDate(p.derniere_visite)}</span>}
                      {p.derniere_vente && <span className="flex items-center gap-1"><TrendingUp size={10} /> Vente : {formatDate(p.derniere_vente)}</span>}
                      {p.date_livraison && <span className="flex items-center gap-1"><Truck size={10} /> Livraison : {formatDate(p.date_livraison)}</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      {p.telephone && (
                        <a href={`tel:${p.telephone}`} className="flex items-center gap-1 text-[10px] text-primary-600"><Phone size={11} /> {p.telephone}</a>
                      )}
                      {typeof p.latitude === "number" && typeof p.longitude === "number" && !isNaN(p.latitude) && !isNaN(p.longitude) && (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] text-primary-600"><Navigation size={11} /> Itinéraire</a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
