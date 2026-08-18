import { useState, useRef } from "react";
import { Search, MapPin, Navigation, Store, Loader2, ArrowLeft, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Toast } from "@/components/Toast";

interface SearchResult {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  telephone?: string;
  secteur_id?: string;
  secteur?: { nom: string } | null;
}

export function PointVenteSearch() {
  const { userType } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const data = await api.searchPointsVente(q);
        setResults(data);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Erreur de recherche");
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const openGoogleMaps = (lat: number, lon: number) => {
    if (typeof lat !== "number" || typeof lon !== "number" || isNaN(lat) || isNaN(lon)) {
      setToast("Position GPS indisponible pour ce point de vente.");
      return;
    }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, isMobile ? "_blank" : "_blank");
  };

  const homePath = userType === "agent_livreur" ? "/agent-livreur" : userType === "superviseur" ? "/superviseur" : "/commercial";

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-primary-900 text-white px-4 py-5 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => window.history.back()} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2"><Search size={20} /> Rechercher un point de vente</h1>
            <p className="text-primary-300 text-xs mt-0.5">Trouvez un PDV et obtenez l'itinéraire</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}

        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-12 pr-10 text-base py-3.5"
            placeholder="Nom, adresse, ville, code..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); setSearched(false); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="card text-center py-10">
            <Store size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun point de vente trouvé pour "{query}"</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((pv) => {
              const hasGps = typeof pv.latitude === "number" && typeof pv.longitude === "number" && !isNaN(pv.latitude) && !isNaN(pv.longitude);
              return (
                <div key={pv.id} className="card p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Store size={22} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{pv.name}</p>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                        <MapPin size={14} />
                        <span>{pv.address}, {pv.city}</span>
                      </div>
                      {pv.secteur?.nom && (
                        <span className="inline-flex items-center gap-1 mt-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary-500" />
                          <span className="text-xs font-semibold text-primary-600">{pv.secteur.nom}</span>
                        </span>
                      )}
                      {pv.telephone && <p className="text-xs text-gray-400 mt-1">Tél: {pv.telephone}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">Code: {pv.code}</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {hasGps ? (
                      <button
                        onClick={() => openGoogleMaps(pv.latitude, pv.longitude)}
                        className="btn-primary w-full"
                      >
                        <Navigation size={16} /> Y aller - Itinéraire
                      </button>
                    ) : (
                      <p className="text-sm text-error-600 text-center py-2">Position GPS indisponible pour ce point de vente.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !searched && (
          <div className="text-center py-10">
            <Search size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Saisissez au moins 2 caractères pour rechercher</p>
          </div>
        )}
      </div>
    </div>
  );
}
