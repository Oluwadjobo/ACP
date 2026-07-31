import { useEffect, useState } from "react";
import { TrendingDown, Loader2, ChevronRight, Package, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";
import type { Visite, Produit } from "@/types";

export function SuperviseurVentesNonRealisees() {
  const [visites, setVisites] = useState<Visite[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Visite | null>(null);
  const [action, setAction] = useState<"promesse" | "refus" | null>(null);
  const [selectedProduits, setSelectedProduits] = useState<string[]>([]);
  const [quantite, setQuantite] = useState(1);
  const [datePrev, setDatePrev] = useState("");
  const [montant, setMontant] = useState("");
  const [responsable, setResponsable] = useState("");
  const [observations, setObservations] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listVentesNonRealisees().then(setVisites).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.listProduits().then(setProduits).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!selected || !action) return;
    setSubmitting(true);
    try {
      if (action === "promesse") {
        if (selectedProduits.length === 0) { setSubmitting(false); return; }
        await api.createPromesse({
          visite_id: selected.id,
          point_vente_id: selected.point_vente?.name ? (selected as unknown as Record<string, unknown>).point_vente_id as string : "",
          produits: selectedProduits,
          quantite,
          date_previsionnelle: datePrev || undefined,
          montant_estime: montant ? Number(montant) : undefined,
          responsable: responsable || undefined,
          observations: observations || undefined,
        });
        showToast("success", "Promesse d'achat enregistrée");
      } else {
        await api.finalizeVisit({ visite_id: selected.id, vente_status: "vente_non_realisee", motif: observations || "Refus confirmé par le Team Leader" });
        showToast("success", "Refus confirmé");
      }
      setSelected(null);
      setAction(null);
      setSelectedProduits([]);
      setQuantite(1);
      setDatePrev("");
      setMontant("");
      setResponsable("");
      setObservations("");
      load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><TrendingDown size={26} className="text-error-500" /> Ventes non réalisées</h1>
        <p className="text-gray-500 text-sm mt-1">Visites non concluantes de vos commerciaux à suivre</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
      ) : visites.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28} className="text-success-600" /></div>
          <p className="text-gray-500">Aucune vente non réalisée à suivre. Tout va bien !</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="divide-y divide-gray-50">
            {visites.map((v) => (
              <button key={v.id} onClick={() => setSelected(v)} className="w-full text-left px-5 py-4 hover:bg-gray-50/50 transition-colors flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-error-50 flex items-center justify-center flex-shrink-0"><TrendingDown size={20} className="text-error-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{v.point_vente?.name || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {v.commercial?.full_name || "—"} • {formatDate(v.visited_at)}
                  </p>
                  {v.motif && <span className="badge bg-error-50 text-error-600 mt-1">{v.motif}</span>}
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail / Action Modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setAction(null); }} title="Suivi de la visite non concluante" maxWidth="max-w-md">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Point de vente</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{selected.point_vente?.name || "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Commercial</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{selected.commercial?.full_name || "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatDate(selected.visited_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Motif</p>
                <p className="text-sm font-semibold text-error-600 mt-0.5">{selected.motif || "—"}</p>
              </div>
            </div>

            {!action && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-600 text-center">Quelle action souhaitez-vous entreprendre ?</p>
                <button onClick={() => setAction("promesse")} className="w-full card p-4 flex items-center gap-3 hover:ring-2 hover:ring-warning-200 transition-all text-left">
                  <div className="w-11 h-11 rounded-xl bg-warning-50 flex items-center justify-center"><Package size={22} className="text-warning-600" /></div>
                  <div className="flex-1"><p className="font-semibold text-gray-900 text-sm">Obtenir une promesse d'achat</p><p className="text-xs text-gray-500">Le client s'engage à acheter</p></div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
                <button onClick={() => setAction("refus")} className="w-full card p-4 flex items-center gap-3 hover:ring-2 hover:ring-error-200 transition-all text-left">
                  <div className="w-11 h-11 rounded-xl bg-error-50 flex items-center justify-center"><XCircle size={22} className="text-error-500" /></div>
                  <div className="flex-1"><p className="font-semibold text-gray-900 text-sm">Confirmer le refus</p><p className="text-xs text-gray-500">Le client refuse définitivement</p></div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              </div>
            )}

            {action === "promesse" && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="label">Produits</label>
                  <div className="flex flex-wrap gap-2">
                    {produits.map((p) => (
                      <button key={p.id} onClick={() => setSelectedProduits(prev => prev.includes(p.nom) ? prev.filter(x => x !== p.nom) : [...prev, p.nom])}
                        className={`badge cursor-pointer transition-all ${selectedProduits.includes(p.nom) ? "bg-warning-100 text-warning-700 ring-1 ring-warning-300" : "bg-gray-100 text-gray-600"}`}>
                        {p.nom}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Quantité</label><input type="number" min={1} className="input" value={quantite} onChange={(e) => setQuantite(Number(e.target.value))} /></div>
                  <div><label className="label">Date prévue</label><input type="date" className="input" value={datePrev} onChange={(e) => setDatePrev(e.target.value)} /></div>
                </div>
                <div><label className="label">Montant estimé (facultatif)</label><input type="number" step="0.01" className="input" value={montant} onChange={(e) => setMontant(e.target.value)} /></div>
                <div><label className="label">Responsable (facultatif)</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} /></div>
                <div><label className="label">Observations</label><textarea className="input min-h-[60px]" value={observations} onChange={(e) => setObservations(e.target.value)} /></div>
                <div className="flex gap-3">
                  <button onClick={() => setAction(null)} className="btn-secondary flex-1">Retour</button>
                  <button onClick={handleSubmit} disabled={submitting || selectedProduits.length === 0} className="btn-primary flex-1">{submitting ? "..." : "Valider"}</button>
                </div>
              </div>
            )}

            {action === "refus" && (
              <div className="space-y-3 pt-2">
                <div><label className="label">Observations</label><textarea className="input min-h-[80px]" value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Ajoutez vos observations sur ce refus..." /></div>
                <div className="flex gap-3">
                  <button onClick={() => setAction(null)} className="btn-secondary flex-1">Retour</button>
                  <button onClick={handleSubmit} disabled={submitting} className="btn-danger flex-1">{submitting ? "..." : "Confirmer le refus"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
