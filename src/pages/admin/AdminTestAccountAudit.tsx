import { useState } from "react";
import { AlertTriangle, ClipboardCheck, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { TestAccountDataAudit } from "@/types";

const relationLabels: Record<string, string> = {
  commercial_tournees: "Affectations commerciales",
  team_leader_tournees: "Affectations superviseur",
  visites: "Visites",
  ventes: "Ventes",
  commandes: "Commandes",
  livraisons: "Livraisons",
  bons_livraison: "Bons de livraison",
  promesses_achat: "Promesses d'achat",
  controles_terrain: "Contrôles terrain",
  commercial_agent_livreur: "Associations commerciaux / livreurs",
  sessions: "Sessions (sans jeton)",
  commande_lignes: "Lignes de commande",
  commande_status_history: "Historique des commandes",
  vente_lignes: "Lignes de vente",
  bl_lignes: "Lignes de bons de livraison",
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Non disponible";
  return String(value);
}

export function AdminTestAccountAudit() {
  const [report, setReport] = useState<TestAccountDataAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      setReport(await api.auditTestAccountData());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'audit n'a pas pu être exécuté");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardCheck size={24} className="text-primary-700" />
          Audit des anciens comptes de test
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Rapport en lecture seule pour togni.eau, comeautest et Togni. Aucun enregistrement ne sera modifié ni supprimé.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <div role="note" className="flex gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            Une valeur <code>created_by</code> n'est pas une preuve de création : les POS antérieurs à la migration de backfill sont signalés comme incertains. La route n'expose aucun secret et ne propose aucune suppression.
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={() => void runAudit()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? "Lecture des données…" : "Lancer l'audit en lecture seule"}
        </button>
        {error && <p role="alert" className="text-sm text-error-700">{error}</p>}
      </section>

      {report && (
        <>
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">Profils correspondants</h2>
            {report.targets.map(({ target, profiles }) => (
              <div key={target} className="border-b border-gray-100 pb-3 last:border-0">
                <h3 className="font-semibold text-gray-800">{target}</h3>
                {profiles.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-500">Aucun profil exact correspondant trouvé.</p>
                ) : profiles.map((profile) => (
                  <p key={`${profile.profile_type}:${profile.id}`} className="mt-1 break-all text-sm text-gray-600">
                    {display(profile.profile_type)} · ID {display(profile.id)} · {display(profile.full_name)} · identifiant {display(profile.identifiant ?? profile.email)} · équipe {display(profile.team_id)}
                  </p>
                ))}
              </div>
            ))}
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-gray-100 px-5 py-4 text-lg font-bold text-gray-900">
              POS directement liés ({report.points.length})
            </h2>
            {report.points.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">Aucun POS directement relié par créateur ou activité retrouvée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>{["ID", "Nom / code", "Créé le", "Équipe", "Secteur", "created_by / rôle", "Visites", "Décision", "Origine"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.points.map((point) => (
                      <tr key={String(point.id)} className="align-top text-gray-700">
                        <td className="whitespace-nowrap px-3 py-3 font-mono">{display(point.id)}</td>
                        <td className="px-3 py-3">{display(point.name)}<span className="block text-gray-400">{display(point.code)}</span></td>
                        <td className="whitespace-nowrap px-3 py-3">{display(point.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{display(point.team_id)}</td>
                        <td className="px-3 py-3">{display((point.secteur as Record<string, unknown> | null)?.nom)}<span className="block font-mono text-gray-400">{display(point.secteur_id)}</span></td>
                        <td className="px-3 py-3 font-mono">{display(point.created_by)}<span className="block font-sans">{display(point.created_by_role)}</span></td>
                        <td className="px-3 py-3">{point.visits.length}</td>
                        <td className="px-3 py-3 font-semibold text-warning-800">{point.decision}</td>
                        <td className="min-w-64 px-3 py-3">{point.origin_assessment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="card p-5">
            <summary className="cursor-pointer font-semibold text-gray-900">
              POS dans les secteurs affectés (contexte, non preuve de données de test) — {report.assignments.assigned_sector_points.length}
            </summary>
            <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all text-xs text-gray-700">
              {JSON.stringify(report.assignments, null, 2)}
            </pre>
          </details>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Relations métier trouvées</h2>
            {Object.entries(report.related_data).map(([key, rows]) => (
              <details className="card p-4" key={key}>
                <summary className="cursor-pointer font-semibold text-gray-800">
                  {relationLabels[key] || key} — {rows.length}
                </summary>
                <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-all text-xs text-gray-700">
                  {JSON.stringify(rows, null, 2)}
                </pre>
              </details>
            ))}
          </section>

          <p className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">{report.note}</p>
        </>
      )}
    </div>
  );
}
