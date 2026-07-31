import { useEffect, useState } from "react";
import { FileText, Search, Filter, CheckCircle2, Clock, Package, XCircle, ChevronDown, Loader2, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import type { BonLivraison, BLStatut } from "@/types";
import { formatDate } from "@/lib/format";

const STATUT_CONFIG: Record<BLStatut, { label: string; icon: typeof Clock; bg: string; text: string }> = {
  en_attente: { label: "En attente", icon: Clock, bg: "bg-warning-50", text: "text-warning-700" },
  livre: { label: "Livré", icon: CheckCircle2, bg: "bg-success-50", text: "text-success-700" },
  partiel: { label: "Partiel", icon: Package, bg: "bg-blue-50", text: "text-blue-700" },
  annule: { label: "Annulé", icon: XCircle, bg: "bg-error-50", text: "text-error-700" },
};

export function AdminBonsLivraison() {
  const [bls, setBls] = useState<BonLivraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<BLStatut | "">("");
  const [selected, setSelected] = useState<BonLivraison | null>(null);
  const [newStatut, setNewStatut] = useState<BLStatut | "">("");
  const [updatingStatut, setUpdatingStatut] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listBonsLivraison(1, 200).then((res) => setBls(res.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = bls.filter((bl) => {
    const q = search.toLowerCase();
    const matchSearch = !q || bl.numero.toLowerCase().includes(q) ||
      bl.point_vente?.name.toLowerCase().includes(q) ||
      bl.commercial?.full_name.toLowerCase().includes(q) ||
      bl.superviseur?.full_name.toLowerCase().includes(q);
    const matchStatut = !filterStatut || bl.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const handleUpdateStatut = async () => {
    if (!selected || !newStatut) return;
    setUpdatingStatut(true);
    try {
      await api.updateBlStatut(selected.id, newStatut);
      showToast("success", "Statut mis à jour");
      setSelected(null);
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setUpdatingStatut(false);
    }
  };

  const counts = { en_attente: 0, livre: 0, partiel: 0, annule: 0 };
  bls.forEach((bl) => { if (bl.statut in counts) counts[bl.statut as BLStatut]++; });

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText size={26} className="text-primary-700" /> Bons de livraison</h1>
          <p className="text-gray-500 text-sm mt-1">Suivi et historique des bons de livraison</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(STATUT_CONFIG) as BLStatut[]).map((s) => {
          const cfg = STATUT_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button key={s} onClick={() => setFilterStatut(filterStatut === s ? "" : s)}
              className={`card p-4 text-left transition-all hover:ring-2 hover:ring-primary-200 ${filterStatut === s ? "ring-2 ring-primary-400" : ""}`}>
              <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={cfg.text} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{counts[s]}</p>
              <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-11" placeholder="Rechercher un BL, point de vente, commercial..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <select className="input pl-10 pr-8 appearance-none" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as BLStatut | "")}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUT_CONFIG) as BLStatut[]).map((s) => <option key={s} value={s}>{STATUT_CONFIG[s].label}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4"><FileText size={24} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucun bon de livraison trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["N° BL", "Point de vente", "Commercial", "Lignes", "Statut", "Date", ""].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((bl) => {
                  const cfg = STATUT_CONFIG[bl.statut] || STATUT_CONFIG.en_attente;
                  const Icon = cfg.icon;
                  return (
                    <tr key={bl.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-semibold text-primary-700 text-sm">{bl.numero}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{bl.point_vente?.name || "—"}</p>
                        <p className="text-xs text-gray-400">{bl.point_vente?.city}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">{bl.commercial?.full_name || bl.superviseur?.full_name || "—"}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="badge bg-gray-100 text-gray-700">{bl.lignes?.length ?? 0}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${cfg.bg} ${cfg.text} flex items-center gap-1.5 w-fit`}><Icon size={13} /> {cfg.label}</span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(bl.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => { setSelected(bl); setNewStatut(bl.statut); }} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                          Détail <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Bon de livraison — ${selected.numero}`} maxWidth="max-w-lg">
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Point de vente", value: selected.point_vente?.name },
                { label: "Ville", value: selected.point_vente?.city },
                { label: "Commercial", value: selected.commercial?.full_name || selected.superviseur?.full_name || "—" },
                { label: "Date de création", value: formatDate(selected.created_at) },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Lignes */}
            {selected.lignes && selected.lignes.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Produits</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Produit", "Qté", "Unité"].map((h) => <th key={h} className="px-4 py-2 text-left text-xs text-gray-500">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selected.lignes.map((l, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-gray-800">{l.produit_nom}</td>
                          <td className="px-4 py-2 text-gray-600">{l.quantite}</td>
                          <td className="px-4 py-2 text-gray-500">{l.unite}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Update statut */}
            <div>
              <label className="label">Mettre à jour le statut</label>
              <select className="input" value={newStatut} onChange={(e) => setNewStatut(e.target.value as BLStatut)}>
                {(Object.keys(STATUT_CONFIG) as BLStatut[]).map((s) => <option key={s} value={s}>{STATUT_CONFIG[s].label}</option>)}
              </select>
            </div>
            {selected.commentaire && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
                <p className="text-xs text-gray-400 mb-1">Commentaire</p>
                {selected.commentaire}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Fermer</button>
              <button onClick={handleUpdateStatut} disabled={updatingStatut || newStatut === selected.statut} className="btn-primary flex-1">
                {updatingStatut ? "Mise à jour..." : "Mettre à jour"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
