import { useEffect, useState, useRef, useMemo } from "react";
import { Map as MapIcon, Store, MapPin, Loader2, Search, Maximize2, Minimize2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import type { PointVente, Secteur } from "@/types";

function createPinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${color};border:2.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.4);transform:rotate(-45deg);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

export function AdminCarte() {
  const [points, setPoints] = useState<PointVente[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PointVente | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    Promise.all([api.listPointsVente(), api.listSecteurs()])
      .then(([pts, secs]) => {
        setPoints(pts);
        setSecteurs(secs);
      })
      .finally(() => setLoading(false));
  }, []);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    secteurs.forEach((s) => { m[s.id] = s.color_code || "#E63946"; });
    return m;
  }, [secteurs]);

  // Init map
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

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fullscreen is handled purely via CSS (position: fixed) rather than the
  // native Fullscreen API, which causes timing issues with Leaflet's tile
  // rendering. This approach is simpler and more reliable.
  const toggleFullscreen = () => setIsFullscreen((v) => !v);

  // After isFullscreen changes and the DOM re-renders with the new container
  // size, tell Leaflet to recompute its dimensions so tiles redraw.
  useEffect(() => {
    if (loading) return;
    // Multiple pulses because the CSS transition may take a few frames
    const t1 = setTimeout(() => mapRef.current?.invalidateSize(), 50);
    const t2 = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    const t3 = setTimeout(() => mapRef.current?.invalidateSize(), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isFullscreen, loading]);



  const filtered = useMemo(() => {
    if (!search) return points;
    const q = search.toLowerCase();
    return points.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [points, search]);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    markerLayerRef.current?.clearLayers();
    if (filtered.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    filtered.forEach((p) => {
      const color = (p.secteur_id && colorMap[p.secteur_id]) || "#6B7280";
      const marker = L.marker([p.latitude, p.longitude], { icon: createPinIcon(color) })
        .bindPopup(
          `<div style="font-family:system-ui;padding:4px 2px;min-width:160px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
              <strong style="font-size:14px;color:#1f2937;">${p.name}</strong>
            </div>
            <span style="font-size:12px;color:#6b7280;">${p.address}</span><br/>
            <span style="font-size:12px;color:#6b7280;">${p.city}</span><br/>
            <span style="font-size:11px;color:#9ca3af;">Code : ${p.code}</span>${p.secteur_nom ? `<br/><span style="font-size:11px;font-weight:600;color:${color};">Tournée : ${p.secteur_nom}</span>` : ""}
          </div>`
        );
      marker.on("click", () => setSelected(p));
      marker.addTo(markerLayerRef.current!);
      bounds.push([p.latitude, p.longitude]);
    });

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 16 });
    }
  }, [filtered, loading, colorMap]);

  const flyTo = (p: PointVente) => {
    setSelected(p);
    mapRef.current?.flyTo([p.latitude, p.longitude], 17, { duration: 0.8 });
  };

  return (
    <div
      className={`animate-fade-in ${
        isFullscreen
          ? "fixed inset-0 z-[9999] bg-white p-4 flex flex-col overflow-hidden"
          : "space-y-6"
      }`}
      ref={fullscreenRef}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapIcon size={26} className="text-primary-700" /> Carte des points de vente
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Visualisez l'étendue de votre champ d'action géographique
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          className="btn-ghost flex items-center gap-1.5"
          title="Plein écran"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isFullscreen ? "Réduire" : "Plein écran"}
        </button>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${isFullscreen ? "flex-1 min-h-0 mt-4" : ""}`}>
        {/* Map */}
        <div className={`card overflow-hidden p-0 relative ${isFullscreen ? "lg:col-span-2 h-full min-h-0" : "lg:col-span-2"}`}>
          <div ref={containerRef} className={`w-full ${isFullscreen ? "h-full" : "h-[500px] lg:h-[600px]"}`} />

          {/* Legend overlay — simple, always visible, no toggles */}
          {secteurs.filter((s) => s.actif).length > 0 && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 p-3 max-w-[200px]">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Légende</span>
              <div className="space-y-1.5">
                {secteurs.filter((s) => s.actif).map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white shadow-sm"
                      style={{ backgroundColor: s.color_code || "#E63946" }}
                    />
                    <span className="text-xs font-medium text-gray-700 truncate">{s.nom}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {filtered.map((p) => {
                  const color = (p.secteur_id && colorMap[p.secteur_id]) || "#6B7280";
                  return (
                    <button
                      key={p.id}
                      onClick={() => flyTo(p)}
                      className={`w-full text-left px-5 py-3 hover:bg-gray-50/50 transition-colors ${
                        selected?.id === p.id ? "bg-primary-50/40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: color + "22" }}
                        >
                          <Store size={16} style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                          <p className="text-xs text-gray-500 truncate">{p.address}</p>
                          <p className="text-xs text-gray-400">{p.city}</p>
                          {p.secteur_nom && (
                            <span className="inline-flex items-center gap-1 mt-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-[10px] font-semibold" style={{ color }}>{p.secteur_nom}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
