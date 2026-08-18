import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TeamSelectionPage } from "@/pages/TeamSelectionPage";
import { LoginPage } from "@/pages/LoginPage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminCommerciaux } from "@/pages/admin/AdminCommerciaux";
import { AdminSuperviseurs } from "@/pages/admin/AdminSuperviseurs";
import { AdminAdmins } from "@/pages/admin/AdminAdmins";
import { AdminProduits } from "@/pages/admin/AdminProduits";
import { AdminPointsVente } from "@/pages/admin/AdminPointsVente";
import { AdminCarte } from "@/pages/admin/AdminCarte";
import { AdminSecteurs } from "@/pages/admin/AdminSecteurs";
import { AdminBonsLivraison } from "@/pages/admin/AdminBonsLivraison";
import { AdminAgentsLivreur } from "@/pages/admin/AdminAgentsLivreur";
import { AdminCommandes } from "@/pages/admin/AdminCommandes";
import { FieldScanner } from "@/pages/commercial/FieldScanner";
import { FieldHistory } from "@/pages/commercial/FieldHistory";
import { SuperviseurVentesNonRealisees } from "@/pages/superviseur/SuperviseurVentesNonRealisees";
import { SuperviseurControleTerrain } from "@/pages/superviseur/SuperviseurControleTerrain";
import { AgentLivreurCommandes } from "@/pages/agent_livreur/AgentLivreurCommandes";
import { AgentLivreurHistorique } from "@/pages/agent_livreur/AgentLivreurHistorique";
import { PointVenteSearch } from "@/pages/shared/PointVenteSearch";
import { ShieldAlert } from "lucide-react";
import type { UserType, Permission } from "@/types";

const fieldHome: Record<string, string> = {
  commercial: "/commercial",
  superviseur: "/superviseur",
  agent_livreur: "/agent-livreur",
};

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

function NoAccessPage() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-error-50 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} className="text-error-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Accès refusé</h1>
        <p className="text-gray-500 text-sm mb-6">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page. Contactez votre administrateur.
        </p>
        <button onClick={() => logout()} className="btn-primary">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allow, permission }: { children: React.ReactNode; allow: UserType; permission?: Permission }) {
  const { token, userType, mustChangePassword, loading, hasPermission } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!token) return <Navigate to="/" replace />;
  if (mustChangePassword) return <ChangePasswordPage />;
  if (userType !== allow) return <Navigate to={userType === "admin" ? "/admin" : fieldHome[userType!] || "/"} replace />;
  if (permission && !hasPermission(permission)) return <NoAccessPage />;
  return <>{children}</>;
}

function RootRedirect() {
  const { token, userType, mustChangePassword, loading, hasPermission } = useAuth();
  if (loading && token) return <LoadingScreen />;
  if (token && userType) {
    if (mustChangePassword) return <ChangePasswordPage />;
    if (userType === "admin") return <Navigate to="/admin" replace />;
    if (userType === "agent_livreur") {
      if (hasPermission("view_commandes_livraison")) return <Navigate to="/agent-livreur" replace />;
      if (hasPermission("view_historique_livraisons")) return <Navigate to="/agent-livreur/historique" replace />;
      if (hasPermission("search_point_vente")) return <Navigate to="/agent-livreur/recherche" replace />;
      return <NoAccessPage />;
    }
    if (hasPermission("scan")) return <Navigate to={fieldHome[userType] || "/"} replace />;
    if (hasPermission("view_history")) return <Navigate to={`${fieldHome[userType] || ""}/historique`} replace />;
    if (userType === "superviseur" && hasPermission("view_ventes_non_realisees")) return <Navigate to="/superviseur/ventes-non-realisees" replace />;
    if (userType === "superviseur" && hasPermission("control_terrain")) return <Navigate to="/superviseur/controle-terrain" replace />;
    if (hasPermission("search_point_vente")) return <Navigate to={`${fieldHome[userType] || ""}/recherche`} replace />;
    return <NoAccessPage />;
  }
  return <TeamSelectionPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login/:team" element={<LoginPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute allow="admin" permission="view_dashboard"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/carte" element={<ProtectedRoute allow="admin" permission="view_carte"><AdminLayout><AdminCarte /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/secteurs" element={<ProtectedRoute allow="admin" permission="manage_secteurs"><AdminLayout><AdminSecteurs /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/bons-livraison" element={<ProtectedRoute allow="admin" permission="manage_bons_livraison"><AdminLayout><AdminBonsLivraison /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/commerciaux" element={<ProtectedRoute allow="admin" permission="manage_commerciaux"><AdminLayout><AdminCommerciaux /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/superviseurs" element={<ProtectedRoute allow="admin" permission="manage_superviseurs"><AdminLayout><AdminSuperviseurs /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/admins" element={<ProtectedRoute allow="admin" permission="manage_admins"><AdminLayout><AdminAdmins /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/produits" element={<ProtectedRoute allow="admin" permission="manage_produits"><AdminLayout><AdminProduits /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/points-vente" element={<ProtectedRoute allow="admin" permission="manage_points_vente"><AdminLayout><AdminPointsVente /></AdminLayout></ProtectedRoute>} />

      {/* Commercial routes */}
      <Route path="/commercial" element={<ProtectedRoute allow="commercial" permission="scan"><FieldScanner /></ProtectedRoute>} />
      <Route path="/commercial/historique" element={<ProtectedRoute allow="commercial" permission="view_history"><FieldHistory /></ProtectedRoute>} />

      {/* Superviseur routes */}
      <Route path="/superviseur" element={<ProtectedRoute allow="superviseur" permission="scan"><FieldScanner /></ProtectedRoute>} />
      <Route path="/superviseur/historique" element={<ProtectedRoute allow="superviseur" permission="view_history"><FieldHistory /></ProtectedRoute>} />
      <Route path="/superviseur/ventes-non-realisees" element={<ProtectedRoute allow="superviseur" permission="view_ventes_non_realisees"><SuperviseurVentesNonRealisees /></ProtectedRoute>} />
      <Route path="/superviseur/controle-terrain" element={<ProtectedRoute allow="superviseur" permission="control_terrain"><SuperviseurControleTerrain /></ProtectedRoute>} />
      <Route path="/superviseur/recherche" element={<ProtectedRoute allow="superviseur" permission="search_point_vente"><PointVenteSearch /></ProtectedRoute>} />

      {/* Commercial routes - search */}
      <Route path="/commercial/recherche" element={<ProtectedRoute allow="commercial" permission="search_point_vente"><PointVenteSearch /></ProtectedRoute>} />

      {/* Agent livreur routes */}
      <Route path="/agent-livreur" element={<ProtectedRoute allow="agent_livreur" permission="view_commandes_livraison"><AgentLivreurCommandes /></ProtectedRoute>} />
      <Route path="/agent-livreur/historique" element={<ProtectedRoute allow="agent_livreur" permission="view_historique_livraisons"><AgentLivreurHistorique /></ProtectedRoute>} />
      <Route path="/agent-livreur/recherche" element={<ProtectedRoute allow="agent_livreur" permission="search_point_vente"><PointVenteSearch /></ProtectedRoute>} />

      {/* Admin - agent livreur management */}
      <Route path="/admin/agents-livreur" element={<ProtectedRoute allow="admin" permission="manage_agents_livreur"><AdminLayout><AdminAgentsLivreur /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/commandes" element={<ProtectedRoute allow="admin" permission="view_dashboard"><AdminLayout><AdminCommandes /></AdminLayout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
