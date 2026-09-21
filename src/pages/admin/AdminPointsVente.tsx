import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { Plus, Search, Pencil, Trash2, QrCode, MapPin, Store, Download, Navigation, Calendar, User, Filter, X, AlertTriangle, Archive, Power } from "lucide-react";
import { api } from "@/lib/api";
import type { PointVente, Secteur, Commercial, Superviseur, Team } from "@/types";
import { Modal } from "@/components/Modal";
import { getAccuratePosition } from "@/lib/gps";
import { useAuth } from "@/lib/auth";

interface DuplicateMatch {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  active: boolean;
  match_type: string;
}

export function AdminPointsVente() {
  const { teamCode, isSuperAdmin, hasPermission } = useAuth();
  const isYaourt = teamCode === "YAOURT";
  const [points, setPoints] = useState<PointVente[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [superviseurs, setSuperviseurs] = useState<Superviseur[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSecteur, setFilterSecteur] = useState("");
  const [filterCommercial, setFilterCommercial] = useState("");
  const [filterSuperviseur, setFilterSuperviseur] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PointVente | null>(null);
  const [qrModal, setQrModal] = useState<PointVente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PointVente | null>(null);
  const [bulkAction, setBulkAction] = useState<"delete" | "deactivate" | "activate" | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listPointsVente(),
      api.listSecteurs(),
      api.listCommerciaux(),
      api.listSuperviseurs(),
      ...(isSuperAdmin ? [api.listTeams()] : []),
    ])
      .then(([p, s, c, sup, t]) => {
        setPoints(p);
        setSecteurs(s);
        setCommerciaux(c);
        setSuperviseurs(sup);
        if (t) setTeams(t as Team[]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Build a lookup from secteur_id to commercial name and superviseur name
  const secteurToCommercial: Record<string, string> = {};
  for (const c of commerciaux) {
    if (c.tournees) {
      for (const t of c.tournees) {
        if (!secteurToCommercial[t.secteur_id]) secteurToCommercial[t.secteur_id] = c.full_name;
      }
    }
  }
  const secteurToSuperviseur: Record<string, string> = {};
  for (const s of superviseurs) {
    if (s.tournees) {
      for (const t of s.tournees) {
        if (!secteurToSuperviseur[t.secteur_id]) secteurToSuperviseur[t.secteur_id] = s.full_name;
      }
    }
  }

  // Get the set of secteur IDs assigned to the selected commercial
  const commercialSecteurIds = filterCommercial
    ? new Set(commerciaux.find((c) => c.id === filterCommercial)?.tournees?.map((t) => t.secteur_id) || [])
    : null;

  // Get the set of secteur IDs assigned to the selected superviseur
  const superviseurSecteurIds = filterSuperviseur
    ? new Set(superviseurs.find((s) => s.id === filterSuperviseur)?.tournees?.map((t) => t.secteur_id) || [])
    : null;

  const filtered = points.filter((p) => {
    const q = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchesSearch = !q ||
      p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q);
    const matchesSecteur = !filterSecteur || p.secteur_id === filterSecteur;
    const matchesActive = !filterActive ||
      (filterActive === "active" && p.active !== false) ||
      (filterActive === "inactive" && p.active === false);
    const matchesCommercial = !commercialSecteurIds || (p.secteur_id && commercialSecteurIds.has(p.secteur_id));
    const matchesSuperviseur = !superviseurSecteurIds || (p.secteur_id && superviseurSecteurIds.has(p.secteur_id));
    return matchesSearch && matchesSecteur && matchesActive && matchesCommercial && matchesSuperviseur;
  });

  const activeFilters = !!(filterSecteur || filterCommercial || filterSuperviseur || filterActive);
  const clearFilters = () => {
    setFilterSecteur("");
    setFilterCommercial("");
    setFilterSuperviseur("");
    setFilterActive("");
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((p) => p.id));
    });
  };

  const exportCsv = () => {
    const headers = ["Code", "Nom", "Adresse", "Ville", "Latitude", "Longitude", "Tournee", "Commercial", "Superviseur", "Actif", "Date creation"];
    const rows = filtered.map((p) => [
      p.code,
      p.name,
      p.address,
      p.city,
      p.latitude.toString(),
      p.longitude.toString(),
      p.secteur_nom || "",
      secteurToCommercial[p.secteur_id || ""] || "",
      secteurToSuperviseur[p.secteur_id || ""] || "",
      p.active === false ? "Non" : "Oui",
      new Date(p.created_at).toLocaleDateString("fr-FR"),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `points_vente_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const openGoogleMaps = (lat: number, lon: number) => {
    if (typeof lat !== "number" || typeof lon !== "number" || isNaN(lat) || isNaN(lon)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, "_blank");
  };

  const selectedPoints = filtered.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Points de vente</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez vos points de vente et leurs QR codes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-secondary" disabled={loading || filtered.length === 0}>
            <Download size={18} />
            Exporter
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary">
            <Plus size={18} />
            Ajouter
          </button>
        </div>
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" className="input pl-11" placeholder="Rechercher par nom, code ou ville..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary text-sm ${activeFilters ? "border-primary-300 text-primary-700" : ""}`}
        >
          <Filter size={16} />
          Filtres
          {activeFilters && <span className="ml-1 w-5 h-5 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">
            {[filterSecteur, filterCommercial, filterSuperviseur, filterActive].filter(Boolean).length}
          </span>}
        </button>
        {activeFilters && (
          <button onClick={clearFilters} className="btn-ghost text-sm text-gray-500">
            <X size={14} />
            Effacer
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
          <div>
            <label className="label text-xs">Tournée</label>
            <select className="input text-sm" value={filterSecteur} onChange={(e) => setFilterSecteur(e.target.value)}>
              <option value="">Toutes</option>
              {secteurs.filter((s) => s.actif).map((s) => (
                <option key={s.id} value={s.id}>{s.nom} ({s.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Commercial</label>
            <select className="input text-sm" value={filterCommercial} onChange={(e) => setFilterCommercial(e.target.value)}>
              <option value="">Tous</option>
              {commerciaux.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Team Leader</label>
            <select className="input text-sm" value={filterSuperviseur} onChange={(e) => setFilterSuperviseur(e.target.value)}>
              <option value="">Tous</option>
              {superviseurs.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Statut</label>
            <select className="input text-sm" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
              <option value="">Tous</option>
              <option value="active">Actifs</option>
              <option value="inactive">Désactivés</option>
            </select>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-3 animate-fade-in">
          <span className="text-sm font-medium text-gray-700">{selected.size} sélectionné(s)</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setBulkAction("activate")} className="btn-secondary text-xs py-2">
              <Power size={14} />
              Activer
            </button>
            <button onClick={() => setBulkAction("deactivate")} className="btn-secondary text-xs py-2">
              <Archive size={14} />
              Désactiver
            </button>
            <button onClick={() => setBulkAction("delete")} className="btn-danger text-xs py-2">
              <Trash2 size={14} />
              Supprimer
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost text-xs py-2">
              <X size={14} />
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Store size={26} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Aucun point de vente trouvé</p>
          </div>
        ) : (
          <>
            {/* Select all header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-500">
                {filtered.length} point(s) de vente
                {filtered.length !== points.length && ` (sur ${points.length})`}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {filtered.map((p) => (
                <div key={p.id} className={`rounded-xl border p-4 hover:shadow-md transition-shadow ${p.active === false ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm truncate">{p.name}</h3>
                        <p className="text-xs text-primary-600 font-medium mt-0.5">{p.code}</p>
                        {p.active === false && (
                          <span className="inline-block mt-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Désactivé</span>
                        )}
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Store size={18} className="text-primary-600" />
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-gray-500 mb-4">
                    <p className="flex items-start gap-1.5">
                      <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="truncate">{p.address}, {p.city}</span>
                    </p>
                    <p className="text-gray-400">GPS: {p.latitude != null && p.longitude != null ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : "Non défini"}</p>
                    <p className="flex items-center gap-1.5">
                      <Calendar size={12} className="flex-shrink-0" />
                      <span>Créé le {new Date(p.created_at).toLocaleDateString("fr-FR")}</span>
                    </p>
                    {p.created_by_name && (
                      <p className="flex items-center gap-1.5">
                        <User size={12} className="flex-shrink-0" />
                        <span>par {p.created_by_name}{p.created_by_role === "superviseur" ? " (Team Leader)" : ""}</span>
                      </p>
                    )}
                    {secteurToCommercial[p.secteur_id || ""] && (
                      <p className="text-gray-400">Commercial: {secteurToCommercial[p.secteur_id || ""]}</p>
                    )}
                    {secteurToSuperviseur[p.secteur_id || ""] && (
                      <p className="text-gray-400">Team Leader: {secteurToSuperviseur[p.secteur_id || ""]}</p>
                    )}
                    {p.secteur_nom && (
                      <span
                        className="badge"
                        style={{
                          backgroundColor: p.secteur_color ? p.secteur_color + "20" : undefined,
                          color: p.secteur_color || undefined,
                        }}
                      >
                        {p.secteur_nom}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQrModal(p)} className="btn-secondary flex-1 text-xs py-2">
                      <QrCode size={14} />
                      QR Code
                    </button>
                    <button onClick={() => openGoogleMaps(p.latitude, p.longitude)} className="btn-ghost p-2 rounded-lg" title="Y aller - Itineraire">
                      <Navigation size={16} className="text-primary-600" />
                    </button>
                    <button onClick={() => { setEditing(p); setModalOpen(true); }} className="btn-ghost p-2 rounded-lg" title="Modifier">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="btn-ghost p-2 rounded-lg text-error-500 hover:bg-error-50" title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <PointVenteModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} showToast={showToast} isYaourt={isYaourt} />
      <QrModal point={qrModal} onClose={() => setQrModal(null)} />
      <DeleteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); load(); }} showToast={showToast} />
      <BulkActionModal
        action={bulkAction}
        selectedPoints={selectedPoints}
        onClose={() => setBulkAction(null)}
        onDone={() => { setBulkAction(null); setSelected(new Set()); load(); }}
        showToast={showToast}
      />
    </div>
  );
}

function PointVenteModal({
  open, editing, onClose, onSaved, showToast, isYaourt,
}: {
  open: boolean;
  editing: PointVente | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
  isYaourt: boolean;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [secteurId, setSecteurId] = useState("");
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [gettingGps, setGettingGps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frigoComtesse, setFrigoComtesse] = useState<string>("");
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkedDup, setCheckedDup] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);

  useEffect(() => {
    if (open) {
      api.listSecteurs().then(setSecteurs).catch(() => {});
      setName(editing?.name || "");
      setAddress(editing?.address || "");
      setCity(editing?.city || "");
      setLatitude(editing?.latitude?.toString() || "");
      setLongitude(editing?.longitude?.toString() || "");
      setSecteurId(editing?.secteur_id || "");
      setFrigoComtesse(editing?.frigo_comtesse === true ? "oui" : editing?.frigo_comtesse === false ? "non" : "");
      setDuplicates([]);
      setCheckedDup(false);
      setForceCreate(false);
    }
  }, [open, editing]);

  const useMyGps = async () => {
    setGettingGps(true);
    showToast("success", "GPS en cours : restez immobile jusqu'à 20 s pour une précision optimale");
    try {
      const pos = await getAccuratePosition(20000, 10);
      setLatitude(pos.latitude.toFixed(6));
      setLongitude(pos.longitude.toFixed(6));
      showToast("success", `Position captée (précision ±${Math.round(pos.accuracy)} m)`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Impossible d'obtenir votre position GPS");
    } finally {
      setGettingGps(false);
    }
  };

  const checkDuplicates = async (): Promise<boolean> => {
    if (editing || !name.trim()) return false;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    try {
      const result = await api.checkPointVenteDuplicates({
        name: name.trim(),
        latitude: isNaN(lat) ? undefined : lat,
        longitude: isNaN(lng) ? undefined : lng,
      });
      if (result.duplicates.length > 0) {
        setDuplicates(result.duplicates);
        setCheckedDup(true);
        return true;
      }
    } catch { /* server may not support it yet */ }
    setCheckedDup(true);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secteurId) { showToast("error", "Veuillez sélectionner une tournée"); return; }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) { showToast("error", "Latitude invalide"); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { showToast("error", "Longitude invalide"); return; }

    // Check for duplicates before creating (only for new POS, and if not already forced)
    if (!editing && !forceCreate) {
      const hasDups = await checkDuplicates();
      if (hasDups) {
        showToast("error", "Doublon probable détecté — voir ci-dessous");
        return;
      }
    }

    setSaving(true);
    try {
      if (editing) {
        await api.updatePointVente(editing.id, { name, address, city, latitude: lat, longitude: lng, secteur_id: secteurId || null, ...(isYaourt ? { frigo_comtesse: frigoComtesse === "oui" ? true : frigoComtesse === "non" ? false : null } : {}) });
        showToast("success", "Point de vente modifié");
      } else {
        await api.createPointVente({ name, address, city, latitude: lat, longitude: lng, secteur_id: secteurId || undefined, ...(isYaourt ? { frigo_comtesse: frigoComtesse === "oui" ? true : frigoComtesse === "non" ? false : null } : {}) });
        showToast("success", "Point de vente créé");
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      // Check if the error contains duplicate info from the server
      try {
        const parsed = JSON.parse(msg);
        if (parsed.duplicates) {
          setDuplicates(parsed.duplicates);
          setCheckedDup(true);
          showToast("error", "Doublon probable détecté — voir ci-dessous");
          setSaving(false);
          return;
        }
      } catch { /* not JSON */ }
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le point de vente" : "Nouveau point de vente"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Duplicate alert */}
        {checkedDup && duplicates.length > 0 && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-warning-700 font-semibold text-sm">
              <AlertTriangle size={16} />
              Doublon probable détecté
            </div>
            <p className="text-xs text-warning-600">
              Les points de vente suivants existent déjà. Vérifiez avant de continuer.
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {duplicates.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium text-gray-900">{d.name} ({d.code})</p>
                    <p className="text-gray-500">{d.address}, {d.city}</p>
                    <p className="text-gray-400">Correspondance: {d.match_type === "name" ? "Nom identique" : "GPS très proche"}</p>
                  </div>
                  {d.active === false && <span className="badge bg-gray-100 text-gray-500">Désactivé</span>}
                </div>
              ))}
            </div>
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-warning-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={forceCreate}
                  onChange={(e) => setForceCreate(e.target.checked)}
                  className="w-4 h-4 rounded border-warning-300 text-warning-600 focus:ring-warning-500"
                />
                Créer malgré tout (ce n'est pas un doublon)
              </label>
            )}
          </div>
        )}

        <div>
          <label className="label">Nom du point de vente</label>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setCheckedDup(false); setDuplicates([]); }} required placeholder="Supérette du Centre" />
        </div>
        <div>
          <label className="label">Adresse</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="12 rue de la Paix" />
        </div>
        <div>
          <label className="label">Ville</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required placeholder="Paris" />
        </div>
        <div>
          <label className="label">Tournée <span className="text-error-500">*</span></label>
          <select className="input" value={secteurId} onChange={(e) => setSecteurId(e.target.value)} required disabled={secteurs.length === 0}>
            <option value="">Sélectionnez une tournée</option>
            {secteurs.filter(s => s.actif).map((s) => (
              <option key={s.id} value={s.id}>{s.nom} ({s.code})</option>
            ))}
          </select>
          {secteurs.length === 0 && (
            <p className="text-xs text-warning-600 mt-1">
              Aucune tournée ne vous est affectée. Veuillez contacter un administrateur.
            </p>
          )}
        </div>
        {isYaourt && (
          <div>
            <label className="label">Frigo Comtesse</label>
            <select className="input" value={frigoComtesse} onChange={(e) => setFrigoComtesse(e.target.value)}>
              <option value="">Sélectionnez...</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Latitude</label>
            <input className="input" value={latitude} onChange={(e) => { setLatitude(e.target.value); setCheckedDup(false); }} required placeholder="48.8566" />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input className="input" value={longitude} onChange={(e) => { setLongitude(e.target.value); setCheckedDup(false); }} required placeholder="2.3522" />
          </div>
        </div>
        <button type="button" onClick={useMyGps} disabled={gettingGps} className="btn-secondary w-full text-xs py-2">
          <MapPin size={14} />
          {gettingGps ? "Localisation en cours..." : "Utiliser ma position GPS actuelle"}
        </button>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QrModal({ point, onClose }: { point: PointVente | null; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!point) return;
    const qrContent = JSON.stringify({ t: point.qr_token });
    QRCode.toCanvas(canvasRef.current, qrContent, {
      width: 280,
      margin: 2,
      color: { dark: "#0d1b5e", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    QRCode.toDataURL(qrContent, {
      width: 600,
      margin: 2,
      color: { dark: "#0d1b5e", light: "#ffffff" },
    }).then((qrUrl) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 700;
        canvas.height = 860;
        const context = canvas.getContext("2d");
        if (!context) return;

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "#0d1b5e";
        context.lineWidth = 8;
        context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
        context.drawImage(image, 50, 50, 600, 600);
        context.strokeStyle = "#dbe3f0";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(50, 690);
        context.lineTo(650, 690);
        context.stroke();
        context.fillStyle = "#0d1b5e";
        context.textAlign = "center";
        context.font = "700 30px Arial";
        context.fillText(point.name, 350, 745, 590);
        context.font = "700 25px Arial";
        context.fillText(point.code, 350, 795, 590);
        setDataUrl(canvas.toDataURL("image/png"));
      };
      image.src = qrUrl;
    });
  }, [point]);

  if (!point) return null;

  const downloadPng = () => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `QR_${point.code}.png`;
    link.click();
  };

  const downloadPdf = () => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 30;

    pdf.setFontSize(22);
    pdf.setTextColor(13, 27, 94);
    pdf.text("Contrôle de Présence Terrain", pageWidth / 2, y, { align: "center" });
    y += 10;

    pdf.setFontSize(11);
    pdf.setTextColor(120, 120, 120);
    pdf.text("QR Code de vérification de présence", pageWidth / 2, y, { align: "center" });
    y += 20;

    pdf.setFontSize(20);
    pdf.setTextColor(20, 20, 20);
    pdf.text(point.name, pageWidth / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(12);
    pdf.setTextColor(26, 71, 230);
    pdf.text(`Code: ${point.code}`, pageWidth / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(11);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`${point.address}, ${point.city}`, pageWidth / 2, y, { align: "center" });
    y += 15;

    const imgSize = 90;
    const imgX = (pageWidth - imgSize) / 2;
    pdf.addImage(dataUrl, "PNG", imgX, y, imgSize, imgSize);
    y += imgSize + 10;

    const frameX = 35;
    const frameWidth = pageWidth - 70;
    pdf.setDrawColor(13, 27, 94);
    pdf.setLineWidth(0.8);
    pdf.rect(frameX, y, frameWidth, 25);
    pdf.setFontSize(13);
    pdf.setTextColor(13, 27, 94);
    pdf.text(point.name, pageWidth / 2, y + 10, { align: "center", maxWidth: frameWidth - 12 });
    pdf.setFontSize(11);
    pdf.text(point.code, pageWidth / 2, y + 19, { align: "center" });
    y += 34;

    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text("À afficher dans le point de vente pour le scan des commerciaux.", pageWidth / 2, y, { align: "center" });

    pdf.save(`QR_${point.code}.pdf`);
  };

  return (
    <Modal open={!!point} onClose={onClose} title="QR Code du point de vente" maxWidth="max-w-md">
      <div className="flex flex-col items-center">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm mb-4">
          <canvas ref={canvasRef} />
        </div>
        <div className="text-center mb-4">
          <p className="font-bold text-gray-900">{point.name}</p>
          <p className="text-sm text-primary-600 font-medium">{point.code}</p>
          <p className="text-xs text-gray-500 mt-1">{point.address}, {point.city}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={downloadPng} className="btn-secondary flex-1">
            <Download size={16} />
            PNG
          </button>
          <button onClick={downloadPdf} className="btn-primary flex-1">
            <Download size={16} />
            PDF
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">
          Le QR code ne contient qu'un identifiant sécurisé. Aucune information sensible n'est exposée.
        </p>
      </div>
    </Modal>
  );
}

function DeleteModal({
  target, onClose, onDeleted, showToast,
}: {
  target: PointVente | null;
  onClose: () => void;
  onDeleted: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  return (
    <Modal open={!!target} onClose={onClose} title="Supprimer le point de vente" maxWidth="max-w-md">
      <p className="text-gray-600 text-sm mb-6">
        Êtes-vous sûr de vouloir supprimer <strong>{target?.name}</strong> ({target?.code}) ?
        Si ce point de vente possède un historique (visites, ventes, contrôles), la suppression sera refusée — désactivez-le plutôt pour préserver les données.
      </p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="btn-secondary">Annuler</button>
        <button
          onClick={async () => {
            if (!target) return;
            try {
              await api.deletePointVente(target.id);
              onDeleted();
              showToast("success", "Point de vente supprimé");
            } catch (err) {
              showToast("error", err instanceof Error ? err.message : "Erreur lors de la suppression");
            }
          }}
          className="btn-danger"
        >
          Supprimer
        </button>
      </div>
    </Modal>
  );
}

function BulkActionModal({
  action, selectedPoints, onClose, onDone, showToast,
}: {
  action: "delete" | "deactivate" | "activate" | null;
  selectedPoints: PointVente[];
  onClose: () => void;
  onDone: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  if (!action) return null;
  const ids = selectedPoints.map((p) => p.id);
  const isDelete = action === "delete";
  const isActivate = action === "activate";

  return (
    <Modal open={!!action} onClose={onClose} title={isDelete ? "Supprimer les points de vente" : isActivate ? "Activer les points de vente" : "Désactiver les points de vente"} maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-gray-600 text-sm">
          {isDelete
            ? `${selectedPoints.length} point(s) de vente vont être supprimés. Ceux avec un historique ne pourront pas être supprimés.`
            : isActivate
            ? `${selectedPoints.length} point(s) de vente vont être activés.`
            : `${selectedPoints.length} point(s) de vente vont être désactivés (archivés). L'historique est préservé.`}
        </p>
        {/* Show details for each POS */}
        <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1.5">
          {selectedPoints.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-gray-900">{p.name} ({p.code})</p>
                <p className="text-gray-500">{p.address}, {p.city}</p>
              </div>
              {p.active === false && <span className="badge bg-gray-100 text-gray-500">Désactivé</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={async () => {
              try {
                if (isDelete) {
                  await api.bulkDeletePointsVente(ids);
                  showToast("success", `${ids.length} point(s) de vente supprimé(s)`);
                } else {
                  await api.bulkUpdatePointsVente(ids, isActivate);
                  showToast("success", `${ids.length} point(s) de vente ${isActivate ? "activé(s)" : "désactivé(s)"}`);
                }
                onDone();
              } catch (err) {
                showToast("error", err instanceof Error ? err.message : "Erreur");
              }
            }}
            className={isDelete ? "btn-danger" : "btn-primary"}
          >
            {isDelete ? "Supprimer" : isActivate ? "Activer" : "Désactiver"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
