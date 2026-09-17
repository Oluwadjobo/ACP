import { useEffect, useState, useCallback } from "react";
import { Store, Users, TrendingUp, Package, Truck, ClipboardCheck, BarChart3, UserCog, UserCheck, UserX, Calendar, Download, FileText, FileSpreadsheet, RotateCcw, MapPin, AlertTriangle, ShoppingCart, CheckCircle, Clock, XCircle, Gift } from "lucide-react";
import { api } from "@/lib/api";
import type { TeamStats } from "@/types";
import { useAuth } from "@/lib/auth";

type PeriodShortcut = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "custom";

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getShortcutRange(shortcut: PeriodShortcut): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(today);
  let end = new Date(today);

  switch (shortcut) {
    case "today":
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "this_week": {
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      break;
    }
    case "last_week": {
      const day = start.getDay() || 7;
      const lastMonday = new Date(start);
      lastMonday.setDate(start.getDate() - day + 1 - 7);
      start = lastMonday;
      end = new Date(lastMonday);
      end.setDate(end.getDate() + 6);
      break;
    }
    case "this_month":
      start.setDate(1);
      break;
    case "last_month":
      start.setMonth(start.getMonth() - 1, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      break;
    case "this_year":
      start.setMonth(0, 1);
      break;
    case "custom":
    default:
      break;
  }
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

const SHORTCUT_LABELS: { value: PeriodShortcut; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "this_week", label: "Cette semaine" },
  { value: "last_week", label: "Semaine précédente" },
  { value: "this_month", label: "Ce mois" },
  { value: "last_month", label: "Mois précédent" },
  { value: "this_year", label: "Cette année" },
  { value: "custom", label: "Période personnalisée" },
];

export function AdminTeamStats() {
  const { teamCode } = useAuth();
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [activeShortcut, setActiveShortcut] = useState<PeriodShortcut | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params: { date_start?: string; date_end?: string } = {};
    if (dateStart) params.date_start = dateStart;
    if (dateEnd) params.date_end = dateEnd;
    api.getTeamStats(params).then(setStats).finally(() => setLoading(false));
  }, [dateStart, dateEnd]);

  useEffect(() => { load(); }, [load]);

  const applyShortcut = (shortcut: PeriodShortcut) => {
    if (shortcut === "custom") {
      setActiveShortcut("custom");
      return;
    }
    const { start, end } = getShortcutRange(shortcut);
    setDateStart(start);
    setDateEnd(end);
    setActiveShortcut(shortcut);
  };

  const resetPeriod = () => {
    setDateStart("");
    setDateEnd("");
    setActiveShortcut(null);
  };

  const periodLabel = dateStart && dateEnd
    ? `Du ${new Date(dateStart).toLocaleDateString("fr-FR")} au ${new Date(dateEnd).toLocaleDateString("fr-FR")}`
    : dateStart
    ? `Depuis le ${new Date(dateStart).toLocaleDateString("fr-FR")}`
    : dateEnd
    ? `Jusqu'au ${new Date(dateEnd).toLocaleDateString("fr-FR")}`
    : "Toute la période";

  const exportCsv = () => {
    if (!stats) return;
    const headers = ["Catégorie", "Nom", "Statut", "PDV créés", "PDV visités", "Visites", "Ventes", "Ventes non réalisées", "Promesses", "Contrôles", "Commandes", "Livrées", "En cours", "Livraisons"];
    const rows: string[][] = [];
    stats.commerciaux.forEach(c => rows.push(["Commercial", c.full_name, c.active ? "Actif" : "Inactif", String(c.points_vente_crees), String(c.points_vente), String(c.visites), String(c.ventes), String(c.ventes_non_realisees), String(c.promesses), "", "", "", "", ""]));
    stats.agents_livreur.forEach(a => rows.push(["Agent livreur", a.full_name, a.active ? "Actif" : "Inactif", "", String(a.points_vente), "", "", "", "", "", String(a.commandes), String(a.livrees), String(a.en_cours), String(a.livraisons)]));
    stats.superviseurs.forEach(s => rows.push(["Team Leader", s.full_name, s.active ? "Actif" : "Inactif", String(s.points_vente_crees), String(s.points_vente), String(s.visites), String(s.ventes), "", "", String(s.controles), "", "", "", ""]));
    rows.push(["TOTAUX", "", "", "", String(stats.totals.points_vente_visites ?? stats.totals.points_vente), String(stats.totals.visites), String(stats.totals.ventes), String(stats.totals.visites_non_validees ?? 0), String(stats.totals.promesses ?? 0), String(stats.totals.controles), String(stats.totals.commandes), String(stats.totals.bl_livres ?? 0), String(stats.totals.bl_en_attente ?? 0), String(stats.totals.livraisons)]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `statistiques_${teamCode || "equipe"}_${dateStart || "debut"}_${dateEnd || "fin"}.csv`;
    link.click();
  };

  const exportPdf = () => {
    if (!stats) return;
    import("jspdf").then(({ default: jsPDF }) => {
      try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      let y = 15;

      pdf.setFontSize(18);
      pdf.setTextColor(13, 27, 94);
      pdf.text("Rapport Statistiques", pw / 2, y, { align: "center" });
      y += 7;
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Équipe: ${teamCode || "Toutes"}`, pw / 2, y, { align: "center" });
      y += 5;
      pdf.text(periodLabel, pw / 2, y, { align: "center" });
      y += 5;
      pdf.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, pw / 2, y, { align: "center" });
      y += 8;

      pdf.setFontSize(12);
      pdf.setTextColor(13, 27, 94);
      pdf.text("Synthèse", 14, y);
      y += 5;
      pdf.setFontSize(8);
      pdf.setTextColor(60, 60, 60);
      const totals = stats.totals;
      const synthLines = [
        `POS visités: ${totals.points_vente_visites ?? totals.points_vente}  |  Visites: ${totals.visites}  |  Non validées: ${totals.visites_non_validees ?? 0}`,
        `Ventes: ${totals.ventes}  |  Promesses: ${totals.promesses ?? 0}  |  Contrôles: ${totals.controles}`,
        `Commandes: ${totals.commandes}  |  Livraisons: ${totals.livraisons}`,
        `BL en attente: ${totals.bl_en_attente ?? 0}  |  BL livrés: ${totals.bl_livres ?? 0}  |  BL partiels: ${totals.bl_partiels ?? 0}  |  BL annulés: ${totals.bl_annules ?? 0}`,
      ];
      synthLines.forEach(line => { pdf.text(line, 14, y); y += 5; });
      y += 4;

      const drawTable = (title: string, headers: string[], rowsData: string[][]) => {
        if (y > 170) { pdf.addPage(); y = 15; }
        pdf.setFontSize(11);
        pdf.setTextColor(13, 27, 94);
        pdf.text(title, 14, y);
        y += 5;
        pdf.setFontSize(7);
        pdf.setFillColor(13, 27, 94);
        pdf.rect(14, y - 3, pw - 28, 5, "F");
        pdf.setTextColor(255, 255, 255);
        let x = 14;
        const colWidths = (pw - 28) / headers.length;
        headers.forEach(h => { pdf.text(h, x + 1, y, { maxWidth: colWidths - 2 }); x += colWidths; });
        y += 5;
        pdf.setTextColor(40, 40, 40);
        rowsData.forEach((row, i) => {
          if (y > 185) { pdf.addPage(); y = 15; }
          if (i % 2 === 0) { pdf.setFillColor(245, 247, 250); pdf.rect(14, y - 3, pw - 28, 5, "F"); }
          x = 14;
          row.forEach(cell => { pdf.text(String(cell), x + 1, y, { maxWidth: colWidths - 2 }); x += colWidths; });
          y += 5;
        });
        y += 5;
      };

      drawTable("Commerciaux",
        ["Nom", "Statut", "PDV créés", "PDV visités", "Visites", "Ventes", "Non réa.", "Prom."],
        stats.commerciaux.map(c => [c.full_name, c.active ? "Actif" : "Inactif", String(c.points_vente_crees), String(c.points_vente), String(c.visites), String(c.ventes), String(c.ventes_non_realisees), String(c.promesses)]));

      drawTable("Agents livreur",
        ["Nom", "Statut", "PDV livrés", "Commandes", "Livrées", "En cours", "Livraisons"],
        stats.agents_livreur.map(a => [a.full_name, a.active ? "Actif" : "Inactif", String(a.points_vente), String(a.commandes), String(a.livrees), String(a.en_cours), String(a.livraisons)]));

      drawTable("Team Leaders",
        ["Nom", "Statut", "PDV créés", "PDV visités", "Visites", "Ventes", "Contrôles"],
        stats.superviseurs.map(s => [s.full_name, s.active ? "Actif" : "Inactif", String(s.points_vente_crees), String(s.points_vente), String(s.visites), String(s.ventes), String(s.controles)]));

      pdf.save(`statistiques_${teamCode || "equipe"}_${dateStart || "debut"}_${dateEnd || "fin"}.pdf`);
      } catch (e) { console.error("PDF export error:", e); }
    }).catch((e) => console.error("PDF import error:", e));
  };

  const exportExcel = () => {
    if (!stats) return;
    setExporting(true);
    try {
      const headers = ["Catégorie", "Nom", "Statut", "PDV créés", "PDV visités", "Visites", "Ventes", "Ventes non réalisées", "Promesses", "Contrôles", "Commandes", "Livrées", "En cours", "Livraisons"];
      const rows: string[][] = [];
      stats.commerciaux.forEach(c => rows.push(["Commercial", c.full_name, c.active ? "Actif" : "Inactif", String(c.points_vente_crees), String(c.points_vente), String(c.visites), String(c.ventes), String(c.ventes_non_realisees), String(c.promesses), "", "", "", "", ""]));
      stats.agents_livreur.forEach(a => rows.push(["Agent livreur", a.full_name, a.active ? "Actif" : "Inactif", "", String(a.points_vente), "", "", "", "", "", String(a.commandes), String(a.livrees), String(a.en_cours), String(a.livraisons)]));
      stats.superviseurs.forEach(s => rows.push(["Team Leader", s.full_name, s.active ? "Actif" : "Inactif", String(s.points_vente_crees), String(s.points_vente), String(s.visites), String(s.ventes), "", "", String(s.controles), "", "", "", ""]));
      rows.push(["TOTAUX", "", "", "", String(stats.totals.points_vente_visites ?? stats.totals.points_vente), String(stats.totals.visites), String(stats.totals.ventes), String(stats.totals.visites_non_validees ?? 0), String(stats.totals.promesses ?? 0), String(stats.totals.controles), String(stats.totals.commandes), String(stats.totals.bl_livres ?? 0), String(stats.totals.bl_en_attente ?? 0), String(stats.totals.livraisons)]);

      let html = `<table xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><thead><tr>`;
      headers.forEach(h => html += `<th style="background:#0d1b5e;color:white;font-weight:bold;padding:4px;">${h}</th>`);
      html += `</tr></thead><tbody>`;
      rows.forEach((r, i) => {
        html += `<tr style="${i % 2 === 0 ? "background:#f5f7fa;" : ""}">`;
        r.forEach(c => html += `<td style="padding:3px;border:1px solid #e0e0e0;">${c}</td>`);
        html += `</tr>`;
      });
      html += `</tbody></table>`;

      const blob = new Blob([`\uFEFF<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `statistiques_${teamCode || "equipe"}_${dateStart || "debut"}_${dateEnd || "fin"}.xls`;
      link.click();
    } catch (e) { console.error("Excel export error:", e); }
    finally { setExporting(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  if (!stats) {
    return <div className="text-center py-20 text-gray-500">Aucune donnée disponible</div>;
  }

  const t = stats.totals;
  const totalCards = [
    { label: "POS visités", value: t.points_vente_visites ?? t.points_vente, icon: Store, color: "bg-accent-50 text-accent-700", ring: "ring-accent-100" },
    { label: "Visites", value: t.visites, icon: Users, color: "bg-primary-50 text-primary-700", ring: "ring-primary-100" },
    { label: "Visites non validées", value: t.visites_non_validees ?? 0, icon: AlertTriangle, color: "bg-error-50 text-error-600", ring: "ring-error-100" },
    { label: "Ventes", value: t.ventes, icon: TrendingUp, color: "bg-success-50 text-success-600", ring: "ring-success-100" },
    { label: "Promesses", value: t.promesses ?? 0, icon: Gift, color: "bg-warning-50 text-warning-600", ring: "ring-warning-100" },
    { label: "Contrôles terrain", value: t.controles, icon: ClipboardCheck, color: "bg-blue-50 text-blue-700", ring: "ring-blue-100" },
    { label: "Commandes", value: t.commandes, icon: ShoppingCart, color: "bg-secondary-50 text-secondary-700", ring: "ring-secondary-100" },
    { label: "Livraisons", value: t.livraisons, icon: Truck, color: "bg-purple-50 text-purple-700", ring: "ring-purple-100" },
    { label: "BL en attente", value: t.bl_en_attente ?? 0, icon: Clock, color: "bg-amber-50 text-amber-700", ring: "ring-amber-100" },
    { label: "BL livrés", value: t.bl_livres ?? 0, icon: CheckCircle, color: "bg-green-50 text-green-700", ring: "ring-green-100" },
    { label: "BL partiels", value: t.bl_partiels ?? 0, icon: Package, color: "bg-orange-50 text-orange-700", ring: "ring-orange-100" },
    { label: "BL annulés", value: t.bl_annules ?? 0, icon: XCircle, color: "bg-red-50 text-red-700", ring: "ring-red-100" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques équipe</h1>
          <p className="text-gray-500 text-sm mt-1">{periodLabel}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button onClick={exportCsv} className="btn-secondary" disabled={!stats}>
              <FileText size={16} />
              CSV
            </button>
          </div>
          <button onClick={exportExcel} className="btn-secondary" disabled={!stats || exporting}>
            <FileSpreadsheet size={16} />
            Excel
          </button>
          <button onClick={exportPdf} className="btn-primary" disabled={!stats}>
            <Download size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* Period selection */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={18} className="text-primary-600" />
          {SHORTCUT_LABELS.map(s => (
            <button
              key={s.value}
              onClick={() => applyShortcut(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeShortcut === s.value
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Du</label>
            <input
              type="date"
              className="input max-w-[160px] py-1.5 text-sm"
              value={dateStart}
              onChange={e => { setDateStart(e.target.value); setActiveShortcut("custom"); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Au</label>
            <input
              type="date"
              className="input max-w-[160px] py-1.5 text-sm"
              value={dateEnd}
              onChange={e => { setDateEnd(e.target.value); setActiveShortcut("custom"); }}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn-primary text-sm py-1.5">
              Appliquer
            </button>
            {(dateStart || dateEnd) && (
              <button onClick={resetPeriod} className="btn-secondary text-sm py-1.5">
                <RotateCcw size={14} />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {totalCards.map((card, i) => (
          <div key={i} className={`card p-4 ring-1 ${card.ring}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}><card.icon size={20} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Commerciaux table */}
      <div className="card">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <BarChart3 size={20} className="text-primary-600" />
          <h2 className="text-lg font-bold text-gray-900">Performance des commerciaux</h2>
        </div>
        {stats.commerciaux.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucun commercial</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Commercial</th>
                  <th className="px-4 py-3 font-medium text-center">Statut</th>
                  <th className="px-4 py-3 font-medium text-center">PDV créés</th>
                  <th className="px-4 py-3 font-medium text-center">PDV visités</th>
                  <th className="px-4 py-3 font-medium text-center">Visites</th>
                  <th className="px-4 py-3 font-medium text-center">Ventes</th>
                  <th className="px-4 py-3 font-medium text-center">Non réalisées</th>
                  <th className="px-4 py-3 font-medium text-center">Promesses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.commerciaux.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${c.active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-400"}`}>
                          {c.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{c.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.active ? <UserCheck size={16} className="inline text-success-500" /> : <UserX size={16} className="inline text-gray-400" />}
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-primary-700">{c.points_vente_crees}</td>
                    <td className="px-4 py-4 text-center font-semibold text-accent-700">{c.points_vente}</td>
                    <td className="px-4 py-4 text-center text-gray-700">{c.visites}</td>
                    <td className="px-4 py-4 text-center font-semibold text-success-600">{c.ventes}</td>
                    <td className="px-4 py-4 text-center text-error-500">{c.ventes_non_realisees}</td>
                    <td className="px-4 py-4 text-center text-warning-600">{c.promesses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agents livreur table */}
      <div className="card">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Truck size={20} className="text-secondary-600" />
          <h2 className="text-lg font-bold text-gray-900">Performance des agents livreur</h2>
        </div>
        {stats.agents_livreur.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucun agent livreur</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Agent livreur</th>
                  <th className="px-4 py-3 font-medium text-center">Statut</th>
                  <th className="px-4 py-3 font-medium text-center">PDV livrés</th>
                  <th className="px-4 py-3 font-medium text-center">Commandes</th>
                  <th className="px-4 py-3 font-medium text-center">Livrées</th>
                  <th className="px-4 py-3 font-medium text-center">En cours</th>
                  <th className="px-4 py-3 font-medium text-center">Livraisons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.agents_livreur.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${a.active ? "bg-secondary-100 text-secondary-700" : "bg-gray-100 text-gray-400"}`}>
                          {a.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{a.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {a.active ? <UserCheck size={16} className="inline text-success-500" /> : <UserX size={16} className="inline text-gray-400" />}
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-accent-700">{a.points_vente}</td>
                    <td className="px-4 py-4 text-center text-gray-700">{a.commandes}</td>
                    <td className="px-4 py-4 text-center font-semibold text-success-600">{a.livrees}</td>
                    <td className="px-4 py-4 text-center text-warning-600">{a.en_cours}</td>
                    <td className="px-4 py-4 text-center text-secondary-700">{a.livraisons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Superviseurs table */}
      <div className="card">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <UserCog size={20} className="text-primary-600" />
          <h2 className="text-lg font-bold text-gray-900">Performance des Team Leaders</h2>
        </div>
        {stats.superviseurs.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucun Team Leader</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Team Leader</th>
                  <th className="px-4 py-3 font-medium text-center">Statut</th>
                  <th className="px-4 py-3 font-medium text-center">PDV créés</th>
                  <th className="px-4 py-3 font-medium text-center">PDV visités</th>
                  <th className="px-4 py-3 font-medium text-center">Visites</th>
                  <th className="px-4 py-3 font-medium text-center">Ventes</th>
                  <th className="px-4 py-3 font-medium text-center">Contrôles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.superviseurs.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${s.active ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-400"}`}>
                          {s.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{s.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {s.active ? <UserCheck size={16} className="inline text-success-500" /> : <UserX size={16} className="inline text-gray-400" />}
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-primary-700">{s.points_vente_crees}</td>
                    <td className="px-4 py-4 text-center font-semibold text-accent-700">{s.points_vente}</td>
                    <td className="px-4 py-4 text-center text-gray-700">{s.visites}</td>
                    <td className="px-4 py-4 text-center font-semibold text-success-600">{s.ventes}</td>
                    <td className="px-4 py-4 text-center text-warning-600">{s.controles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
