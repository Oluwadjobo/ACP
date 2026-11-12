import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Download, FileImage, History, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { exportDailyReportJpg } from "@/lib/dailyReportImage";
import type { DailyReportAuditEntry, DailyReportSnapshot, DailyReportTotals, Team } from "@/types";

type ViewMode = "daily" | "comparison";

const REPORT_COLUMNS = [
  "Commercial",
  "Hors zone",
  "Présence confirmée",
  "Vente non réalisée",
  "Vente réalisée",
  "Total général",
] as const;

const TEAM_NAMES: Record<string, string> = {
  EAU: "EAU",
  YAOURT: "YAOURT",
  OPLANETE: "PLANÈTE",
};

const REPORT_METRICS: { label: string; key: keyof DailyReportTotals }[] = [
  { label: "Hors zone", key: "out_of_zone" },
  { label: "Présence confirmée", key: "presence_confirmed" },
  { label: "Vente non réalisée", key: "sale_not_realized" },
  { label: "Vente réalisée", key: "sale_realized" },
  { label: "Total général", key: "total" },
];

function todayInPortoNovo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatReportDate(value: string): string {
  return new Date(`${value}T12:00:00+01:00`).toLocaleDateString("fr-FR", {
    timeZone: "Africa/Porto-Novo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function displayCount(value: number): string {
  return value === 0 ? "" : new Intl.NumberFormat("fr-FR").format(value);
}

function percentChange(base: number, current: number): string {
  if (base === 0) return current === 0 ? "0 %" : "—";
  const value = ((current - base) / base) * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function ReportTable({ snapshot }: { snapshot: DailyReportSnapshot }) {
  const totals = snapshot.report_data.totals;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-[880px] w-full border-collapse text-sm">
        <thead className="bg-primary-900 text-white">
          <tr>
            {REPORT_COLUMNS.map((column, index) => (
              <th key={column} className={`px-3 py-3 text-left font-semibold ${index === 0 ? "min-w-52" : "min-w-28"}`}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {snapshot.report_data.rows.length ? snapshot.report_data.rows.map((row) => (
            <tr key={row.commercial_id} className="hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium text-gray-900">{row.commercial_name_at_generation}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{displayCount(row.out_of_zone)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{displayCount(row.presence_confirmed)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{displayCount(row.sale_not_realized)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{displayCount(row.sale_realized)}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{displayCount(row.total)}</td>
            </tr>
          )) : (
            <tr><td className="px-3 py-5 text-center text-gray-500" colSpan={6}>Aucune visite comptabilisable pour cette journée.</td></tr>
          )}
        </tbody>
        <tfoot className="bg-gray-100 font-bold text-gray-900">
          <tr>
            <td className="px-3 py-3">TOTAL</td>
            <td className="px-3 py-3 text-right tabular-nums">{displayCount(totals.out_of_zone)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{displayCount(totals.presence_confirmed)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{displayCount(totals.sale_not_realized)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{displayCount(totals.sale_realized)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{displayCount(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SnapshotSummary({ snapshot }: { snapshot: DailyReportSnapshot }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total général</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{snapshot.total_general.toLocaleString("fr-FR")}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Taux de conversion</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{Number(snapshot.conversion_rate).toFixed(2)} %</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Version / génération</p>
        <p className="mt-1 text-base font-semibold text-gray-900">v{snapshot.version}</p>
        <p className="mt-1 text-xs text-gray-500">{new Date(snapshot.generated_at).toLocaleString("fr-FR")}</p>
      </div>
    </div>
  );
}

export function AdminDailyReports() {
  const today = useMemo(todayInPortoNovo, []);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [mode, setMode] = useState<ViewMode>("daily");
  const [reportDate, setReportDate] = useState(today);
  const [dateA, setDateA] = useState(today);
  const [dateB, setDateB] = useState(today);
  const [snapshot, setSnapshot] = useState<DailyReportSnapshot | null>(null);
  const [audit, setAudit] = useState<DailyReportAuditEntry[]>([]);
  const [comparison, setComparison] = useState<{
    date_a: { date: string; snapshot: DailyReportSnapshot | null };
    date_b: { date: string; snapshot: DailyReportSnapshot | null };
    analytical_comment: string;
  } | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestSequence = useRef(0);

  const selectedTeam = teams.find((team) => team.id === teamId);
  const displayTeamName = selectedTeam ? TEAM_NAMES[selectedTeam.code] || selectedTeam.name : "";

  useEffect(() => {
    api.listDailyReportTeams()
      .then((data) => {
        const fixedOrder = ["EAU", "YAOURT", "OPLANETE"];
        const ordered = [...data].sort((a, b) => fixedOrder.indexOf(a.code) - fixedOrder.indexOf(b.code));
        setTeams(ordered);
        if (ordered[0]) setTeamId(ordered[0].id);
      })
      .catch((cause: Error) => setError(cause.message || "Impossible de charger les équipes"))
      .finally(() => setLoadingTeams(false));
  }, []);

  const loadDaily = useCallback(async () => {
    if (!teamId || !reportDate) return;
    const requestId = ++requestSequence.current;
    setLoadingReport(true);
    setError("");
    setNotice("");
    try {
      const result = await api.getDailyReportSnapshot(teamId, reportDate);
      if (requestId === requestSequence.current) {
        setSnapshot(result.snapshot);
        setAudit(result.audit);
      }
    } catch (cause) {
      if (requestId === requestSequence.current) {
        setError((cause as Error).message || "Impossible de charger l'instantané");
        setSnapshot(null);
        setAudit([]);
      }
    } finally {
      if (requestId === requestSequence.current) setLoadingReport(false);
    }
  }, [teamId, reportDate]);

  const loadComparison = useCallback(async () => {
    if (!teamId || !dateA || !dateB) return;
    const requestId = ++requestSequence.current;
    setLoadingReport(true);
    setError("");
    setNotice("");
    try {
      const result = await api.compareDailyReports(teamId, dateA, dateB);
      if (requestId === requestSequence.current) setComparison(result);
    } catch (cause) {
      if (requestId === requestSequence.current) {
        setError((cause as Error).message || "Impossible de charger la comparaison");
        setComparison(null);
      }
    } finally {
      if (requestId === requestSequence.current) setLoadingReport(false);
    }
  }, [teamId, dateA, dateB]);

  useEffect(() => {
    if (mode === "daily") void loadDaily();
    else void loadComparison();
  }, [mode, loadDaily, loadComparison]);

  const generate = async (date: string) => {
    if (!teamId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.generateDailyReport(teamId, date);
      setNotice(`Instantané du ${formatReportDate(date)} créé.`);
      if (mode === "daily") await loadDaily();
      else await loadComparison();
    } catch (cause) {
      setError((cause as Error).message || "La création de l'instantané a échoué");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!snapshot) return;
    const confirmed = window.confirm(
      `Régénérer le rapport ${displayTeamName} du ${formatReportDate(snapshot.report_date)} ?\n\nLa version ${snapshot.version} sera conservée dans l'historique. Cette opération remplacera l'instantané actuel.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.regenerateDailyReport(snapshot.team_id, snapshot.report_date, snapshot.version);
      setNotice(`Rapport régénéré. La version ${snapshot.version} a été archivée.`);
      await loadDaily();
    } catch (cause) {
      setError((cause as Error).message || "La régénération a échoué");
    } finally {
      setBusy(false);
    }
  };

  const exportJpg = () => {
    try {
      if (mode === "daily") {
        exportDailyReportJpg({ teamName: displayTeamName, snapshot });
      } else {
        exportDailyReportJpg({
          teamName: displayTeamName,
          comparison: {
            dateA,
            dateB,
            snapshotA: comparison?.date_a.snapshot ?? null,
            snapshotB: comparison?.date_b.snapshot ?? null,
            analyticalComment: comparison?.analytical_comment ?? "",
          },
        });
      }
    } catch (cause) {
      setError((cause as Error).message || "L'export JPG a échoué");
    }
  };

  const renderMissingSnapshot = (date: string) => (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Instantané absent pour le {formatReportDate(date)}</p>
          <p className="mt-1 text-sm">Les rapports historiques sont lus depuis les instantanés. Générez volontairement celui-ci pour pouvoir le consulter ou le comparer.</p>
          <button onClick={() => void generate(date)} disabled={busy} className="btn-primary mt-4 disabled:opacity-50">
            {busy ? "Génération…" : "Générer cet instantané"}
          </button>
        </div>
      </div>
    </div>
  );

  const comparisonRows = useMemo(() => {
    const a = comparison?.date_a.snapshot;
    const b = comparison?.date_b.snapshot;
    if (!a || !b) return [];
    return REPORT_METRICS.map((metric) => {
      const first = a.report_data.totals[metric.key];
      const second = b.report_data.totals[metric.key];
      return { label: metric.label, first, second, difference: second - first, percent: percentChange(first, second) };
    });
  }, [comparison]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary-800">
            <CalendarDays size={23} />
            <h1 className="text-2xl font-bold">Rapports journaliers</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Instantanés historiques ACP · dates métier Africa/Porto-Novo</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <ShieldCheck size={16} /> Accès Super Admin
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Équipe</span>
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={loadingTeams || busy} className="input w-full">
              {teams.map((team) => <option key={team.id} value={team.id}>{TEAM_NAMES[team.code] || team.name}</option>)}
            </select>
          </label>
          <div className="inline-flex rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Type de rapport">
            <button type="button" onClick={() => setMode("daily")} aria-selected={mode === "daily"} className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "daily" ? "bg-white text-primary-800 shadow-sm" : "text-gray-600"}`}>Journalier</button>
            <button type="button" onClick={() => setMode("comparison")} aria-selected={mode === "comparison"} className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "comparison" ? "bg-white text-primary-800 shadow-sm" : "text-gray-600"}`}>Comparatif</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {mode === "daily" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Journée</span>
              <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="input" />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Date A</span>
                <input type="date" value={dateA} onChange={(event) => setDateA(event.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Date B</span>
                <input type="date" value={dateB} onChange={(event) => setDateB(event.target.value)} className="input" />
              </label>
            </>
          )}
          <button type="button" onClick={() => mode === "daily" ? void loadDaily() : void loadComparison()} disabled={loadingReport || !teamId} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={16} className={loadingReport ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </section>

      {loadingReport && <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-500">Chargement des instantanés…</div>}

      {!loadingReport && mode === "daily" && (
        snapshot ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{displayTeamName} · {formatReportDate(snapshot.report_date)}</h2>
                <p className="mt-1 text-sm text-gray-500">Commerciaux triés par total général décroissant</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportJpg} className="btn-secondary inline-flex items-center gap-2"><FileImage size={16} /> Exporter JPG</button>
                <button type="button" onClick={() => void regenerate()} disabled={busy} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                  <RefreshCw size={16} /> {busy ? "Régénération…" : "Régénérer"}
                </button>
              </div>
            </div>
            <SnapshotSummary snapshot={snapshot} />
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-sm font-semibold text-blue-950">Commentaire journalier</h3>
              <p className="mt-1 text-sm leading-6 text-blue-900">{snapshot.analytical_comment}</p>
            </div>
            <ReportTable snapshot={snapshot} />

            <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <History size={19} className="text-primary-700" />
                <h3 className="font-semibold text-gray-900">Historique des versions</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{audit.length} régénération{audit.length > 1 ? "s" : ""}</span>
              </div>
              {audit.length ? (
                <div className="space-y-3">
                  {audit.map((entry) => (
                    <details key={entry.id} className="rounded-lg border border-gray-200">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm">
                        <span className="font-semibold text-gray-900">Version {entry.previous_version} → {entry.replacement_version}</span>
                        <span className="ml-2 text-gray-500">{new Date(entry.regenerated_at).toLocaleString("fr-FR")} · {entry.regenerated_by_name}</span>
                      </summary>
                      <div className="space-y-4 border-t border-gray-100 p-3">
                        <div>
                          <p className="mb-2 text-sm font-semibold text-gray-700">Version {entry.previous_version} (archivée)</p>
                          <ReportTable snapshot={entry.previous_snapshot} />
                        </div>
                        <p className="text-xs text-gray-500">Commentaire archivé : {entry.previous_snapshot.analytical_comment}</p>
                      </div>
                    </details>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">Aucune régénération enregistrée pour cet instantané.</p>}
            </section>
          </div>
        ) : teamId && reportDate ? renderMissingSnapshot(reportDate) : null
      )}

      {!loadingReport && mode === "comparison" && comparison && (
        <div className="space-y-6">
          {comparison.date_a.snapshot && comparison.date_b.snapshot ? (
            <>
              <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-center gap-2">
                  <TrendingUp size={19} className="text-blue-800" />
                  <h2 className="font-semibold text-blue-950">Commentaire analytique comparatif</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-blue-900">{comparison.analytical_comment}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-blue-900">
                    Conversion : {Number(comparison.date_a.snapshot.conversion_rate).toFixed(2)} % → {Number(comparison.date_b.snapshot.conversion_rate).toFixed(2)} %
                    <strong className="ml-2">{comparison.date_b.snapshot.conversion_rate - comparison.date_a.snapshot.conversion_rate > 0 ? "+" : ""}{(comparison.date_b.snapshot.conversion_rate - comparison.date_a.snapshot.conversion_rate).toFixed(2)} point(s)</strong>
                  </span>
                  <button type="button" onClick={exportJpg} className="btn-secondary ml-auto inline-flex items-center gap-2"><Download size={16} /> Exporter la comparaison en JPG</button>
                </div>
              </section>

              <section className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                <h3 className="mb-3 font-semibold text-gray-900">Variations entre les instantanés</h3>
                <table className="min-w-[650px] w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-3 py-3">Catégorie</th><th className="px-3 py-3 text-right">{formatReportDate(dateA)}</th><th className="px-3 py-3 text-right">{formatReportDate(dateB)}</th><th className="px-3 py-3 text-right">Variation absolue</th><th className="px-3 py-3 text-right">Variation %</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {comparisonRows.map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-3 font-medium text-gray-800">{row.label}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.first.toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.second.toLocaleString("fr-FR")}</td>
                        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.difference > 0 ? "text-emerald-700" : row.difference < 0 ? "text-red-700" : "text-gray-700"}`}>{row.difference > 0 ? "+" : ""}{row.difference.toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{row.percent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900">{displayTeamName} · {formatReportDate(dateA)}</h3>
                    <span className="text-xs text-gray-500">Version {comparison.date_a.snapshot.version}</span>
                  </div>
                  <ReportTable snapshot={comparison.date_a.snapshot} />
                </section>
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900">{displayTeamName} · {formatReportDate(dateB)}</h3>
                    <span className="text-xs text-gray-500">Version {comparison.date_b.snapshot.version}</span>
                  </div>
                  <ReportTable snapshot={comparison.date_b.snapshot} />
                </section>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {[...new Set([
                !comparison.date_a.snapshot ? dateA : null,
                !comparison.date_b.snapshot ? dateB : null,
              ].filter((date): date is string => date !== null))].map((missingDate) => (
                <div key={missingDate}>{renderMissingSnapshot(missingDate)}</div>
              ))}
              {comparison.date_a.snapshot && <section className="space-y-3"><h3 className="font-semibold text-gray-900">{displayTeamName} · {formatReportDate(dateA)}</h3><ReportTable snapshot={comparison.date_a.snapshot} /></section>}
              {comparison.date_b.snapshot && <section className="space-y-3"><h3 className="font-semibold text-gray-900">{displayTeamName} · {formatReportDate(dateB)}</h3><ReportTable snapshot={comparison.date_b.snapshot} /></section>}
            </div>
          )}
        </div>
      )}

      {!loadingTeams && teams.length === 0 && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune équipe EAU, YAOURT ou PLANÈTE n'est disponible.</div>
      )}
    </div>
  );
}
