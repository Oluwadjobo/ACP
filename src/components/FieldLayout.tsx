import { type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, ScanLine, History, MapPin, Store, Search, LogOut, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Permission } from "@/types";

interface FieldNavItem {
  path: string;
  label: string;
  icon: typeof ScanLine;
  permission?: Permission;
}

const commercialNavItems: FieldNavItem[] = [
  { path: "/commercial", label: "Scanner", icon: ScanLine, permission: "scan" },
  { path: "/commercial/historique", label: "Mes visites", icon: History, permission: "view_history" },
  { path: "/commercial/tournees", label: "Mes tournées", icon: MapPin },
  { path: "/commercial/points-vente", label: "Mes points de vente", icon: Store },
  { path: "/commercial/recherche", label: "Rechercher un point de vente", icon: Search, permission: "search_point_vente" },
];

export function FieldLayout({ children }: { children: ReactNode }) {
  const { fullName, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const visibleItems = commercialNavItems.filter((item) => !item.permission || hasPermission(item.permission));

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleNavigate = (path: string) => {
    navigate(path);
    closeDrawer();
  };

  const handleLogout = async () => {
    closeDrawer();
    await logout();
    window.location.href = "/";
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (drawerOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [drawerOpen]);

  const isActive = (path: string) => {
    if (path === "/commercial") return location.pathname === "/commercial";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Ouvrir le menu"
            aria-expanded={drawerOpen}
            aria-controls="field-drawer"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <ScanLine size={20} />
            <span className="font-bold text-sm">Contrôle Présence</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold">
            {fullName?.charAt(0).toUpperCase() || "C"}
          </div>
        </div>
      </header>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Sliding drawer */}
      <div
        ref={drawerRef}
        id="field-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className={`fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-primary-900 text-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 flex-shrink-0">
              <ScanLine size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">Espace Commercial</h2>
              <p className="text-primary-300 text-xs truncate">{fullName}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={closeDrawer}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors min-h-[48px] ${
                  active ? "bg-white/15 text-white" : "text-primary-200 hover:bg-white/5 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon size={20} className="flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {active && <ChevronLeft size={16} className="text-white/60 flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-primary-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-primary-200 hover:bg-white/5 hover:text-white transition-colors min-h-[48px]"
          >
            <LogOut size={20} />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
