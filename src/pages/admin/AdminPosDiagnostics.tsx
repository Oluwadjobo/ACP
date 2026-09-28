import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Commercial, CommercialPointsVenteDiagnostic, PointVente, PosListPagination, Team } from "@/types";

interface Comparison {
  common: PointVente[];
  adminOnly: PointVente[];
  commercialOnly: CommercialPointsVenteDiagnostic["points"];
  adminDuplicateIds: string[];
  commercialDuplicateIds: string[];
  adminSectorIds: string[];
  commercialSectorIds: string[];
  assignmentMismatch: boolean;
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function unavailable(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Non disponible" : String(value);
}

function PaginationSummary({ label, pagination }: { label: string; pagination: PosListPagination }) {
  return (
    <p className="text-xs text-gray-500">
      {label} : {pagination.recordsReceived} résultat(s) reçu(s) sur {pagination.reportedTotal} rapporté(s),{" "}
      {pagination.pagesFetched} page(s) de {pagination.pageSize} maximum.
      {pagination.truncated ? " Résultats tronqués." : " Pagination complète."}
    </p>
  );
}

export function AdminPosDiagnostics() {
  const { teamId, teamCode, isSuperAdmin } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [selectedCommercialId, setSelectedCommercialId] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [switchingTeam, setSwitchingTeam] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    adminPoints: PointVente[];
    adminPagination: PosListPagination;
    commercial: CommercialPointsVenteDiagnostic;
    comparison: Comparison;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTeam = teams.find((team) => team.id === teamId);
  const availableCommercials = useMemo(
    () => commerciaux.filter((commercial) => commercial.team_id === teamId),
    [commerciaux, teamId],
  );
  const selectedCommercial = availableCommercials.find((commercial) => commercial.id === selectedCommercialId);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    Promise.all([api.listTeams(), api.listCommerciaux()])
      .then(([loadedTeams, loadedCommercials]) => {
        if (cancelled) return;
        setTeams(loadedTeams);
        setCommerciaux(loadedCommercials);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Impossible de charger les équipes et commerciaux");
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    if (!availableCommercials.some((commercial) => commercial.id === selectedCommercialId)) {
      setSelectedCommercialId("");
      setResult(null);
    }
  }, [availableCommercials, selectedCommercialId]);

  const changeTeam = async (nextTeamId: string) => {
    setError(null);
    setResult(null);
    setSelectedCommercialId("");
    setSwitchingTeam(true);
    try {
      const response = await api.switchTeam(nextTeamId || null);
      if (!response.success) throw new Error("Le changement d'équipe a échoué");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le changement d'équipe a échoué");
      setSwitchingTeam(false);
    }
  };

  const runDiagnostic = async () => {
    if (!selectedCommercialId || !teamId || !selectedCommercial) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const [adminResult, commercialResult] = await Promise.all([
        api.listPointsVenteForDiagnostic(selectedCommercialId),
        api.diagnoseCommercialPointsVente(selectedCommercialId),
      ]);
      const adminAssignedPoints = adminResult.data;
      const commercialSectorIds = new Set(commercialResult.commercial.secteurs.map((sector) => sector.id));
      const adminSectors = [...new Set(selectedCommercial?.tournees?.map((tournee) => tournee.secteur_id) || [])].sort();
      const commercialSectors = [...commercialSectorIds].sort();
      const assignmentMismatch = adminSectors.length !== commercialSectors.length
        || adminSectors.some((sectorId, index) => sectorId !== commercialSectors[index]);
      const adminById = new Map<string, PointVente>();
      const commercialIds = new Set(commercialResult.points.map((point) => point.id));
      for (const point of adminAssignedPoints) adminById.set(point.id, point);
      const common = [...adminById.values()].filter((point) => commercialIds.has(point.id));
      const adminOnly = [...adminById.values()].filter((point) => !commercialIds.has(point.id));
      const commercialOnly = commercialResult.points.filter((point) => !adminById.has(point.id));
      setResult({
        adminPoints: adminAssignedPoints,
        adminPagination: adminResult.pagination,
        commercial: commercialResult,
        comparison: {
          common,
          adminOnly,
          commercialOnly,
          adminDuplicateIds: duplicateIds(adminAssignedPoints.map((point) => point.id)),
          commercialDuplicateIds: duplicateIds(commercialResult.points.map((point) => point.id)),
          adminSectorIds: adminSectors,
          commercialSectorIds: commercialSectors,
          assignmentMismatch,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le diagnostic n'a pas pu être exécuté");
    } finally {
      setRunning(false);
    }
  };

  const { adminPoints, commercial, comparison, adminPagination } = result || {};
  const difference = adminPoints && commercial ? commercial.points.length - adminPoints.length : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck size={24} className="text-primary-700" />
          Diagnostic de cohérence des POS
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Comparaison en lecture seule par ID entre la liste d'administration et le périmètre réel des tournées du commercial.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">Équipe</span>
            <select
              className="input"
              value={teamId || ""}
              disabled={loadingOptions || switchingTeam || !isSuperAdmin}
              onChange={(event) => void changeTeam(event.target.value)}
            >
              <option value="" disabled>Choisir une équipe</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.code} — {team.name}</option>)}
            </select>
            {!isSuperAdmin && <span className="mt-1 block text-xs text-gray-500">L'équipe est imposée par votre compte administrateur.</span>}
            {switchingTeam && <span className="mt-1 block text-xs text-gray-500">Changement d'équipe…</span>}
          </label>
          <label className="block">
            <span className="label">Commercial</span>
            <select
              className="input"
              value={selectedCommercialId}
              disabled={!teamId || loadingOptions || switchingTeam}
              onChange={(event) => {
                setSelectedCommercialId(event.target.value);
                setResult(null);
              }}
            >
              <option value="">Sélectionner un commercial</option>
              {availableCommercials.map((commercial) => (
                <option key={commercial.id} value={commercial.id}>{commercial.full_name} — {commercial.identifiant}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="btn-primary"
          onClick={() => void runDiagnostic()}
          disabled={!teamId || !selectedCommercialId || running || loadingOptions || switchingTeam}
        >
          <Search size={16} />
          {running ? "Comparaison en cours…" : "Lancer la comparaison"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
          {error}
        </div>
      )}

      {result && commercial && comparison && adminPoints && adminPagination && (
        <>
          <section className="card p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Contexte d'affectation</h2>
              <p className="mt-1 text-sm text-gray-600">
                Commercial : {commercial.commercial.full_name} ({commercial.commercial.id}) · Équipe : {unavailable(commercial.commercial.team_code)} ({unavailable(commercial.commercial.team_id)})
              </p>
              <p className="text-sm text-gray-600">
                Superviseur : {unavailable(commercial.commercial.superviseur_nom)} ({unavailable(commercial.commercial.superviseur_id)})
              </p>
              <p className="text-sm text-gray-600">
                Secteurs / tournées affectés : {commercial.commercial.secteurs.length
                  ? commercial.commercial.secteurs.map((sector) => `${sector.nom || "Sans nom"} (${sector.id}; ${sector.code || "sans code"})`).join(", ")
                  : "Aucune tournée affectée"}
              </p>
              <p className="text-sm text-gray-600">
                Secteurs retournés par l'administration : {selectedCommercial?.tournees?.length
                  ? selectedCommercial.tournees.map((sector) => `${sector.nom || "Sans nom"} (${sector.secteur_id}; ${sector.code || "sans code"})`).join(", ")
                  : "Aucune tournée affectée"}
              </p>
              {activeTeam && <p className="text-xs text-gray-500">Équipe d'administration active : {activeTeam.code} ({activeTeam.id})</p>}
              {!activeTeam && <p className="text-xs text-gray-500">Équipe d'administration active : {unavailable(teamCode)}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["TOTAL ADMINISTRATION", adminPoints.length],
                ["TOTAL COMPTE COMMERCIAL", commercial.points.length],
                ["ÉCART (commercial − admin)", `${difference > 0 ? "+" : ""}${difference}`],
                ["POS COMMUNS", comparison.common.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PaginationSummary label="Administration — POS affectés (GET /points-vente)" pagination={adminPagination} />
              <PaginationSummary label="Compte commercial" pagination={commercial.pagination} />
            </div>
            <p className="text-xs text-gray-500">
              POS d'administration après application du filtre commercial de l'écran de gestion : {adminPoints.length}.
            </p>
            <p className="text-xs text-gray-500">
              Le filtre d'administration utilise les secteurs retournés pour ce commercial par `GET /commerciaux`, comme dans `AdminPointsVente`. La liste commerciale utilise la même fonction de récupération que `GET /mes-points-vente`, exécutée via une route de diagnostic admin autorisée et limitée à l'équipe active.
            </p>
            {comparison.assignmentMismatch && (
              <div role="alert" className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
                Les API ne retournent pas les mêmes secteurs affectés. Administration : {comparison.adminSectorIds.join(", ") || "aucun"} · Compte commercial : {comparison.commercialSectorIds.join(", ") || "aucun"}.
              </div>
            )}
          </section>

          <DifferenceTable title={`POS uniquement Administration (${comparison.adminOnly.length})`} points={comparison.adminOnly} teams={teams} />
          <DifferenceTable title={`POS uniquement Compte commercial (${comparison.commercialOnly.length})`} points={comparison.commercialOnly} teams={teams} />

          {(comparison.adminDuplicateIds.length > 0 || comparison.commercialDuplicateIds.length > 0) && (
            <div role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> IDs POS répétés dans les réponses</p>
              <p className="mt-2">Administration : {comparison.adminDuplicateIds.join(", ") || "aucun"}</p>
              <p>Compte commercial : {comparison.commercialDuplicateIds.join(", ") || "aucun"}</p>
            </div>
          )}
        </>
      )}

      {running && <div className="flex items-center gap-2 text-sm text-gray-500"><RefreshCw size={16} className="animate-spin" /> Récupération complète des listes…</div>}
    </div>
  );
}

function DifferenceTable({
  title,
  points,
  teams,
}: {
  title: string;
  points: (PointVente | CommercialPointsVenteDiagnostic["points"][number])[];
  teams: Team[];
}) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-gray-100 px-5 py-4 text-lg font-bold text-gray-900">{title}</h2>
      {points.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">Aucun POS dans cette catégorie.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {["ID", "Code", "Nom", "Secteur", "Équipe", "Active", "Created_by", "Created_by_role", "Created_at"].map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {points.map((point) => (
                <tr key={point.id} className="align-top text-gray-700">
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{point.id}</td>
                  <td className="whitespace-nowrap px-3 py-3">{unavailable(point.code)}</td>
                  <td className="min-w-40 px-3 py-3">{unavailable(point.name)}</td>
                  <td className="min-w-36 px-3 py-3">
                    {unavailable(point.secteur_nom)}
                    {point.secteur_id && <span className="block font-mono text-gray-400">{point.secteur_id}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {point.team_id
                      ? `${teams.find((team) => team.id === point.team_id)?.code || "Équipe inconnue"} (${point.team_id})`
                      : "Non disponible"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{point.active == null ? "Non disponible" : point.active ? "Oui" : "Non"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{unavailable(point.created_by)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{unavailable(point.created_by_role)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{unavailable(point.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
