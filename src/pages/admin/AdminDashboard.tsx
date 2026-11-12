import { useEffect, useState } from "react";
import { Users, CalendarCheck, Clock, MapPin, CheckCircle2, AlertTriangle, Store, Download, FileSpreadsheet, UserCog, Package, TrendingUp, TrendingDown, FileText, ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats, Visite, PromesseAchat } from "@/types";
import { formatDateTime, formatRelative, formatDate, formatTime } from "@/lib/format";

const BUSINESS_TIME_ZONE = "Africa/Porto-Novo";
const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function businessMidnightToUtc(dateValue: string): string | null {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return null;

  const targetUtcMidnight = date.getTime();
  let candidate = targetUtcMidnight;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = BUSINESS_DATE_FORMATTER.formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const localDateAsUtc = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    );
    const nextCandidate = targetUtcMidnight - (localDateAsUtc - candidate);
    if (nextCandidate === candidate) return new Date(candidate).toISOString();
    candidate = nextCandidate;
  }
  return new Date(candidate).toISOString();
}

function nextCalendarDate(dateValue: string): string | null {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visites, setVisites] = useState<Visite[]>([]);
  const [promesses, setPromesses] = useState<PromesseAchat[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.listVisites(1, 20), api.listPromesses(1, 10)])
      .then(([s, v, p]) => { setStats(s); setVisites(v.data); setPromesses(p.data); })
      .finally(() => setLoading(false));
  }, []);

  const getExportDateBounds = (): { startAt?: string; endBefore?: string } | null => {
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      setExportMessage("La date de début ne peut pas être postérieure à la date de fin.");
      return null;
    }

    const startAt = exportStartDate ? businessMidnightToUtc(exportStartDate) : null;
    const dayAfterEnd = exportEndDate ? nextCalendarDate(exportEndDate) : null;
    const endBefore = dayAfterEnd ? businessMidnightToUtc(dayAfterEnd) : null;
    if ((exportStartDate && !startAt) || (exportEndDate && !endBefore)) {
      setExportMessage("Veuillez vérifier les dates sélectionnées.");
      return null;
    }
    return {
      ...(startAt ? { startAt } : {}),
      ...(endBefore ? { endBefore } : {}),
    };
  };

  const fetchAllVisites = async (startAt?: string, endBefore?: string): Promise<Visite[]> => {
    const all: Visite[] = [];
    let page = 1;
    while (true) {
      const res = await api.listVisites(page, 200, { start_at: startAt, end_before: endBefore });
      all.push(...res.data);
      if (all.length >= res.count || res.data.length === 0 || res.data.length < 200) break;
      page++;
    }
    return all;
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel = (v: Visite): string => {
    if (v.status === "out_of_zone") return "Hors zone";
    switch (v.vente_status) {
      case "vente_realisee": return "Vente réalisée";
      case "vente_non_realisee": return "Vente non réalisée";
      case "promesse_achat": return "Promesse d'achat";
      default: return "Présence confirmée";
    }
  };

  const exportVisits = async (format: "csv" | "excel") => {
    const dateBounds = getExportDateBounds();
    if (!dateBounds) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const all = await fetchAllVisites(dateBounds.startAt, dateBounds.endBefore);
      if (all.length === 0) {
        setExportMessage("Aucune visite ne correspond à la période sélectionnée.");
        return;
      }
      const periodSuffix = exportStartDate || exportEndDate
        ? `_${exportStartDate || "debut"}_${exportEndDate || "fin"}`
        : "";
      const headers = ["Utilisateur", "Rôle", "Point de vente", "Ville", "Adresse", "Date", "Heure", "Latitude", "Longitude", "Distance (m)", "Statut", "Motif"];
      if (format === "csv") {
        const escapeCSV = (val: string | number) => { const s = String(val); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
        const rows = all.map((v) => [
          escapeCSV(v.commercial?.full_name || v.superviseur?.full_name || ""),
          escapeCSV(v.user_role === "superviseur" ? "Team Leader" : "Commercial"),
          escapeCSV(v.point_vente?.name || ""),
          escapeCSV(v.point_vente?.city || ""),
          escapeCSV(v.point_vente?.address || ""),
          escapeCSV(formatDate(v.visited_at)),
          escapeCSV(formatTime(v.visited_at)),
          v.latitude, v.longitude, Math.round(v.distance_meters),
          escapeCSV(statusLabel(v)),
          escapeCSV(v.motif || ""),
        ].join(","));
        downloadFile("\uFEFF" + headers.join(",") + "\n" + rows.join("\n"), `visites${periodSuffix}_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
      } else {
        const escapeXML = (val: string | number) => String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const cells = (row: string[]) => row.map((c) => `<Cell><Data ss:Type="String">${escapeXML(c)}</Data></Cell>`).join("");
        const dataRows = all.map((v) => cells([
          v.commercial?.full_name || v.superviseur?.full_name || "",
          v.user_role === "superviseur" ? "Team Leader" : "Commercial",
          v.point_vente?.name || "", v.point_vente?.city || "", v.point_vente?.address || "",
          formatDate(v.visited_at), formatTime(v.visited_at),
          String(v.latitude), String(v.longitude), String(Math.round(v.distance_meters)),
          statusLabel(v), v.motif || "",
        ]));
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Visites">\n<Table>\n<Row>${cells(headers)}</Row>\n${dataRows.map((r) => `<Row>${r}</Row>`).join("\n")}\n</Table>\n</Worksheet>\n</Workbook>`;
        downloadFile(xml, `visites${periodSuffix}_${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8;");
      }
      setExportMessage(`${all.length} visite(s) exportée(s).`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "L'extraction a échoué.");
    } finally { setExporting(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  const statCards = [
    { label: "Commerciaux actifs", value: stats?.totalCommerciaux ?? 0, icon: Users, color: "bg-primary-50 text-primary-700", ring: "ring-primary-100" },
    { label: "Team Leaders actifs", value: stats?.totalSuperviseurs ?? 0, icon: UserCog, color: "bg-secondary-50 text-secondary-700", ring: "ring-secondary-100" },
    { label: "Tournées", value: stats?.totalSecteurs ?? 0, icon: MapPin, color: "bg-blue-50 text-blue-700", ring: "ring-blue-100" },
    { label: "Total POS équipe", value: stats?.totalPointsVente ?? 0, icon: Store, color: "bg-accent-50 text-accent-700", ring: "ring-accent-100" },
    { label: "POS actifs", value: stats?.totalPointsVenteActifs ?? 0, icon: CheckCircle2, color: "bg-success-50 text-success-700", ring: "ring-success-100" },
    { label: "POS désactivés", value: stats?.totalPointsVenteDesactives ?? 0, icon: AlertTriangle, color: "bg-gray-100 text-gray-600", ring: "ring-gray-200" },
    { label: "POS avec GPS", value: stats?.totalPointsVenteAvecGps ?? 0, icon: MapPin, color: "bg-blue-50 text-blue-700", ring: "ring-blue-100" },
    { label: "POS sans GPS", value: stats?.totalPointsVenteSansGps ?? 0, icon: Store, color: "bg-warning-50 text-warning-700", ring: "ring-warning-100" },
    { label: "Visites aujourd'hui", value: stats?.visitesToday ?? 0, icon: CalendarCheck, color: "bg-accent-50 text-accent-700", ring: "ring-accent-100" },
    { label: "Ventes réalisées", value: stats?.ventesRealisees ?? 0, icon: TrendingUp, color: "bg-success-50 text-success-600", ring: "ring-success-100" },
    { label: "Ventes non réalisées", value: stats?.ventesNonRealisees ?? 0, icon: TrendingDown, color: "bg-error-50 text-error-600", ring: "ring-error-100" },
    { label: "Promesses d'achat", value: stats?.promessesToday ?? 0, icon: Package, color: "bg-warning-50 text-warning-600", ring: "ring-warning-100" },
    { label: "BL en attente", value: stats?.blEnAttente ?? 0, icon: FileText, color: "bg-warning-50 text-warning-700", ring: "ring-warning-100" },
    { label: "BL livrés", value: stats?.blLivres ?? 0, icon: FileText, color: "bg-success-50 text-success-700", ring: "ring-success-100" },
    { label: "Contrôles terrain", value: stats?.controlesToday ?? 0, icon: ClipboardCheck, color: "bg-secondary-50 text-secondary-700", ring: "ring-secondary-100" },
    { label: "Dernière visite", value: stats?.lastVisite ? formatRelative(stats.lastVisite) : "Aucune", icon: Clock, color: "bg-gray-100 text-gray-600", ring: "ring-gray-200" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de l'activité terrain en temps réel</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className={`card p-5 ring-1 ${card.ring}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.color}`}><card.icon size={22} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Promesses d'achat section */}
      {promesses.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Promesses d'achat récentes</h2>
            <span className="badge bg-warning-50 text-warning-600"><Package size={12} /> {promesses.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {promesses.map((p) => (
              <div key={p.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-warning-50 text-warning-600 flex items-center justify-center flex-shrink-0"><Package size={20} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{p.superviseur?.full_name || "—"}</p>
                    <span className="badge bg-warning-50 text-warning-600">Promesse d'achat</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                    <Store size={14} /><span className="truncate">{p.point_vente?.name}</span>
                    <span className="text-gray-300">·</span><span>{p.point_vente?.city}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1.5">
                    <span>Produits : {p.produits}</span>
                    <span>Qté : {p.quantite}</span>
                    {p.date_previsionnelle && <span>Prévu : {formatDate(p.date_previsionnelle)}</span>}
                    {p.montant_estime != null && <span>Montant : {p.montant_estime} €</span>}
                    {p.responsable && <span>Resp. : {p.responsable}</span>
                    }
                  </div>
                  {p.observations && <p className="text-xs text-gray-400 mt-1 italic">{p.observations}</p>}
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">{formatDateTime(p.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visits list */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900">Dernières visites</h2>
              <span className="badge bg-gray-100 text-gray-600">{visites.length} récentes</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-2">Période d'extraction des visites (date de visite)</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-gray-600">
                  <span className="block mb-1">Date de début</span>
                  <input
                    type="date"
                    value={exportStartDate}
                    max={exportEndDate || undefined}
                    onChange={(event) => { setExportStartDate(event.target.value); setExportMessage(null); }}
                    className="input py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  <span className="block mb-1">Date de fin</span>
                  <input
                    type="date"
                    value={exportEndDate}
                    min={exportStartDate || undefined}
                    onChange={(event) => { setExportEndDate(event.target.value); setExportMessage(null); }}
                    className="input py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => { setExportStartDate(""); setExportEndDate(""); setExportMessage(null); }}
                  disabled={exporting || (!exportStartDate && !exportEndDate)}
                  className="btn-ghost text-xs py-2"
                >
                  Toutes les dates
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Laissez les deux dates vides pour extraire toutes les visites.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void exportVisits("csv")} disabled={exporting} className="btn-secondary text-xs py-2 px-3"><Download size={14} />{exporting ? "Export..." : "Extraire CSV"}</button>
              <button onClick={() => void exportVisits("excel")} disabled={exporting} className="btn-secondary text-xs py-2 px-3"><FileSpreadsheet size={14} />{exporting ? "Export..." : "Extraire Excel"}</button>
            </div>
          </div>
          {exportMessage && <p role="status" className={`text-sm ${exportMessage.startsWith("Aucune") || exportMessage.includes("ne peut pas") || exportMessage.includes("échoué") ? "text-warning-700" : "text-gray-600"}`}>{exportMessage}</p>}
        </div>
        {visites.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><CalendarCheck size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucune visite enregistrée pour le moment</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visites.map((v) => <VisitRow key={v.id} visite={v} statusLabel={statusLabel(v)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function VisitRow({ visite, statusLabel }: { visite: Visite; statusLabel: string }) {
  const isOut = visite.status === "out_of_zone";
  const isVenteOk = visite.vente_status === "vente_realisee";
  const isVenteNo = visite.vente_status === "vente_non_realisee";
  const isPromesse = visite.vente_status === "promesse_achat";

  const iconColor = isOut
    ? "bg-error-50 text-error-500"
    : isVenteOk
    ? "bg-success-50 text-success-600"
    : isVenteNo
    ? "bg-error-50 text-error-500"
    : isPromesse
    ? "bg-warning-50 text-warning-600"
    : "bg-accent-50 text-accent-600";

  const badgeColor = isOut
    ? "bg-error-50 text-error-600"
    : isVenteOk
    ? "bg-success-50 text-success-600"
    : isVenteNo
    ? "bg-error-50 text-error-600"
    : isPromesse
    ? "bg-warning-50 text-warning-600"
    : "bg-accent-50 text-accent-700";

  const Icon = isOut ? AlertTriangle : isVenteOk ? TrendingUp : isVenteNo ? TrendingDown : isPromesse ? Package : CheckCircle2;

  return (
    <div className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}><Icon size={20} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm">{visite.commercial?.full_name || visite.superviseur?.full_name || "—"}</p>
          <span className={`badge ${badgeColor}`}>{statusLabel}</span>
          <span className="badge bg-gray-100 text-gray-500">{visite.user_role === "superviseur" ? "Team Leader" : "Commercial"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
          <Store size={14} /><span className="truncate">{visite.point_vente?.name}</span>
          <span className="text-gray-300">·</span><span>{visite.point_vente?.city}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5">
          <span className="flex items-center gap-1"><Clock size={12} />{formatDateTime(visite.visited_at)}</span>
          <span className="flex items-center gap-1"><MapPin size={12} />{Math.round(visite.distance_meters)} m</span>
          {visite.motif && <span className="text-error-500">Motif : {visite.motif}</span>}
        </div>
      </div>
    </div>
  );
}
