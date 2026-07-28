import { useRef, useState, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { ScanLine, MapPin, CheckCircle2, XCircle, AlertTriangle, Clock, History, Camera, CameraOff, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { VisitResult } from "@/types";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

type ScanState = "idle" | "scanning" | "resolving" | "result";

export function CommercialScanner() {
  const { fullName } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false);

  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisitResult | null>(null);
  const [pointName, setPointName] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    scannedRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setState("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        scanFrame();
      }
    } catch (err) {
      setState("idle");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Accès à la caméra refusé. Autorisez l'accès dans les paramètres de votre navigateur.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("Aucune caméra trouvée sur cet appareil.");
      } else {
        setError("Impossible d'accéder à la caméra. Assurez-vous d'utiliser HTTPS.");
      }
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
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data && !scannedRef.current) {
        scannedRef.current = true;
        handleQrData(code.data);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, []);

  const handleQrData = async (data: string) => {
    stopCamera();
    setState("resolving");
    setError(null);
    try {
      let qrToken: string;
      try {
        const parsed = JSON.parse(data);
        qrToken = parsed.t;
      } catch {
        qrToken = data;
      }
      if (!qrToken) throw new Error("QR Code invalide");

      const point = await api.resolveQr(qrToken);
      setPointName(point.name);

      setGpsStatus("Récupération de votre position GPS...");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      setGpsStatus("Validation de la position...");

      const visitResult = await api.recordVisit({
        point_vente_id: point.id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      setResult(visitResult);
      setGpsStatus(null);
      setState("result");
    } catch (err) {
      if (err instanceof GeolocationPositionError || (err instanceof DOMException && err.name === "NotAllowedError")) {
        setError("Accès à la position refusé. Autorisez le GPS pour valider votre présence.");
      } else if (err instanceof DOMException && err.name === "Timeout") {
        setError("Délai d'attente GPS dépassé. Réessayez à l'extérieur ou vérifiez votre signal.");
      } else {
        setError(err instanceof Error ? err.message : "Erreur lors de la validation");
      }
      setState("idle");
    }
  };

  const reset = () => {
    setResult(null);
    setPointName(null);
    setError(null);
    setGpsStatus(null);
    setState("idle");
    scannedRef.current = false;
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine size={20} />
          <span className="font-bold text-sm">Contrôle Présence</span>
        </div>
        <button onClick={() => navigate("/commercial/historique")} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg">
          <History size={20} />
        </button>
      </header>

      {/* User bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700">
          {fullName?.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{fullName}</p>
          <p className="text-xs text-gray-500">Commercial</p>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {state === "idle" && !error && (
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-24 h-24 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
              <ScanLine size={44} className="text-primary-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Scanner un QR Code</h1>
            <p className="text-gray-500 text-sm mb-8">
              Appuyez sur le bouton ci-dessous pour ouvrir la caméra et scanner le QR code affiché dans le point de vente.
            </p>
            <button onClick={startCamera} className="btn-primary w-full text-base py-4">
              <Camera size={22} />
              Ouvrir la caméra
            </button>
          </div>
        )}

        {state === "idle" && error && (
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-error-50 flex items-center justify-center mx-auto mb-5">
              <CameraOff size={36} className="text-error-500" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Erreur</h1>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button onClick={startCamera} className="btn-primary w-full">
              <RefreshCw size={18} />
              Réessayer
            </button>
          </div>
        )}

        {(state === "scanning" || state === "resolving") && (
          <div className="w-full max-w-sm animate-fade-in">
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-primary-950 shadow-lg">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/70 rounded-2xl relative">
                  <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(10,21,71,0.5)]" />
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-xl" />
                  {/* Scan line */}
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
              <>
                <p className="text-center text-gray-500 text-sm mt-4">
                  Visez le QR code du point de vente...
                </p>
                <button onClick={() => { stopCamera(); setState("idle"); }} className="btn-secondary w-full mt-4">
                  Annuler
                </button>
              </>
            )}
          </div>
        )}

        {state === "result" && result && (
          <div className="w-full max-w-sm animate-scale-in">
            {result.status === "confirmed" && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={52} className="text-accent-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Présence validée</h1>
                <p className="text-gray-500 text-sm mb-2">Votre visite a été enregistrée avec succès.</p>
                {pointName && <p className="text-primary-700 font-semibold text-sm mb-4">{pointName}</p>}
                <div className="card p-4 mb-6 text-left">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <MapPin size={14} />
                      Distance
                    </span>
                    <span className="font-bold text-gray-900">{result.distance} m</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <Clock size={14} />
                      Heure
                    </span>
                    <span className="font-bold text-gray-900">
                      {new Date(result.visit?.visited_at || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                <button onClick={reset} className="btn-primary w-full">
                  <ScanLine size={18} />
                  Scanner un autre point
                </button>
              </div>
            )}

            {result.status === "out_of_zone" && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-error-50 flex items-center justify-center mx-auto mb-5">
                  <XCircle size={52} className="text-error-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Hors zone</h1>
                <p className="text-gray-500 text-sm mb-4">
                  Vous êtes trop éloigné du point de vente. Rapprochez-vous et recommencez le scan.
                </p>
                {pointName && <p className="text-primary-700 font-semibold text-sm mb-2">{pointName}</p>}
                <div className="card p-4 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <MapPin size={14} />
                      Distance actuelle
                    </span>
                    <span className="font-bold text-error-600">{result.distance} m</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">La distance maximale autorisée est de 50 mètres.</p>
                </div>
                <button onClick={reset} className="btn-primary w-full">
                  <ScanLine size={18} />
                  Recommencer
                </button>
              </div>
            )}

            {result.status === "duplicate" && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-warning-50 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={52} className="text-warning-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan déjà effectué</h1>
                <p className="text-gray-500 text-sm mb-6">{result.message}</p>
                <button onClick={reset} className="btn-primary w-full">
                  <ScanLine size={18} />
                  Scanner un autre point
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Logout */}
      <footer className="px-4 py-3 border-t border-gray-100 bg-white">
        <button
          onClick={() => { stopCamera(); localStorage.removeItem("session_token"); window.location.href = "/"; }}
          className="btn-ghost w-full text-gray-500 text-sm"
        >
          Se déconnecter
        </button>
      </footer>
    </div>
  );
}
