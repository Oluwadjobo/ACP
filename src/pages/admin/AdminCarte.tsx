import { useEffect, useState, useRef } from "react";
import { Map as MapIcon, Store, MapPin, Loader2, Search } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import type { PointVente } from "@/types";

const blueIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#0a2157;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:#fff;font-size:14px;font-weight:700;">P</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export function AdminCarte() {
  const [points, setPoints] = useState<PointVente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PointVente | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  useEffect(() => {
    api
      .listPointsVente()
      .then(setPoints)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [6.36, 2.42],
      zoom: 13,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    const filtered = points.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.city.toLowerCase().includes(search.toLowerCase()) ||
        p.address.toLowerCase().includes(search.toLowerCase())
    );

    if (filtered.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    filtered.forEach((p) => {
      const marker = L.marker([p.latitude, p.longitude], { icon: blueIcon })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:system-ui;padding:4px 2px;">
            <strong style="font-size:14px;color:#0a2157;">${p.name}</strong><br/>
            <span style="font-size:12px;color:#6b7280;">${p.address}</span><br/>
            <span style="font-size:12px;color:#6b7280;">${p.city}</span><br/>
            <span style="font-size:11px;color:#9ca3af;">Code : ${p.code}</span>
          </div>`
        );
      marker.on("click", () => setSelected(p));
      markersRef.current[p.id] = marker;
      bounds.push([p.latitude, p.longitude]);
    });

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 16 });
    }
  }, [points, loading, search]);

  const flyTo = (p: PointVente) => {
    setSelected(p);
    mapRef.current?.flyTo([p.latitude, p.longitude], 17, { duration: 0.8 });
    markersRef.current[p.id]?.openPopup();
  };

  const filtered = points.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MapIcon size={26} className="text-primary-700" /> Carte des points de vente
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Visualisez l'étendue de votre champ d'action géographique
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 card overflow-hidden p-0">
          <div ref={containerRef} className="w-full h-[500px] lg:h-[600px]" />
        </div>

        {/* Sidebar list */}
        <div className="space-y-4">
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-11"
              placeholder="Rechercher un point..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="card">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                {filtered.length} point{filtered.length > 1 ? "s" : ""} de vente
              </span>
              <span className="badge bg-primary-50 text-primary-700">
                <Store size={12} /> {points.length} total
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <MapPin size={22} className="text-gray-400" />
                </div>
                <p className="text-gray-500 text-sm">Aucun point trouvé</p>
              </div>
            ) : (
              <div className="max-h-[460px] lg:max-h-[560px] overflow-y-auto scrollbar-thin divide-y divide-gray-50">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => flyTo(p)}
                    className={`w-full text-left px-5 py-3 hover:bg-gray-50/50 transition-colors ${
                      selected?.id === p.id ? "bg-primary-50/40" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Store size={16} className="text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 truncate">{p.address}</p>
                        <p className="text-xs text-gray-400">{p.city}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
