import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2, Star, Eye, Package, Store, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";
import type { PointVente, ControleNotation } from "@/types";
import { CONTROLE_NOTATIONS } from "@/types";

const NOTATION_COLORS: Record<ControleNotation, string> = {
  excellent: "bg-success-50 text-success-700 ring-success-200",
  bon: "bg-accent-50 text-accent-700 ring-accent-200",
  moyen: "bg-warning-50 text-warning-700 ring-warning-200",
  faible: "bg-error-50 text-error-600 ring-error-200",
  critique: "bg-error-50 text-error-700 ring-error-300",
};

export function SuperviseurControleTerrain() {
  const [points, setPoints] = useState<PointVente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PointVente | null>(null);
  const [notation, setNotation] = useState<ControleNotation | "">("");
  const [presenceComtesse, setPresenceComtesse] = useState(true);
  const [disponibilite, setDisponibilite] = useState(true);
  const [visibilite, setVisibilite] = useState(true);
  const [merchandising, setMerchandising] = useState(true);
  const [presenceConcurrents, setPresenceConcurrents] = useState(false);
  const [commentaires, setCommentaires] = useState("");
  const [recommandations, setRecommandations] = useState("");
  const [actionsCorrectives, setActionsCorrectives] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    api.listPointsVente().then(setPoints).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!selected || !notation) return;
    setSubmitting(true);
    try {
      await api.createControle({
        point_vente_id: selected.id,
        notation,
        presence_comtesse: presenceComtesse,
        disponibilite: disponibilite,
        visibilite: visibilite,
        merchandising: merchandising,
        presence_concurrents: presenceConcurrents,
        commentaires: commentaires || undefined,
        recommandations: recommandations || undefined,
        actions_correctives: actionsCorrectives || undefined,
      });
      showToast("success", "Contrôle terrain enregistré");
      setSelected(null);
      setNotation("");
      setPresenceComtesse(true); setDisponibilite(true); setVisibilite(true); setMerchandising(true); setPresenceConcurrents(false);
      setCommentaires(""); setRecommandations(""); setActionsCorrectives("");
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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ClipboardCheck size={26} className="text-primary-700" /> Contrôle terrain</h1>
        <p className="text-gray-500 text-sm mt-1">Évaluez le facing et la visibilité des produits COMTESSE</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
      ) : points.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4"><Store size={28} className="text-gray-400" /></div>
          <p className="text-gray-500">Aucun point de vente disponible</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {points.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className="card p-5 text-left hover:ring-2 hover:ring-primary-200 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center"><Store size={20} className="text-primary-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.city}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 truncate">{p.address}</p>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Contrôle terrain" maxWidth="max-w-md">
        {selected && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Point de vente</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{selected.name}</p>
              <p className="text-xs text-gray-500">{selected.address}, {selected.city}</p>
            </div>

            {/* Notation */}
            <div>
              <label className="label">Notation globale *</label>
              <div className="grid grid-cols-5 gap-2">
                {CONTROLE_NOTATIONS.map((n) => (
                  <button key={n.value} onClick={() => setNotation(n.value)}
                    className={`rounded-xl py-2.5 px-1 text-xs font-semibold transition-all ${notation === n.value ? NOTATION_COLORS[n.value] + " ring-2" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              {[
                { label: "Présence des produits COMTESSE", icon: Package, value: presenceComtesse, set: setPresenceComtesse },
                { label: "Disponibilité des produits", icon: Check, value: disponibilite, set: setDisponibilite },
                { label: "Visibilité des produits", icon: Eye, value: visibilite, set: setVisibilite },
                { label: "Respect du merchandising", icon: Star, value: merchandising, set: setMerchandising },
                { label: "Présence de produits concurrents", icon: X, value: presenceConcurrents, set: setPresenceConcurrents },
              ].map((item) => (
                <button key={item.label} onClick={() => item.set(!item.value)}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-2.5 transition-colors ${item.value ? "bg-primary-50" : "bg-gray-50"}`}>
                  <span className="text-sm text-gray-700">{item.label}</span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${item.value ? "bg-primary-500" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${item.value ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                </button>
              ))}
            </div>

            <div><label className="label">Commentaires</label><textarea className="input min-h-[60px]" value={commentaires} onChange={(e) => setCommentaires(e.target.value)} /></div>
            <div><label className="label">Recommandations</label><textarea className="input min-h-[60px]" value={recommandations} onChange={(e) => setRecommandations(e.target.value)} /></div>
            <div><label className="label">Actions correctives</label><textarea className="input min-h-[60px]" value={actionsCorrectives} onChange={(e) => setActionsCorrectives(e.target.value)} /></div>

            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Annuler</button>
              <button onClick={handleSubmit} disabled={submitting || !notation} className="btn-primary flex-1">{submitting ? "Enregistrement..." : "Valider"}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
