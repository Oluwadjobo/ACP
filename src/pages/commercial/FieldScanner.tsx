import { useRef, useState, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { ScanLine, MapPin, CheckCircle2, XCircle, AlertTriangle, Clock, History, Camera, CameraOff, RefreshCw, TrendingUp, TrendingDown, Package, ChevronRight, Loader2, Plus, Trash2, Truck, FileText, ClipboardCheck, Store, X } from "lucide-react";
import { api } from "@/lib/api";
import type { VisitResult, Produit, VenteStatus, Secteur } from "@/types";
import { VENTE_MOTIFS, VENTE_NON_REALISEE_MOTIFS } from "@/types";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { getAccuratePosition } from "@/lib/gps";

type ScanState = "idle" | "scanning" | "resolving" | "result" | "action";
type PostAction = "vente_realisee" | "vente_non_realisee" | "vente_livraison" | "promesse_achat" | null;

type VenteLigneForm = { produit_nom: string; quantite: number; prix_unitaire: number; observation: string };

export function FieldScanner() {
  const { fullName, userType } = useAuth();
  const navigate = useNavigate();
  const isSuperviseur = userType === "superviseur";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false);

  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisitResult | null>(null);
  const [pointName, setPointName] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [postAction, setPostAction] = useState<PostAction>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Promesse form state
  const [selectedProduits, setSelectedProduits] = useState<string[]>([]);
  const [quantite, setQuantite] = useState(1);
  const [datePrev, setDatePrev] = useState("");
  const [montant, setMontant] = useState("");
  const [responsable, setResponsable] = useState("");
  const [observations, setObservations] = useState("");
  const [motif, setMotif] = useState("");
  const [motifAutre, setMotifAutre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Multi-product vente
  const [venteLignes, setVenteLignes] = useState<VenteLigneForm[]>([{ produit_nom: "", quantite: 1, prix_unitaire: 0, observation: "" }]);
  const [venteObservation, setVenteObservation] = useState("");
  const [blNumero, setBlNumero] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    scannedRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setState("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        scanFrame();
      }
    } catch (err) {
      setState("idle");
      if (err instanceof DOMException && err.name === "NotAllowedError") setError("Accès à la caméra refusé. Autorisez l'accès dans les paramètres de votre navigateur.");
      else if (err instanceof DOMException && err.name === "NotFoundError") setError("Aucune caméra trouvée sur cet appareil.");
      else setError("Impossible d'accéder à la caméra. Assurez-vous d'utiliser HTTPS.");
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code && code.data && !scannedRef.current) { scannedRef.current = true; handleQrData(code.data); return; }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, []);

  const handleQrData = async (data: string) => {
    stopCamera();
    setState("resolving");
    setError(null);
    try {
      let qrToken: string;
      try { const parsed = JSON.parse(data); qrToken = parsed.t; } catch { qrToken = data; }
      if (!qrToken) throw new Error("QR Code invalide");

      const point = await api.resolveQr(qrToken);
      setPointName(point.name);
      setPointId(point.id);

      setGpsStatus("Récupération de votre position GPS (haute précision)...");
      const position = await getAccuratePosition(20000, 15);

      setGpsStatus(`Position obtenue (précision ±${Math.round(position.accuracy)} m)...`);
      const visitResult = await api.recordVisit({ point_vente_id: point.id, latitude: position.latitude, longitude: position.longitude });

      setResult(visitResult);
      setGpsStatus(null);
      if (visitResult.status === "confirmed") {
        setState("action");
        try { const prods = await api.listProduits(); setProduits(prods); } catch { /* ignore */ }
      } else {
        setState("result");
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError || (err instanceof DOMException && err.name === "NotAllowedError")) setError("Accès à la position refusé. Autorisez le GPS pour valider votre présence.");
      else if (err instanceof DOMException && err.name === "Timeout") setError("Délai d'attente GPS dépassé. Réessayez à l'extérieur ou vérifiez votre signal.");
      else setError(err instanceof Error ? err.message : "Erreur lors de la validation");
      setState("idle");
    }
  };

  const reset = () => {
    setResult(null); setPointName(null); setPointId(null); setError(null); setGpsStatus(null);
    setState("idle"); scannedRef.current = false;
    setPostAction(null); setSelectedProduits([]); setQuantite(1); setDatePrev(""); setMontant(""); setResponsable(""); setObservations(""); setMotif(""); setMotifAutre("");
    setVenteLignes([{ produit_nom: "", quantite: 1, prix_unitaire: 0, observation: "" }]); setVenteObservation(""); setBlNumero(null);
    setRetrying(false);
  };

  const retryGps = async () => {
    if (!pointId) return;
    setRetrying(true);
    setError(null);
    setGpsStatus("Nouvelle tentative GPS (haute précision)...");
    try {
      const position = await getAccuratePosition(20000, 15);
      setGpsStatus(`Position obtenue (précision ±${Math.round(position.accuracy)} m)...`);
      const visitResult = await api.recordVisit({ point_vente_id: pointId, latitude: position.latitude, longitude: position.longitude });
      setResult(visitResult);
      setGpsStatus(null);
      if (visitResult.status === "confirmed") {
        setState("action");
        try { const prods = await api.listProduits(); setProduits(prods); } catch { /* ignore */ }
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError || (err instanceof DOMException && err.name === "NotAllowedError")) setError("Accès à la position refusé. Autorisez le GPS pour valider votre présence.");
      else setError(err instanceof Error ? err.message : "Erreur lors de la validation");
    } finally {
      setRetrying(false);
      setGpsStatus(null);
    }
  };

  useEffect(() => { return () => stopCamera(); }, [stopCamera]);

  const handlePostAction = async () => {
    if (!postAction || !result?.visit?.id || !pointId) return;
    setSubmitting(true);
    try {
      if (postAction === "promesse_achat") {
        if (selectedProduits.length === 0) { setSubmitting(false); return; }
        await api.createPromesse({
          visite_id: result.visit.id,
          point_vente_id: pointId,
          produits: selectedProduits,
          quantite,
          date_previsionnelle: datePrev || undefined,
          montant_estime: montant ? Number(montant) : undefined,
          responsable: responsable || undefined,
          observations: observations || undefined,
        });
      } else if (postAction === "vente_non_realisee") {
        const finalMotif = motif === "Autre" ? motifAutre : motif;
        if (!finalMotif) { setSubmitting(false); return; }
        await api.finalizeVisit({ visite_id: result.visit.id, vente_status: postAction, motif: finalMotif });
      } else if (postAction === "vente_realisee" || postAction === "vente_livraison") {
        // Validate lignes
        const validLignes = venteLignes.filter((l) => l.produit_nom.trim() && l.quantite > 0);
        if (validLignes.length === 0) { setSubmitting(false); return; }
        const res = await api.createVente({
          visite_id: result.visit.id,
          point_vente_id: pointId,
          lignes: validLignes.map((l) => ({ produit_nom: l.produit_nom.trim(), quantite: l.quantite, prix_unitaire: l.prix_unitaire, observation: l.observation || undefined })),
          livraison_immédiate: postAction === "vente_livraison",
          observation: venteObservation || undefined,
        });
        if (res.bl_numero) setBlNumero(res.bl_numero);
      }
      setState("result");
      setResult({ ...result, status: "confirmed", visit: { ...result.visit!, vente_status: postAction } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  const homePath = isSuperviseur ? "/superviseur" : "/commercial";
  const historyPath = isSuperviseur ? "/superviseur/historique" : "/commercial/historique";
  const ventesNonRealiseesPath = "/superviseur/ventes-non-realisees";
  const controleTerrainPath = "/superviseur/controle-terrain";
  const roleLabel = isSuperviseur ? "Team Leader" : "Commercial";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><ScanLine size={20} /><span className="font-bold text-sm">Contrôle Présence</span></div>
        <div className="flex items-center gap-1">
          {isSuperviseur && (
            <>
              <button onClick={() => navigate(ventesNonRealiseesPath)} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg" title="Ventes non réalisées"><TrendingDown size={20} /></button>
              <button onClick={() => navigate(controleTerrainPath)} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg" title="Contrôle terrain"><ClipboardCheck size={20} /></button>
            </>
          )}
          <button onClick={() => navigate(historyPath)} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg"><History size={20} /></button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700">{fullName?.charAt(0).toUpperCase()}</div>
        <div><p className="text-sm font-semibold text-gray-900">{fullName}</p><p className="text-xs text-gray-500">{roleLabel}</p></div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {state === "idle" && !error && (
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-24 h-24 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6"><ScanLine size={44} className="text-primary-600" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Scanner un QR Code</h1>
            <p className="text-gray-500 text-sm mb-8">Appuyez sur le bouton ci-dessous pour ouvrir la caméra et scanner le QR code affiché dans le point de vente.</p>
            <button onClick={startCamera} className="btn-primary w-full text-base py-4"><Camera size={22} /> Ouvrir la caméra</button>
            <button onClick={() => setShowCreateModal(true)} className="btn-secondary w-full mt-3"><Store size={18} /> Créer un point de vente</button>
          </div>
        )}

        {state === "idle" && error && (
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-error-50 flex items-center justify-center mx-auto mb-5"><CameraOff size={36} className="text-error-500" /></div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Erreur</h1>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button onClick={startCamera} className="btn-primary w-full"><RefreshCw size={18} /> Réessayer</button>
          </div>
        )}

        {(state === "scanning" || state === "resolving") && (
          <div className="w-full max-w-sm animate-fade-in">
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-primary-950 shadow-lg">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/70 rounded-2xl relative">
                  <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(10,21,71,0.5)]" />
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-xl" />
                  <div className="absolute left-2 right-2 h-0.5 bg-primary-400 animate-scan-line shadow-[0_0_8px_rgba(83,141,255,0.8)]" />
                </div>
              </div>
              {state === "resolving" && (
                <div className="absolute inset-0 bg-primary-950/80 flex flex-col items-center justify-center text-white">
                  <div className="w-10 h-10 border-3 border-primary-300 border-t-white rounded-full animate-spin mb-4" />
                  {gpsStatus && <p className="text-sm font-medium">{gpsStatus}</p>}
                </div>
              )}
            </div>
            {state === "scanning" && (
              <><p className="text-center text-gray-500 text-sm mt-4">Visez le QR code du point de vente...</p>
              <button onClick={() => { stopCamera(); setState("idle"); }} className="btn-secondary w-full mt-4">Annuler</button></>
            )}
          </div>
        )}

        {/* Post-validation action selection */}
        {state === "action" && result && (
          <div className="w-full max-w-sm animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={44} className="text-accent-600" /></div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Présence validée</h1>
              {pointName && <p className="text-primary-700 font-semibold text-sm">{pointName}</p>}
              <p className="text-gray-500 text-sm mt-2">Sélectionnez une action :</p>
            </div>

            {!postAction && (
              <div className="space-y-3">
                {isSuperviseur && (
                  <button onClick={() => setPostAction("promesse_achat")} className="w-full card p-4 flex items-center gap-3 hover:ring-2 hover:ring-warning-200 transition-all text-left">
                    <div className="w-12 h-12 rounded-xl bg-warning-50 flex items-center justify-center"><Package size={24} className="text-warning-600" /></div>
                    <div className="flex-1"><p className="font-semibold text-gray-900 text-sm">Promesse d'achat</p><p className="text-xs text-gray-500">Enregistrer une intention d'achat</p></div>
                    <ChevronRight size={20} className="text-gray-400" />
                  </button>
                )}
                <button onClick={() => setPostAction("vente_realisee")} className="w-full card p-4 flex items-center gap-3 hover:ring-2 hover:ring-success-200 transition-all text-left">
                  <div className="w-12 h-12 rounded-xl bg-success-50 flex items-center justify-center"><TrendingUp size={24} className="text-success-600" /></div>
                  <div className="flex-1"><p className="font-semibold text-gray-900 text-sm">Vente réalisée</p><p className="text-xs text-gray-500">La vente a été conclue</p></div>
                  <ChevronRight size={20} className="text-gray-400" />
                </button>
                <button onClick={() => setPostAction("vente_non_realisee")} className="w-full card p-4 flex items-center gap-3 hover:ring-2 hover:ring-error-200 transition-all text-left">
                  <div className="w-12 h-12 rounded-xl bg-error-50 flex items-center justify-center"><TrendingDown size={24} className="text-error-500" /></div>
                  <div className="flex-1"><p className="font-semibold text-gray-900 text-sm">Vente non réalisée</p><p className="text-xs text-gray-500">La vente n'a pas abouti</p></div>
                  <ChevronRight size={20} className="text-gray-400" />
                </button>
              </div>
            )}

            {/* Promesse d'achat form */}
            {postAction === "promesse_achat" && (
              <div className="card p-5 space-y-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Package size={20} className="text-warning-600" /> Promesse d'achat</h2>
                <div>
                  <label className="label">Produits concernés</label>
                  <div className="space-y-2 mt-1">
                    {produits.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selectedProduits.includes(p.nom)} onChange={(e) => {
                          if (e.target.checked) setSelectedProduits([...selectedProduits, p.nom]);
                          else setSelectedProduits(selectedProduits.filter((x) => x !== p.nom));
                        }} className="w-4 h-4 rounded text-primary-600" />
                        <span className="text-sm text-gray-700">{p.nom}</span>
                      </label>
                    ))}
                    {produits.length === 0 && <p className="text-xs text-gray-400">Aucun produit configuré</p>}
                  </div>
                </div>
                <div>
                  <label className="label">Quantité envisagée</label>
                  <input type="number" min={1} className="input" value={quantite} onChange={(e) => setQuantite(Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Date prévisionnelle d'achat (facultatif)</label>
                  <input type="date" className="input" value={datePrev} onChange={(e) => setDatePrev(e.target.value)} />
                </div>
                <div>
                  <label className="label">Montant estimatif (facultatif)</label>
                  <input type="number" step="0.01" className="input" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="€" />
                </div>
                <div>
                  <label className="label">Responsable du point de vente (facultatif)</label>
                  <input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
                </div>
                <div>
                  <label className="label">Observations / Commentaires</label>
                  <textarea className="input min-h-[80px]" value={observations} onChange={(e) => setObservations(e.target.value)} />
                </div>
                {error && <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-2 text-sm text-error-700">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => { setPostAction(null); setError(null); }} className="btn-secondary flex-1">Retour</button>
                  <button onClick={handlePostAction} disabled={submitting || selectedProduits.length === 0} className="btn-primary flex-1">{submitting ? "Enregistrement..." : "Valider"}</button>
                </div>
              </div>
            )}

            {/* Vente réalisée - multi-product form */}
            {(postAction === "vente_realisee" || postAction === "vente_livraison") && (
              <div className="card p-5 space-y-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  {postAction === "vente_livraison" ? <Truck size={20} className="text-blue-600" /> : <TrendingUp size={20} className="text-success-600" />}
                  {postAction === "vente_livraison" ? "Vente et livraison" : "Vente réalisée"}
                </h2>
                <div className="space-y-3">
                  {venteLignes.map((ligne, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">Produit {idx + 1}</span>
                        {venteLignes.length > 1 && (
                          <button onClick={() => setVenteLignes(venteLignes.filter((_, i) => i !== idx))} className="text-error-500 hover:bg-error-50 p-1 rounded">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="label text-xs">Nom du produit</label>
                        <input list="produits-list" className="input" value={ligne.produit_nom} onChange={(e) => { const next = [...venteLignes]; next[idx] = { ...ligne, produit_nom: e.target.value }; setVenteLignes(next); }} placeholder="Nom du produit" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-xs">Quantité</label>
                          <input type="number" min={1} className="input" value={ligne.quantite} onChange={(e) => { const next = [...venteLignes]; next[idx] = { ...ligne, quantite: Number(e.target.value) }; setVenteLignes(next); }} />
                        </div>
                        <div>
                          <label className="label text-xs">Prix unitaire (facultatif)</label>
                          <input type="number" step="0.01" className="input" value={ligne.prix_unitaire} onChange={(e) => { const next = [...venteLignes]; next[idx] = { ...ligne, prix_unitaire: Number(e.target.value) }; setVenteLignes(next); }} />
                        </div>
                      </div>
                      <div>
                        <label className="label text-xs">Observation (facultatif)</label>
                        <input className="input" value={ligne.observation} onChange={(e) => { const next = [...venteLignes]; next[idx] = { ...ligne, observation: e.target.value }; setVenteLignes(next); }} />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setVenteLignes([...venteLignes, { produit_nom: "", quantite: 1, prix_unitaire: 0, observation: "" }])} className="btn-secondary w-full text-sm flex items-center justify-center gap-1.5">
                  <Plus size={16} /> Ajouter un produit
                </button>
                <div>
                  <label className="label">Observation générale (facultatif)</label>
                  <textarea className="input min-h-[60px]" value={venteObservation} onChange={(e) => setVenteObservation(e.target.value)} />
                </div>
                <datalist id="produits-list">
                  {produits.map((p) => <option key={p.id} value={p.nom} />)}
                </datalist>
                {error && <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-2 text-sm text-error-700">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => { setPostAction(null); setError(null); }} className="btn-secondary flex-1">Retour</button>
                  <button onClick={handlePostAction} disabled={submitting || venteLignes.every((l) => !l.produit_nom.trim())} className="btn-primary flex-1">{submitting ? "Enregistrement..." : "Valider"}</button>
                </div>
              </div>
            )}

            {/* Vente non réalisée - motif */}
            {postAction === "vente_non_realisee" && (
              <div className="card p-5 space-y-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><TrendingDown size={20} className="text-error-500" /> Vente non réalisée</h2>
                <div>
                  <label className="label">Motif (obligatoire)</label>
                  <div className="space-y-2 mt-1">
                    {VENTE_NON_REALISEE_MOTIFS.map((m) => (
                      <label key={m} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="motif" checked={motif === m} onChange={() => setMotif(m)} className="w-4 h-4 text-primary-600" />
                        <span className="text-sm text-gray-700">{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {motif === "Autre" && (
                  <div>
                    <label className="label">Précisez le motif</label>
                    <input className="input" value={motifAutre} onChange={(e) => setMotifAutre(e.target.value)} required placeholder="Motif..." />
                  </div>
                )}
                {error && <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-2 text-sm text-error-700">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => { setPostAction(null); setError(null); setMotif(""); setMotifAutre(""); }} className="btn-secondary flex-1">Retour</button>
                  <button onClick={handlePostAction} disabled={submitting || !motif || (motif === "Autre" && !motifAutre.trim())} className="btn-primary flex-1">{submitting ? "..." : "Valider"}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Final result */}
        {state === "result" && result && (
          <div className="w-full max-w-sm animate-scale-in">
            {result.status === "confirmed" && (
              <div className="text-center">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5 ${
                  result.visit?.vente_status === "vente_realisee" ? "bg-success-50" :
                  result.visit?.vente_status === "vente_non_realisee" ? "bg-error-50" :
                  result.visit?.vente_status === "promesse_achat" ? "bg-warning-50" : "bg-accent-50"
                }`}>
                  {result.visit?.vente_status === "vente_realisee" ? <TrendingUp size={52} className="text-success-600" /> :
                   result.visit?.vente_status === "vente_livraison" ? <Truck size={52} className="text-blue-600" /> :
                   result.visit?.vente_status === "vente_non_realisee" ? <TrendingDown size={52} className="text-error-500" /> :
                   result.visit?.vente_status === "promesse_achat" ? <Package size={52} className="text-warning-600" /> :
                   <CheckCircle2 size={52} className="text-accent-600" />}
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {result.visit?.vente_status === "vente_realisee" ? "Vente réalisée" :
                   result.visit?.vente_status === "vente_livraison" ? "Vente et livraison" :
                   result.visit?.vente_status === "vente_non_realisee" ? "Vente non réalisée" :
                   result.visit?.vente_status === "promesse_achat" ? "Promesse enregistrée" : "Présence validée"}
                </h1>
                {blNumero && (
                  <div className="card p-3 mb-4 bg-blue-50 border-blue-200">
                    <p className="text-sm text-blue-700 flex items-center gap-2 justify-center"><FileText size={16} /> Bon de livraison généré : <strong>{blNumero}</strong></p>
                  </div>
                )}
                <p className="text-gray-500 text-sm mb-2">Votre visite a été enregistrée avec succès.</p>
                {pointName && <p className="text-primary-700 font-semibold text-sm mb-4">{pointName}</p>}
                <div className="card p-4 mb-6 text-left">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><MapPin size={14} /> Distance</span>
                    <span className="font-bold text-gray-900">{result.distance} m</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-500 flex items-center gap-1.5"><Clock size={14} /> Heure</span>
                    <span className="font-bold text-gray-900">{new Date(result.visit?.visited_at || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
                <button onClick={reset} className="btn-primary w-full"><ScanLine size={18} /> Scanner un autre point</button>
              </div>
            )}

            {result.status === "out_of_zone" && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-error-50 flex items-center justify-center mx-auto mb-5"><XCircle size={52} className="text-error-600" /></div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Hors zone</h1>
                <p className="text-gray-500 text-sm mb-4">{result.message}</p>
                {pointName && <p className="text-primary-700 font-semibold text-sm mb-2">{pointName}</p>}
                <div className="card p-4 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><MapPin size={14} /> Distance actuelle</span>
                    <span className="font-bold text-error-600">{result.distance} m</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">La distance maximale autorisée est de 30 mètres.</p>
                  {result.debug && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                      <p>Votre position : {result.debug.userLat.toFixed(6)}, {result.debug.userLon.toFixed(6)}</p>
                      <p>Point de vente : {result.debug.pointLat.toFixed(6)}, {result.debug.pointLon.toFixed(6)}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <button onClick={retryGps} disabled={retrying} className="btn-primary w-full">
                    {retrying ? <><Loader2 size={18} className="animate-spin" /> Nouvelle tentative GPS...</> : <><MapPin size={18} /> Réessayer avec le GPS</>}
                  </button>
                  <button onClick={reset} disabled={retrying} className="btn-secondary w-full"><ScanLine size={18} /> Scanner un autre point</button>
                </div>
              </div>
            )}

            {result.status === "duplicate" && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-warning-50 flex items-center justify-center mx-auto mb-5"><AlertTriangle size={52} className="text-warning-600" /></div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan déjà effectué</h1>
                <p className="text-gray-500 text-sm mb-6">{result.message}</p>
                <button onClick={reset} className="btn-primary w-full"><ScanLine size={18} /> Scanner un autre point</button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="px-4 py-3 border-t border-gray-100 bg-white">
        <button onClick={() => { stopCamera(); localStorage.removeItem("session_token"); window.location.href = "/"; }} className="btn-ghost w-full text-gray-500 text-sm">Se déconnecter</button>
      </footer>
      <CreatePointVenteModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); reset(); }} />
    </div>
  );
}

function CreatePointVenteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [secteurId, setSecteurId] = useState("");
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [gettingGps, setGettingGps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      api.listSecteurs().then(setSecteurs).catch(() => {});
      setName(""); setAddress(""); setCity(""); setLatitude(""); setLongitude(""); setSecteurId(""); setError("");
    }
  }, [open]);

  const useMyGps = async () => {
    setGettingGps(true);
    try {
      const pos = await getAccuratePosition(20000, 10);
      setLatitude(pos.latitude.toFixed(6));
      setLongitude(pos.longitude.toFixed(6));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'obtenir votre position GPS");
    } finally {
      setGettingGps(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) { setError("Latitude invalide"); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { setError("Longitude invalide"); return; }
    setSaving(true);
    try {
      await api.createPointVente({ name, address, city, latitude: lat, longitude: lng, secteur_id: secteurId || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Store size={20} className="text-primary-600" /> Nouveau point de vente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Nom du point de vente</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Supérette du Centre" />
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
            <label className="label">Tournée (facultatif)</label>
            <select className="input" value={secteurId} onChange={(e) => setSecteurId(e.target.value)}>
              <option value="">Aucune tournée</option>
              {secteurs.filter(s => s.actif).map((s) => (
                <option key={s.id} value={s.id}>{s.nom} ({s.code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Latitude</label>
              <input className="input" value={latitude} onChange={(e) => setLatitude(e.target.value)} required placeholder="48.8566" />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input className="input" value={longitude} onChange={(e) => setLongitude(e.target.value)} required placeholder="2.3522" />
            </div>
          </div>
          <button type="button" onClick={useMyGps} disabled={gettingGps} className="btn-secondary w-full text-xs py-2">
            <MapPin size={14} />
            {gettingGps ? "Localisation en cours..." : "Utiliser ma position GPS actuelle"}
          </button>
          {error && <div className="rounded-xl bg-error-50 border border-error-200 px-4 py-2 text-sm text-error-700">{error}</div>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Enregistrement..." : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
