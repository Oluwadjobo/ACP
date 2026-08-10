import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { UserType, AdminRole, Permissions } from "@/types";

interface AuthState {
  token: string | null;
  userType: UserType | null;
  fullName: string | null;
  userId: string | null;
  teamId: string | null;
  role: AdminRole | UserType | null;
  permissions: Permissions | null;
  mustChangePassword: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: { login: string; password: string; teamCode?: string }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
  switchTeam: (teamId: string | null) => Promise<void>;
  hasPermission: (p: string) => boolean;
  isSuperAdmin: boolean;
}

interface LoginResult {
  userType: string;
  mustChangePassword?: boolean;
  teamId: string | null;
  role: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userType: null,
    fullName: null,
    userId: null,
    teamId: null,
    role: null,
    permissions: null,
    mustChangePassword: false,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem("session_token");
    if (!token) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    api
      .me()
      .then((data) => {
        setState({
          token,
          userType: data.userType as UserType,
          fullName: data.fullName,
          userId: data.userId,
          teamId: data.teamId ?? null,
          role: data.role as AdminRole | UserType,
          permissions: data.permissions as Permissions,
          mustChangePassword: false,
          loading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem("session_token");
        setState({ token: null, userType: null, fullName: null, userId: null, teamId: null, role: null, permissions: null, mustChangePassword: false, loading: false });
      });
  }, []);

  const login = async (credentials: { login: string; password: string; teamCode?: string }): Promise<LoginResult> => {
    const data = await api.login(credentials);
    localStorage.setItem("session_token", data.token);
    setState({
      token: data.token,
      userType: data.userType as UserType,
      fullName: data.fullName,
      userId: data.userId,
      teamId: data.teamId ?? null,
      role: data.role as AdminRole | UserType,
      permissions: data.permissions as Permissions,
      mustChangePassword: data.mustChangePassword ?? false,
      loading: false,
    });
    return { userType: data.userType, mustChangePassword: data.mustChangePassword, teamId: data.teamId ?? null, role: data.role };
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("session_token");
    setState({ token: null, userType: null, fullName: null, userId: null, teamId: null, role: null, permissions: null, mustChangePassword: false, loading: false });
  };

  const clearMustChangePassword = () => {
    setState((s) => ({ ...s, mustChangePassword: false }));
  };

  const switchTeam = async (teamId: string | null) => {
    try {
      await api.switchTeam(teamId);
      setState((s) => ({ ...s, teamId }));
    } catch {
      // ignore — team switch failed
    }
  };

  const isSuperAdmin = state.userType === "admin" && state.role === "super_admin";

  // Dynamic theming: set data-team attribute on <html> for CSS variable theming
  useEffect(() => {
    const applyTheme = (teamCode: string | null) => {
      if (teamCode === "EAU") {
        document.documentElement.setAttribute("data-team", "EAU");
      } else {
        document.documentElement.removeAttribute("data-team");
      }
    };

    if (state.teamId) {
      api.listTeams().then((teams) => {
        const team = teams.find((t) => t.id === state.teamId);
        applyTheme(team?.code || null);
      }).catch(() => applyTheme(null));
    } else {
      applyTheme(null);
    }
  }, [state.teamId]);

  const hasPermission = (p: string): boolean => {
    if (state.userType === "admin") return true;
    return state.permissions?.[p as keyof Permissions] === true;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearMustChangePassword, switchTeam, hasPermission, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
