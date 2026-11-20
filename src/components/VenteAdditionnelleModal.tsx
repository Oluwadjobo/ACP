import { useState } from "react";
import { CheckCircle2, Plus, X, XCircle } from "lucide-react";
import { api } from "@/lib/api";

type AdditionSource = "mes_visites" | "mes_points_vente";
type AdditionStatus = "realisee" | "non_realisee";

interface VenteAdditionnelleModalProps {
  pointVenteId: string;
  pointVenteName: string;
  source: AdditionSource;
  visiteId?: string;
  onClose: () => void;
}

function createRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function VenteAdditionnelleModal({
  pointVenteId,
  pointVenteName,
  source,
  visiteId,
  onClose,
}: VenteAdditionnelleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<AdditionStatus | null>(null);
  const [requestId] = useState(createRequestId);

  const submit = async (statut: AdditionStatus) => {
    if (submitting || success) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createVenteAdditionnelle({
        point_vente_id: pointVenteId,
        visite_id: source === "mes_visites" ? visiteId : undefined,
        origine: source,
        statut,
        request_id: requestId,
      });
      setSuccess(statut);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'enregistrement a échoué.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vente-additionnelle-title"
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Vente additionnelle</p>
            <h2 id="vente-additionnelle-title" className="mt-1 text-lg font-bold text-gray-900">{pointVenteName}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Fermer" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-green-800">
              <CheckCircle2 size={20} />
              {success === "realisee" ? "Vente additionnelle réalisée enregistrée." : "Vente additionnelle non réalisée enregistrée."}
            </div>
            <p className="mt-2 text-sm text-green-700">L'opération a été ajoutée au rapport journalier. Aucune nouvelle visite GPS n'a été créée.</p>
            <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">Terminer</button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-600">Le point de vente vous a contacté pour une commande supplémentaire. Quel est le résultat ?</p>
            {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void submit("realisee")}
                disabled={submitting}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-4 text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                <CheckCircle2 size={25} />
                {submitting ? "Enregistrement…" : "Vente réalisée"}
              </button>
              <button
                type="button"
                onClick={() => void submit("non_realisee")}
                disabled={submitting}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle size={25} />
                Vente non réalisée
              </button>
            </div>
            <p className="mt-4 text-xs text-gray-400">Déclaration hors visite physique : aucune validation GPS n'est demandée.</p>
            <button type="button" onClick={onClose} disabled={submitting} className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
              Annuler
            </button>
          </>
        )}
      </section>
    </div>
  );
}
