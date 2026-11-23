import { useEffect, useState, useMemo, useRef } from "react";
import { Store, Search, Navigation, Phone, CheckCircle2, Clock, TrendingUp, Truck, Package, PhoneCall, X, Loader2, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MesPointVente as MesPointVenteType } from "@/types";
import { formatDate, formatPointVenteAddress } from "@/lib/format";

type PhoneSaleStatus = "vente_realisee" | "vente_non_realisee";

export function MesPointsVente() {
  const { userType, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [points, setPoints] = useState<MesPointVenteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const [phonePoint, setPhonePoint] = useState<MesPointVenteType | null>(null);
  const [phoneSaleStatus, setPhoneSaleStatus] = useState<PhoneSaleStatus | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneSuccess, setPhoneSuccess] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    api.mesPointsVente().then(setPoints).finally(() => setLoading(false));
  }, []);

  const homePath = userType === "superviseur" ? "/superviseur" : userType === "agent_livreur" ? "/agent-livreur" : "/commercial";
  const canRecordPhoneOrder = userType === "commercial" && hasPermission("record_vente");
  const isCommercial = userType === "commercial";

  const filtered = useMemo(() => {
    let result = points;
    if (search) {
      const q = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      result = result.filter((p) => {
        const name = (p.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const city = (p.city || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const address = (p.address || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const code = (p.code || "").toLowerCase();
        return name.includes(q) || city.includes(q) || address.includes(q) || code.includes(q);
      });
    }
    if (filter === "visite") result = result.filter((p) => p.statut === "visite");
    else if (filter === "non_visite") result = result.filter((p) => p.statut === "non_visite");
    else if (filter === "vente") result = result.filter((p) => p.derniere_vente);
    return result;
  }, [points, search, filter]);

  function openPhoneOrder(point: MesPointVenteType) {
    setPhonePoint(point);
    setPhoneSaleStatus(null);
    setPhoneError(null);
    setPhoneSuccess(false);
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  function closePhoneOrder() {
    if (phoneBusy) return;
    setPhonePoint(null);
    setPhoneSaleStatus(null);
    setPhoneError(null);
    setPhoneSuccess(false);
    idempotencyKeyRef.current = null;
  }

  async function submitPhoneOrder() {
    if (!phonePoint || !phoneSaleStatus || submitLockRef.current || phoneSuccess) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    submitLockRef.current = true;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      await api.recordPhoneSaleStatus({
        point_vente_id: phonePoint.id,
        vente_status: phoneSaleStatus,
        idempotency_key: idempotencyKeyRef.current,
      });
      setPhoneSuccess(true);
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "Impossible d'enregistrer le résultat de l'appel.");
    } finally {
      submitLockRef.current = false;
      setPhoneBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className={isCommercial ? "flex flex-col" : "min-h-screen bg-gray-50 flex flex-col"}>
      {!isCommercial && (
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Store size={20} /><span className="font-bold text-sm">Mes points de vente</span></div>
        <button onClick={() => navigate(homePath)} className="btn-ghost text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm">Retour</button>
      </header>
      )}

      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" className="input pl-11" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { key: "all", label: "Tous" },
            { key: "visite", label: "Visités" },
            { key: "non_visite", label: "Non visités" },
            { key: "vente", label: "Avec vente" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === f.key ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">{filtered.length} point{filtered.length > 1 ? "s" : ""} de vente</span>
        <span className="badge bg-primary-50 text-primary-700">{points.length} total</span>
      </div>

      <main className="flex-1 px-4 py-4 space-y-2 max-w-2xl w-full mx-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><Store size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucun point de vente trouvé</p>
          </div>
        ) : (
          filtered.map((p) => {
            const color = p.secteur_color || "#6B7280";
            const isVisited = p.statut === "visite";
            const hasVente = !!p.derniere_vente;
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isVisited ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-400"}`}>
                    {isVisited ? <CheckCircle2 size={18} /> : <Store size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                      <span className="text-[10px] text-gray-400 font-mono">{p.code}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{formatPointVenteAddress(p.address, p.city)}</p>

                    {p.secteur_nom && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[10px] font-semibold" style={{ color }}>{p.secteur_nom}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`badge text-[10px] ${isVisited ? "bg-success-50 text-success-600" : "bg-gray-100 text-gray-500"}`}>
                        {isVisited ? <CheckCircle2 size={10} /> : <Clock size={10} />} {isVisited ? "Visité" : "Non visité"}
                      </span>
                      {hasVente && <span className="badge bg-primary-50 text-primary-700 text-[10px]"><TrendingUp size={10} /> Vente</span>}
                      {p.commande_code && <span className="badge bg-secondary-50 text-secondary-700 text-[10px]"><Package size={10} /> {p.commande_code}</span>}
                      {p.commande_statut === "livree" && <span className="badge bg-success-50 text-success-600 text-[10px]"><Truck size={10} /> Livré</span>}
                      {p.commande_statut && p.commande_statut !== "livree" && <span className="badge bg-warning-50 text-warning-600 text-[10px]"><Truck size={10} /> En attente</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      {p.derniere_visite && <span className="flex items-center gap-1"><Clock size={10} /> Dernière visite : {formatDate(p.derniere_visite)}</span>}
                      {p.derniere_vente && <span className="flex items-center gap-1"><TrendingUp size={10} /> Vente : {formatDate(p.derniere_vente)}</span>}
                      {p.date_livraison && <span className="flex items-center gap-1"><Truck size={10} /> Livraison : {formatDate(p.date_livraison)}</span>}
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      {p.telephone && (
                        <a href={`tel:${p.telephone}`} className="flex items-center gap-1 text-[10px] text-primary-600"><Phone size={11} /> {p.telephone}</a>
                      )}
                      {typeof p.latitude === "number" && typeof p.longitude === "number" && !isNaN(p.latitude) && !isNaN(p.longitude) && (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] text-primary-600"><Navigation size={11} /> Itinéraire</a>
                      )}
                    </div>

                    {canRecordPhoneOrder && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <button onClick={() => openPhoneOrder(p)} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors">
                          <PhoneCall size={15} /> Enregistrer une commande par appel
                        </button>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {isVisited ? "Commande téléphonique après visite : aucune nouvelle visite ne sera créée." : "Commande téléphonique sans déplacement : le point restera non visité."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {phonePoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="phone-order-title">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600">Commande hors tournée</p>
                <h2 id="phone-order-title" className="text-lg font-bold text-gray-900">Commande par téléphone</h2>
              </div>
              <button onClick={closePhoneOrder} disabled={phoneBusy} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label="Fermer"><X size={20} /></button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{phonePoint.name}</p>
                    <p className="text-xs text-gray-500">{phonePoint.code} · {formatPointVenteAddress(phonePoint.address, phonePoint.city)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${phonePoint.statut === "visite" ? "bg-success-50 text-success-700" : "bg-gray-200 text-gray-600"}`}>
                    {phonePoint.statut === "visite" ? "Déjà visité" : "Non visité"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-primary-700"><PhoneCall size={14} /> Appel téléphonique</div>
                <p className="mt-1 text-[10px] text-gray-500">Enregistre uniquement le résultat de l'appel. Aucune présence QR/GPS ni visite physique ne sera créée ou modifiée.</p>
              </div>

              {!phoneSuccess ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Résultat de l'appel</h3>
                  <button
                    type="button"
                    aria-pressed={phoneSaleStatus === "vente_realisee"}
                    onClick={() => { setPhoneSaleStatus("vente_realisee"); setPhoneError(null); }}
                    disabled={phoneBusy}
                    className={`w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all ${phoneSaleStatus === "vente_realisee" ? "border-success-500 bg-success-50 ring-2 ring-success-200" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                  >
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${phoneSaleStatus === "vente_realisee" ? "border-success-600" : "border-gray-300"}`}>
                      {phoneSaleStatus === "vente_realisee" && <span className="w-2.5 h-2.5 rounded-full bg-success-600" />}
                    </span>
                    <TrendingUp size={19} className="text-success-600" />
                    <span className="font-semibold text-gray-900">Vente réalisée : OUI</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={phoneSaleStatus === "vente_non_realisee"}
                    onClick={() => { setPhoneSaleStatus("vente_non_realisee"); setPhoneError(null); }}
                    disabled={phoneBusy}
                    className={`w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all ${phoneSaleStatus === "vente_non_realisee" ? "border-error-500 bg-error-50 ring-2 ring-error-200" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                  >
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${phoneSaleStatus === "vente_non_realisee" ? "border-error-600" : "border-gray-300"}`}>
                      {phoneSaleStatus === "vente_non_realisee" && <span className="w-2.5 h-2.5 rounded-full bg-error-600" />}
                    </span>
                    <TrendingDown size={19} className="text-error-600" />
                    <span className="font-semibold text-gray-900">Vente réalisée : NON</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-success-50 p-4 text-sm text-success-800">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> Résultat de l'appel enregistré.</div>
                  <p className="mt-1 text-xs">{phoneSaleStatus === "vente_realisee" ? "Vente déclarée réalisée." : "Vente déclarée non réalisée."} Aucune visite physique n'a été ajoutée ou modifiée.</p>
                </div>
              )}

              {phoneError && <p className="rounded-lg bg-error-50 p-3 text-sm text-error-700" role="alert">{phoneError}</p>}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white px-5 py-4">
              {phoneSuccess ? (
                <button onClick={closePhoneOrder} className="btn-primary w-full"><CheckCircle2 size={16} /> Terminer</button>
              ) : (
                <>
                  <button onClick={closePhoneOrder} disabled={phoneBusy} className="btn-secondary flex-1">Annuler</button>
                  <button onClick={submitPhoneOrder} disabled={phoneBusy || !phoneSaleStatus} className="btn-primary flex-1">
                    {phoneBusy ? <><Loader2 size={16} className="animate-spin" /> Soumission...</> : "Soumettre"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
