import { useEffect, useState } from "react";
import { MapPin, Store, TrendingUp, CheckCircle2, XCircle, Clock, Truck, ChevronLeft, Navigation, Phone, Map as MapIcon } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TourneeDetail as TourneeDetailType } from "@/types";
import { formatDateTime } from "@/lib/format";

export function TourneeDetail() {
  const { id } = useParams<{ id: string }>();
  const { userType } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<TourneeDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (id) api.tourneeDetail(id).then(setData).finally(() => setLoading(false));
  }, [id]);

  const homePath = userType === "superviseur" ? "/superviseur" : userType === "agent_livreur" ? "/agent-livreur" : "/commercial";
  const tourneesPath = userType === "superviseur" ? "/superviseur/tournees" : userType === "agent_livreur" ? "/agent-livreur/tournees" : "/commercial/tournees";

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  if (!data) {
    return <div className="text-center py-20 text-gray-500">Tournée introuvable</div>;
  }

  const color = data.secteur.color_code || "#6B7280";
  const points = data.points || [];
  const filtered = filter === "all" ? points : filter === "visite" ? points.filter((p) => p.visite) : filter === "non_visite" ? points.filter((p) => !p.visite) : filter === "vente" ? points.filter((p) => p.vente_realisee) : points;

  const statutLabel = (v: string | null) => {
    if (!v) return "Non visité";
    if (v === "vente_realisee") return "Vente réalisée";
    if (v === "vente_non_realisee") return "Vente non réalisée";
    if (v === "vente_livraison") return "Vente + livraison";
    if (v === "promesse_achat") return "Promesse d'achat";
    if (v === "out_of_zone") return "Hors zone";
    return "Visité";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(tourneesPath)} className="btn-ghost text-white hover:bg-white/10 p-1.5 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="font-bold text-sm">{data.secteur.nom}</span>
        </div>
        <button onClick={() => navigate(homePath)} className="btn-ghost text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm">Accueil</button>
      </header>

      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "22" }}>
            <MapPin size={22} style={{ color }} />
          </div>
          <div>
            <p className="font-bold text-gray-900">{data.secteur.nom}</p>
            <p className="text-xs text-gray-400">{data.secteur.code}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center bg-gray-50 rounded-lg py-2">
            <p className="text-lg font-bold text-gray-900">{data.stats.total}</p>
            <p className="text-[10px] text-gray-500">Total</p>
          </div>
          <div className="text-center bg-success-50 rounded-lg py-2">
            <p className="text-lg font-bold text-success-600">{data.stats.visites}</p>
            <p className="text-[10px] text-gray-500">Visités</p>
          </div>
          <div className="text-center bg-warning-50 rounded-lg py-2">
            <p className="text-lg font-bold text-warning-600">{data.stats.restants}</p>
            <p className="text-[10px] text-gray-500">Restants</p>
          </div>
          <div className="text-center bg-primary-50 rounded-lg py-2">
            <p className="text-lg font-bold text-primary-700">{data.stats.ventes}</p>
            <p className="text-[10px] text-gray-500">Ventes</p>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-3 flex gap-2 overflow-x-auto">
        {[
          { key: "all", label: "Tous" },
          { key: "visite", label: "Visités" },
          { key: "non_visite", label: "Non visités" },
          { key: "vente", label: "Ventes" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === f.key ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-4 py-4 space-y-2 max-w-2xl w-full mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Aucun point de vente</div>
        ) : (
          filtered.map((p) => {
            const isVisited = !!p.visite;
            const isVente = p.vente_realisee;
            const isBl = !!p.bl;
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

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`badge text-[10px] ${isVisited ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500"}`}>
                        {isVisited ? <CheckCircle2 size={10} /> : <Clock size={10} />} {statutLabel(p.visite?.vente_status ?? null)}
                      </span>
                      {isVente && <span className="badge bg-primary-50 text-primary-700 text-[10px]"><TrendingUp size={10} /> Vente</span>}
                      {isBl && <span className={`badge text-[10px] ${p.bl?.statut === "livre" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}><Truck size={10} /> BL {p.bl?.numero}</span>}
                    </div>

                    {p.visite?.visited_at && (
                      <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1"><Clock size={10} /> {formatDateTime(p.visite.visited_at)}</p>
                    )}

                    {p.visite?.motif && (
                      <p className="text-[10px] text-error-500 mt-1">Motif : {p.visite.motif}</p>
                    )}

                    <div className="flex items-center gap-2 mt-2">
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
