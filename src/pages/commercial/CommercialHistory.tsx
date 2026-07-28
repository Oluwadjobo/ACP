import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Clock, CheckCircle2, AlertTriangle, History, Store } from "lucide-react";
import { api } from "@/lib/api";
import type { Visite } from "@/types";
import { formatDate, formatTime } from "@/lib/format";

export function CommercialHistory() {
  const navigate = useNavigate();
  const [visites, setVisites] = useState<Visite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.myVisites().then(setVisites).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/commercial")} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <History size={20} />
          <span className="font-bold text-sm">Mes visites</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : visites.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <History size={30} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Vous n'avez aucune visite enregistrée pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visites.map((v) => {
              const confirmed = v.status === "confirmed";
              return (
                <div key={v.id} className="card p-4 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      confirmed ? "bg-accent-50 text-accent-600" : "bg-error-50 text-error-500"
                    }`}>
                      {confirmed ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {v.point_vente?.name || "Point de vente"}
                        </p>
                        <span className={`badge flex-shrink-0 ${
                          confirmed ? "bg-accent-50 text-accent-700" : "bg-error-50 text-error-600"
                        }`}>
                          {confirmed ? "Confirmée" : "Hors zone"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                        <Store size={13} />
                        <span className="truncate">{v.point_vente?.city}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(v.visited_at)} à {formatTime(v.visited_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {Math.round(v.distance_meters)} m
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
