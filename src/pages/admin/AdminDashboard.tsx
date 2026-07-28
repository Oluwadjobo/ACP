import { useEffect, useState } from "react";
import { Users, CalendarCheck, Clock, MapPin, CheckCircle2, AlertTriangle, Store, Download, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats, Visite } from "@/types";
import { formatDateTime, formatRelative, formatDate, formatTime } from "@/lib/format";

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visites, setVisites] = useState<Visite[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.listVisites(1, 20)])
      .then(([s, v]) => {
        setStats(s);
        setVisites(v.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchAllVisites = async (): Promise<Visite[]> => {
    const all: Visite[] = [];
    let page = 1;
    const pageSize = 200;
    while (true) {
      const res = await api.listVisites(page, pageSize);
      all.push(...res.data);
      if (all.length >= res.count || res.data.length === 0) break;
      page++;
    }
    return all;
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const all = await fetchAllVisites();
      const headers = ["Commercial", "Point de vente", "Ville", "Adresse", "Date", "Heure", "Latitude", "Longitude", "Distance (m)", "Statut"];
      const escapeCSV = (val: string | number) => {
        const s = String(val);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = all.map((v) => [
        escapeCSV(v.commercial?.full_name || ""),
        escapeCSV(v.point_vente?.name || ""),
        escapeCSV(v.point_vente?.city || ""),
        escapeCSV(v.point_vente?.address || ""),
        escapeCSV(formatDate(v.visited_at)),
        escapeCSV(formatTime(v.visited_at)),
        v.latitude,
        v.longitude,
        Math.round(v.distance_meters),
        escapeCSV(v.status === "confirmed" ? "Présence confirmée" : "Hors zone"),
      ].join(","));
      const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
      downloadFile(csv, `visites_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all = await fetchAllVisites();
      const headers = ["Commercial", "Point de vente", "Ville", "Adresse", "Date", "Heure", "Latitude", "Longitude", "Distance (m)", "Statut"];
      const escapeXML = (val: string | number) => String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const cells = (row: string[]) => row.map((c) => `<Cell><Data ss:Type="String">${escapeXML(c)}</Data></Cell>`).join("");
      const dataRows = all.map((v) => cells([
        v.commercial?.full_name || "",
        v.point_vente?.name || "",
        v.point_vente?.city || "",
        v.point_vente?.address || "",
        formatDate(v.visited_at),
        formatTime(v.visited_at),
        String(v.latitude),
        String(v.longitude),
        String(Math.round(v.distance_meters)),
        v.status === "confirmed" ? "Présence confirmée" : "Hors zone",
      ]));
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="Visites">\n<Table>\n<Row>${cells(headers)}</Row>\n${dataRows.map((r) => `<Row>${r}</Row>`).join("\n")}\n</Table>\n</Worksheet>\n</Workbook>`;
      downloadFile(xml, `visites_${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8;");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Commerciaux actifs",
      value: stats?.totalCommerciaux ?? 0,
      icon: Users,
      color: "bg-primary-50 text-primary-700",
      ring: "ring-primary-100",
    },
    {
      label: "Visites aujourd'hui",
      value: stats?.visitesToday ?? 0,
      icon: CalendarCheck,
      color: "bg-accent-50 text-accent-700",
      ring: "ring-accent-100",
    },
    {
      label: "Dernière visite",
      value: stats?.lastVisite ? formatRelative(stats.lastVisite) : "Aucune",
      icon: Clock,
      color: "bg-warning-50 text-warning-600",
      ring: "ring-warning-100",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de l'activité terrain en temps réel</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className={`card p-5 ring-1 ${card.ring}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.color}`}>
                <card.icon size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Visits list */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Dernières visites</h2>
            <span className="badge bg-gray-100 text-gray-600">{visites.length} récentes</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} disabled={exporting || visites.length === 0} className="btn-secondary text-xs py-2 px-3">
              <Download size={14} />
              {exporting ? "Export..." : "CSV"}
            </button>
            <button onClick={exportExcel} disabled={exporting || visites.length === 0} className="btn-secondary text-xs py-2 px-3">
              <FileSpreadsheet size={14} />
              {exporting ? "Export..." : "Excel"}
            </button>
          </div>
        </div>
        {visites.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <CalendarCheck size={26} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">Aucune visite enregistrée pour le moment</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visites.map((v) => (
              <VisitRow key={v.id} visite={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VisitRow({ visite }: { visite: Visite }) {
  const confirmed = visite.status === "confirmed";
  return (
    <div className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        confirmed ? "bg-accent-50 text-accent-600" : "bg-error-50 text-error-500"
      }`}>
        {confirmed ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm">{visite.commercial?.full_name || "—"}</p>
          <span className={`badge ${
            confirmed ? "bg-accent-50 text-accent-700" : "bg-error-50 text-error-600"
          }`}>
            {confirmed ? "Présence confirmée" : "Hors zone"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
          <Store size={14} />
          <span className="truncate">{visite.point_vente?.name}</span>
          <span className="text-gray-300">·</span>
          <span>{visite.point_vente?.city}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDateTime(visite.visited_at)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {Math.round(visite.distance_meters)} m
          </span>
        </div>
      </div>
    </div>
  );
}
