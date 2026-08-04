import { useEffect, useState, useRef, useMemo } from "react";
import { Map as MapIcon, Store, MapPin, Loader2, Search, Maximize2, Minimize2, Layers, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { api } from "@/lib/api";
import type { PointVente, Secteur } from "@/types";

function createPinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:800;">P</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

function createClusterIcon(secteurId: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">__COUNT__</div>`,
    iconSize: [38, 38],
  });
}

export function AdminCarte() {
  const [points, setPoints] = useState<PointVente[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PointVente | null>(null);
  const [visibleSecteurs, setVisibleSecteurs] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    Promise.all([api.listPointsVente(), api.listSecteurs()])
      .then(([pts, secs]) => {
        setPoints(pts);
        setSecteurs(secs);
        setVisibleSecteurs(new Set(secs.filter((s) => s.actif).map((s) => s.id)));
      })
      .finally(() => setLoading(false));
  }, []);

  // Color lookup map: secteur_id -> color_code
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    secteurs.forEach((s) => { m[s.id] = s.color_code || "#E63946"; });
    return m;
  }, [secteurs]);

  // secteur_id -> nom
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    secteurs.forEach((s) => { m[s.id] = s.nom; });
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

    labelLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fullscreen handling
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Invalidate map size after transition
      setTimeout(() => mapRef.current?.invalidateSize(), 200);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Filter points by search + visible secteurs
  const filtered = useMemo(() => {
    return points.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.city.toLowerCase().includes(search.toLowerCase()) ||
        p.address.toLowerCase().includes(search.toLowerCase());
      const matchSecteur = !p.secteur_id || visibleSecteurs.has(p.secteur_id);
      return matchSearch && matchSecteur;
    });
  }, [points, search, visibleSecteurs]);

  // Render markers + labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    // Clear previous cluster group
    if (clusterRef.current) {
      clusterRef.current.remove();
      clusterRef.current = null;
    }
    if (labelLayerRef.current) {
      labelLayerRef.current.clearLayers();
    }

    if (filtered.length === 0) return;

    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const markers = cluster.getAllChildMarkers();
        const colors = new Set<string>();
        let dominantColor = "#E63946";
        const colorCounts: Record<string, number> = {};
        markers.forEach((mk) => {
          const c = (mk.options.icon as L.DivIcon)?.options?.html?.match(/background:(#[0-9A-Fa-f]{6})/)?.[1] || "#E63946";
          colors.add(c);
          colorCounts[c] = (colorCounts[c] || 0) + 1;
        });
        // Pick the most frequent color
        dominantColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "#E63946";
        const count = cluster.getChildCount();
        const multiColor = colors.size > 1;
        const html = multiColor
          ? `<div style="background:conic-gradient(${Array.from(colors).join(' ')});color:#fff;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${count}</div>`
          : `<div style="background:${dominantColor};color:#fff;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${count}</div>`;
        return L.divIcon({ className: "", html, iconSize: [38, 38] });
      },
    });

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
      clusterGroup.addLayer(marker);
      bounds.push([p.latitude, p.longitude]);
    });

    clusterRef.current = clusterGroup;
    map.addLayer(clusterGroup);

    // Floating labels at the centroid of each secteur's points
    if (showLabels) {
      const bySecteur: Record<string, [number, number][]> = {};
      filtered.forEach((p) => {
        if (p.secteur_id) {
          if (!bySecteur[p.secteur_id]) bySecteur[p.secteur_id] = [];
          bySecteur[p.secteur_id].push([p.latitude, p.longitude]);
        }
      });
      Object.entries(bySecteur).forEach(([sid, coords]) => {
        if (coords.length < 2) return;
        const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
        const lng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
        const color = colorMap[sid] || "#E63946";
        const nom = (nameMap[sid] || "").toUpperCase();
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:#fff;padding:3px 12px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:0.5px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:1.5px solid rgba(255,255,255,0.4);transform:translateY(-28px);">${nom}</div>`,
          iconSize: [0, 0],
        });
        L.marker([lat, lng], { icon: labelIcon, interactive: false }).addTo(labelLayerRef.current!);
      });
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 16 });
    }
  }, [filtered, loading, colorMap, nameMap, showLabels]);

  const flyTo = (p: PointVente) => {
    setSelected(p);
    mapRef.current?.flyTo([p.latitude, p.longitude], 17, { duration: 0.8 });
  };

  const toggleSecteur = (id: string) => {
    setVisibleSecteurs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisible = visibleSecteurs.size === secteurs.filter((s) => s.actif).length;

  return (
    <div className="space-y-6 animate-fade-in" ref={fullscreenRef}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapIcon size={26} className="text-primary-700" /> Carte des points de vente
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Visualisez l'étendue de votre champ d'action géographique
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`btn-ghost flex items-center gap-1.5 ${showLabels ? "text-primary-700 bg-primary-50" : ""}`}
            title="Afficher/masquer les noms de tournées"
          >
            <Layers size={16} /> Labels
          </button>
          <button
            onClick={toggleFullscreen}
            className="btn-ghost flex items-center gap-1.5"
            title="Plein écran"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {isFullscreen ? "Réduire" : "Plein écran"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 card overflow-hidden p-0 relative">
          <div ref={containerRef} className={`w-full ${isFullscreen ? "h-[calc(100vh-80px)]" : "h-[500px] lg:h-[600px]"}`} />

          {/* Legend overlay */}
          {secteurs.length > 0 && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 p-3 max-w-[220px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Légende</span>
                <button
                  onClick={() => {
                    if (allVisible) setVisibleSecteurs(new Set());
                    else setVisibleSecteurs(new Set(secteurs.filter((s) => s.actif).map((s) => s.id)));
                  }}
                  className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold"
                >
                  {allVisible ? "Tout masquer" : "Tout afficher"}
                </button>
              </div>
              <div className="space-y-1.5">
                {secteurs.filter((s) => s.actif).map((s) => {
                  const isVisible = visibleSecteurs.has(s.id);
                  const count = points.filter((p) => p.secteur_id === s.id).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSecteur(s.id)}
                      className={`flex items-center gap-2 w-full text-left transition-opacity ${!isVisible ? "opacity-40" : ""}`}
                    >
                      <span
                        className="w-4 h-4 rounded flex-shrink-0 border border-white shadow-sm"
                        style={{ backgroundColor: s.color_code || "#E63946" }}
                      />
                      <span className="text-xs font-medium text-gray-700 truncate flex-1">{s.nom}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{count}</span>
                    </button>
                  );
                })}
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
