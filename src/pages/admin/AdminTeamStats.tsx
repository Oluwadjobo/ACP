import { useEffect, useState } from "react";
import { Store, Users, TrendingUp, Package, Truck, ClipboardCheck, BarChart3, UserCog, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/api";
import type { TeamStats } from "@/types";

export function AdminTeamStats() {
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTeamStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  }

  if (!stats) {
    return <div className="text-center py-20 text-gray-500">Aucune donnée disponible</div>;
  }

  const totalCards = [
    { label: "Points de vente", value: stats.totals.points_vente, icon: Store, color: "bg-accent-50 text-accent-700", ring: "ring-accent-100" },
    { label: "Visites totales", value: stats.totals.visites, icon: Users, color: "bg-primary-50 text-primary-700", ring: "ring-primary-100" },
    { label: "Ventes totales", value: stats.totals.ventes, icon: TrendingUp, color: "bg-success-50 text-success-600", ring: "ring-success-100" },
    { label: "Commandes", value: stats.totals.commandes, icon: Package, color: "bg-blue-50 text-blue-700", ring: "ring-blue-100" },
    { label: "Livraisons", value: stats.totals.livraisons, icon: Truck, color: "bg-secondary-50 text-secondary-700", ring: "ring-secondary-100" },
    { label: "Contrôles terrain", value: stats.totals.controles, icon: ClipboardCheck, color: "bg-warning-50 text-warning-600", ring: "ring-warning-100" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statistiques équipe</h1>
        <p className="text-gray-500 text-sm mt-1">Aperçu des performances par membre de l'équipe</p>
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {totalCards.map((card, i) => (
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
