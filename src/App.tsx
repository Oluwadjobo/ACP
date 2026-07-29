import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminCommerciaux } from "@/pages/admin/AdminCommerciaux";
import { AdminSuperviseurs } from "@/pages/admin/AdminSuperviseurs";
import { AdminAdmins } from "@/pages/admin/AdminAdmins";
import { AdminProduits } from "@/pages/admin/AdminProduits";
import { AdminPointsVente } from "@/pages/admin/AdminPointsVente";
import { FieldScanner } from "@/pages/commercial/FieldScanner";
import { FieldHistory } from "@/pages/commercial/FieldHistory";
import type { UserType } from "@/types";

const fieldHome: Record<string, string> = {
  commercial: "/commercial",
  superviseur: "/superviseur",
};

function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow: UserType }) {
  const { token, userType, mustChangePassword, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  if (mustChangePassword) return <ChangePasswordPage />;
  if (userType !== allow) return <Navigate to={userType === "admin" ? "/admin" : fieldHome[userType!] || "/"} replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { token, userType, mustChangePassword, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (token && userType) {
    if (mustChangePassword) return <ChangePasswordPage />;
    return <Navigate to={userType === "admin" ? "/admin" : fieldHome[userType] || "/"} replace />;
  }
  return <LoginPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute allow="admin"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/commerciaux" element={<ProtectedRoute allow="admin"><AdminLayout><AdminCommerciaux /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/superviseurs" element={<ProtectedRoute allow="admin"><AdminLayout><AdminSuperviseurs /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/admins" element={<ProtectedRoute allow="admin"><AdminLayout><AdminAdmins /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/produits" element={<ProtectedRoute allow="admin"><AdminLayout><AdminProduits /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/points-vente" element={<ProtectedRoute allow="admin"><AdminLayout><AdminPointsVente /></AdminLayout></ProtectedRoute>} />

      {/* Commercial routes */}
      <Route path="/commercial" element={<ProtectedRoute allow="commercial"><FieldScanner /></ProtectedRoute>} />
      <Route path="/commercial/historique" element={<ProtectedRoute allow="commercial"><FieldHistory /></ProtectedRoute>} />

      {/* Superviseur routes */}
      <Route path="/superviseur" element={<ProtectedRoute allow="superviseur"><FieldScanner /></ProtectedRoute>} />
      <Route path="/superviseur/historique" element={<ProtectedRoute allow="superviseur"><FieldHistory /></ProtectedRoute>} />

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
