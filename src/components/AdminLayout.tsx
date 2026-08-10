import { type ReactNode, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Store, LogOut, MapPin, UserCog, Package, Shield, Map as MapIcon, FileText, ChevronDown, Check, Globe, Droplets, Milk } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Permission, Team } from "@/types";

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
}

const allNavItems: NavItem[] = [
  { path: "/admin", label: "Tableau de bord", icon: LayoutDashboard, permission: "view_dashboard" },
  { path: "/admin/carte", label: "Carte", icon: MapIcon, permission: "view_carte" },
  { path: "/admin/secteurs", label: "Tournées", icon: MapPin, permission: "manage_secteurs" },
  { path: "/admin/commerciaux", label: "Commerciaux", icon: Users, permission: "manage_commerciaux" },
  { path: "/admin/superviseurs", label: "Team Leaders", icon: UserCog, permission: "manage_superviseurs" },
  { path: "/admin/admins", label: "Administrateurs", icon: Shield, permission: "manage_admins" },
  { path: "/admin/produits", label: "Produits", icon: Package, permission: "manage_produits" },
  { path: "/admin/points-vente", label: "Points de vente", icon: Store, permission: "manage_points_vente" },
  { path: "/admin/bons-livraison", label: "Bons de livraison", icon: FileText, permission: "manage_bons_livraison" },
];

const TEAM_LABELS: Record<string, string> = {
  YAOURT: "Yaourt Team",
  EAU: "Eau Team",
};

const TEAM_ICONS: Record<string, typeof Milk> = {
  YAOURT: Milk,
  EAU: Droplets,
};

export function AdminLayout({ children }: { children: ReactNode }) {
  const { fullName, logout, hasPermission, isSuperAdmin, teamId, switchTeam } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showTeamSwitcher, setShowTeamSwitcher] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      api.listTeams().then(setTeams).catch(() => {});
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowTeamSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navItems = allNavItems.filter((item) => hasPermission(item.permission));

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleTeamSwitch = async (newTeamId: string | null) => {
    setShowTeamSwitcher(false);
    await switchTeam(newTeamId);
    // Reload current page to refresh data
    navigate(location.pathname, { replace: true });
    window.location.reload();
  };

  const activeTeam = teams.find((t) => t.id === teamId);
  const activeTeamCode = activeTeam?.code || "";
  const activeTeamLabel = activeTeam ? TEAM_LABELS[activeTeam.code] || activeTeam.name : "Vue globale";
  const ActiveTeamIcon = activeTeam ? TEAM_ICONS[activeTeam.code] || Milk : Globe;

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

        {/* Team indicator / switcher */}
        <div className="px-3 pt-4 pb-2 border-b border-primary-800">
          {isSuperAdmin ? (
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setShowTeamSwitcher(!showTeamSwitcher)}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <ActiveTeamIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary-300">Équipe active</p>
                  <p className="text-sm font-semibold truncate">{activeTeamLabel}</p>
                </div>
                <ChevronDown size={16} className={`text-primary-300 transition-transform ${showTeamSwitcher ? "rotate-180" : ""}`} />
              </button>
              {showTeamSwitcher && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-scale-in">
                  <button
                    onClick={() => handleTeamSwitch(null)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Globe size={16} className="text-gray-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 flex-1">Vue globale</span>
                    {!teamId && <Check size={16} className="text-primary-600" />}
                  </button>
                  {teams.map((t) => {
                    const TeamIcon = TEAM_ICONS[t.code] || Milk;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleTeamSwitch(t.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.color + "15" }}>
                          <TeamIcon size={16} style={{ color: t.color }} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 flex-1">{TEAM_LABELS[t.code] || t.name}</span>
                        {teamId === t.id && <Check size={16} className="text-primary-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-white/5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <ActiveTeamIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary-300">Équipe</p>
                <p className="text-sm font-semibold truncate">{activeTeamLabel}</p>
              </div>
            </div>
          )}
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
              <p className="text-primary-300 text-xs">{isSuperAdmin ? "Super Administrateur" : "Administrateur"}</p>
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-primary-300">{activeTeamLabel}</span>
          <button onClick={handleLogout} className="btn-ghost text-white hover:bg-white/10 p-2 rounded-lg">
            <LogOut size={20} />
          </button>
        </div>
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
