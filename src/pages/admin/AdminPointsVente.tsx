import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { Plus, Search, Pencil, Trash2, QrCode, MapPin, Store, Download } from "lucide-react";
import { api } from "@/lib/api";
import type { PointVente, Secteur } from "@/types";
import { Modal } from "@/components/Modal";
import { getAccuratePosition } from "@/lib/gps";

export function AdminPointsVente() {
  const [points, setPoints] = useState<PointVente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PointVente | null>(null);
  const [qrModal, setQrModal] = useState<PointVente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PointVente | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listPointsVente().then(setPoints).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = points.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase())
  );

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
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary">
          <Plus size={18} />
          Ajouter
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" className="input pl-11" placeholder="Rechercher par nom, code ou ville..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {filtered.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm truncate">{p.name}</h3>
                    <p className="text-xs text-primary-600 font-medium mt-0.5">{p.code}</p>
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
                  <p className="text-gray-400">GPS: {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</p>
                  {p.secteur_nom && <span className="badge bg-primary-50 text-primary-600">{p.secteur_nom}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQrModal(p)} className="btn-secondary flex-1 text-xs py-2">
                    <QrCode size={14} />
                    QR Code
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
        )}
      </div>

      <PointVenteModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} showToast={showToast} />
      <QrModal point={qrModal} onClose={() => setQrModal(null)} />
      <DeleteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); load(); }} showToast={showToast} />
    </div>
  );
}

function PointVenteModal({
  open, editing, onClose, onSaved, showToast,
}: {
  open: boolean;
  editing: PointVente | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
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

  useEffect(() => {
    if (open) {
      api.listSecteurs().then(setSecteurs).catch(() => {});
      setName(editing?.name || "");
      setAddress(editing?.address || "");
      setCity(editing?.city || "");
      setLatitude(editing?.latitude?.toString() || "");
      setLongitude(editing?.longitude?.toString() || "");
      setSecteurId(editing?.secteur_id || "");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secteurId) { showToast("error", "Veuillez sélectionner une tournée"); return; }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) { showToast("error", "Latitude invalide"); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { showToast("error", "Longitude invalide"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.updatePointVente(editing.id, { name, address, city, latitude: lat, longitude: lng, secteur_id: secteurId || null });
        showToast("success", "Point de vente modifié");
      } else {
        await api.createPointVente({ name, address, city, latitude: lat, longitude: lng, secteur_id: secteurId || undefined });
        showToast("success", "Point de vente créé");
      }
      onSaved();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le point de vente" : "Nouveau point de vente"}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        Êtes-vous sûr de vouloir supprimer <strong>{target?.name}</strong> ?
        L'historique des visites associées sera également supprimé. Cette opération est irréversible.
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
            } catch {
              showToast("error", "Erreur lors de la suppression");
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
