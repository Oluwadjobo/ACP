import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Store, LogOut, MapPin, UserCog, Package, Shield, Map as MapIcon, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { path: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/admin/carte", label: "Carte", icon: MapIcon },
  { path: "/admin/secteurs", label: "Tournées", icon: MapPin },
  { path: "/admin/commerciaux", label: "Commerciaux", icon: Users },
  { path: "/admin/superviseurs", label: "Team Leaders", icon: UserCog },
  { path: "/admin/admins", label: "Administrateurs", icon: Shield },
  { path: "/admin/produits", label: "Produits", icon: Package },
  { path: "/admin/points-vente", label: "Points de vente", icon: Store },
  { path: "/admin/bons-livraison", label: "Bons de livraison", icon: FileText },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { fullName, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-primary-900 text-white fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-primary-800">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
            <MapPin size={22} />
          </div>
          <div>
            <h1 className="text-sm font-bold">Contrôle Présence</h1>
            <p className="text-primary-300 text-xs">Espace Administrateur</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  active ? "bg-white/15 text-white" : "text-primary-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-primary-800">
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold">
              {fullName?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fullName}</p>
              <p className="text-primary-300 text-xs">Administrateur</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-primary-200 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut size={20} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={20} />
          <span className="font-bold text-sm">Contrôle Présence</span>
        </div>
        <button onClick={handleLogout} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg">
          <LogOut size={20} />
        </button>
      </div>

      {/* Mobile bottom nav - scrollable */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex overflow-x-auto scrollbar-thin">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 min-w-[64px] flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? "text-primary-700" : "text-gray-400"
              }`}
            >
              <item.icon size={22} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
