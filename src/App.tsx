import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
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
import { FieldScanner } from "@/pages/commercial/FieldScanner";
import { FieldHistory } from "@/pages/commercial/FieldHistory";
import { SuperviseurVentesNonRealisees } from "@/pages/superviseur/SuperviseurVentesNonRealisees";
import { SuperviseurControleTerrain } from "@/pages/superviseur/SuperviseurControleTerrain";
import { ShieldAlert } from "lucide-react";
import type { UserType, Permission } from "@/types";

const fieldHome: Record<string, string> = {
  commercial: "/commercial",
  superviseur: "/superviseur",
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
  if (loading) return <LoadingScreen />;
  if (token && userType) {
    if (mustChangePassword) return <ChangePasswordPage />;
    if (userType === "admin") return <Navigate to="/admin" replace />;
    if (hasPermission("scan")) return <Navigate to={fieldHome[userType] || "/"} replace />;
    if (hasPermission("view_history")) return <Navigate to={`${fieldHome[userType] || ""}/historique`} replace />;
    if (userType === "superviseur" && hasPermission("view_ventes_non_realisees")) return <Navigate to="/superviseur/ventes-non-realisees" replace />;
    if (userType === "superviseur" && hasPermission("control_terrain")) return <Navigate to="/superviseur/controle-terrain" replace />;
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
