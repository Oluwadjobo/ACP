import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminCommerciaux } from "@/pages/admin/AdminCommerciaux";
import { AdminPointsVente } from "@/pages/admin/AdminPointsVente";
import { CommercialScanner } from "@/pages/commercial/CommercialScanner";
import { CommercialHistory } from "@/pages/commercial/CommercialHistory";
import type { UserType } from "@/types";

function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow: UserType }) {
  const { token, userType, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  if (userType !== allow) return <Navigate to={userType === "admin" ? "/admin" : "/commercial"} replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { token, userType, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (token && userType) return <Navigate to={userType === "admin" ? "/admin" : "/commercial"} replace />;
  return <LoginPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/admin" element={<ProtectedRoute allow="admin"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/commerciaux" element={<ProtectedRoute allow="admin"><AdminLayout><AdminCommerciaux /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/points-vente" element={<ProtectedRoute allow="admin"><AdminLayout><AdminPointsVente /></AdminLayout></ProtectedRoute>} />
      <Route path="/commercial" element={<ProtectedRoute allow="commercial"><CommercialScanner /></ProtectedRoute>} />
      <Route path="/commercial/historique" element={<ProtectedRoute allow="commercial"><CommercialHistory /></ProtectedRoute>} />
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
