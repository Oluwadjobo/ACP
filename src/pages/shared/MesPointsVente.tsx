import { useEffect, useState, useMemo, useRef } from "react";
import { Store, Search, Navigation, Phone, CheckCircle2, Clock, TrendingUp, Truck, Package, PhoneCall, Plus, Trash2, X, Loader2, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MesPointVente as MesPointVenteType, Produit } from "@/types";
import { formatDate, formatPointVenteAddress } from "@/lib/format";

type OrderLine = { produit_id: string; quantite: number };

export function MesPointsVente() {
  const { userType, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [points, setPoints] = useState<MesPointVenteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const [orderPoint, setOrderPoint] = useState<MesPointVenteType | null>(null);
  const [products, setProducts] = useState<Produit[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([{ produit_id: "", quantite: 1 }]);
  const [orderObservation, setOrderObservation] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ bl_numero?: string } | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    api.mesPointsVente().then(setPoints).finally(() => setLoading(false));
  }, []);

  const homePath = userType === "superviseur" ? "/superviseur" : userType === "agent_livreur" ? "/agent-livreur" : "/commercial";
  const canRecordPhoneOrder = userType === "commercial" && hasPermission("record_vente");

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

  async function openPhoneOrder(point: MesPointVenteType) {
    setOrderPoint(point);
    setOrderLines([{ produit_id: "", quantite: 1 }]);
    setOrderObservation("");
    setOrderError(null);
    setOrderSuccess(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    if (products.length === 0) {
      setProductsLoading(true);
      try {
        setProducts(await api.listProduits());
      } catch (error) {
        setOrderError(error instanceof Error ? error.message : "Impossible de charger le catalogue produits.");
      } finally {
        setProductsLoading(false);
      }
    }
  }

  function closePhoneOrder() {
    if (orderBusy) return;
    setOrderPoint(null);
    setOrderError(null);
    setOrderSuccess(null);
    idempotencyKeyRef.current = null;
  }

  function updateOrderLine(index: number, patch: Partial<OrderLine>) {
    setOrderLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  async function submitPhoneOrder() {
    if (!orderPoint || submitLockRef.current || orderSuccess) return;
    const validLines = orderLines.filter((line) => line.produit_id && Number.isInteger(line.quantite) && line.quantite > 0);
    if (validLines.length === 0) {
      setOrderError("Sélectionne au moins un produit et une quantité valide.");
      return;
    }
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    submitLockRef.current = true;
    setOrderBusy(true);
    setOrderError(null);
    try {
      const result = await api.createVente({
        point_vente_id: orderPoint.id,
        canal_commande: "appel",
        idempotency_key: idempotencyKeyRef.current,
        lignes: validLines.map((line) => {
          const produit = products.find((item) => item.id === line.produit_id);
          return { produit_id: line.produit_id, produit_nom: produit?.nom || "", quantite: line.quantite };
        }),
        observation: orderObservation.trim() || undefined,
      });
      setOrderSuccess({ bl_numero: result.bl_numero });
      try {
        const refreshed = await api.mesPointsVente();
        setPoints(refreshed);
      } catch {
        // The order is already saved; a failed list refresh must not report it as failed.
      }
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Impossible d'enregistrer cette commande.");
    } finally {
      submitLockRef.current = false;
      setOrderBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Store size={20} /><span className="font-bold text-sm">Mes points de vente</span></div>
        <button onClick={() => navigate(homePath)} className="btn-ghost text-white hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm">Retour</button>
      </header>

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

      {orderPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="phone-order-title">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600">Commande hors tournée</p>
                <h2 id="phone-order-title" className="text-lg font-bold text-gray-900">Commande par téléphone</h2>
              </div>
              <button onClick={closePhoneOrder} disabled={orderBusy} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label="Fermer"><X size={20} /></button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{orderPoint.name}</p>
                    <p className="text-xs text-gray-500">{orderPoint.code} · {formatPointVenteAddress(orderPoint.address, orderPoint.city)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${orderPoint.statut === "visite" ? "bg-success-50 text-success-700" : "bg-gray-200 text-gray-600"}`}>
                    {orderPoint.statut === "visite" ? "Déjà visité" : "Non visité"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-primary-700"><PhoneCall size={14} /> Canal d'enregistrement : appel téléphonique</div>
                <p className="mt-1 text-[10px] text-gray-500">Cette opération enregistre une vente et un bon de livraison, sans créer ni valider une présence QR/GPS.</p>
              </div>

              {productsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"><Loader2 size={18} className="animate-spin" /> Chargement du catalogue...</div>
              ) : products.length === 0 ? (
                <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-700">Aucun produit disponible dans le catalogue de ton équipe.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">Produits commandés</h3><button onClick={() => setOrderLines((current) => [...current, { produit_id: "", quantite: 1 }])} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700"><Plus size={14} /> Ajouter</button></div>
                  {orderLines.map((line, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_84px_34px] items-end gap-2">
                      <label className="min-w-0 text-xs font-medium text-gray-600">Produit
                        <select className="input mt-1 w-full text-sm" value={line.produit_id} onChange={(event) => updateOrderLine(index, { produit_id: event.target.value })}>
                          <option value="">Choisir un produit</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.nom}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-gray-600">Quantité
                        <input className="input mt-1 w-full text-sm" type="number" min="1" step="1" value={line.quantite} onChange={(event) => updateOrderLine(index, { quantite: Math.max(1, Number(event.target.value) || 1) })} />
                      </label>
                      <button onClick={() => setOrderLines((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))} disabled={orderLines.length === 1} className="mb-1 rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 disabled:opacity-30" aria-label="Supprimer la ligne"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              <label className="block text-xs font-medium text-gray-600">Observation (facultatif)
                <textarea className="input mt-1 min-h-20 w-full resize-y text-sm" value={orderObservation} onChange={(event) => setOrderObservation(event.target.value)} placeholder="Précision sur l'appel ou la commande..." />
              </label>

              {orderError && <p className="rounded-lg bg-error-50 p-3 text-sm text-error-700" role="alert">{orderError}</p>}
              {orderSuccess && (
                <div className="rounded-xl bg-success-50 p-4 text-sm text-success-800">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> Commande enregistrée avec succès.</div>
                  {orderSuccess.bl_numero && <p className="mt-1">Bon de livraison : <strong>{orderSuccess.bl_numero}</strong></p>}
                  <p className="mt-1 text-xs">Aucune visite physique n'a été ajoutée ou modifiée.</p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white px-5 py-4">
              {orderSuccess ? (
                <button onClick={closePhoneOrder} className="btn-primary w-full"><CheckCircle2 size={16} /> Terminer</button>
              ) : (
                <>
                  <button onClick={closePhoneOrder} disabled={orderBusy} className="btn-secondary flex-1">Annuler</button>
                  <button onClick={submitPhoneOrder} disabled={orderBusy || productsLoading || products.length === 0} className="btn-primary flex-1">
                    {orderBusy ? <><Loader2 size={16} className="animate-spin" /> Enregistrement...</> : <><ShoppingCart size={16} /> Valider la commande</>}
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
